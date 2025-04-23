// AWS API Gateway Endpoints - update these with your actual endpoints
const API_ENDPOINTS = {
    retrieveDownloadUrl: 'https://sw14dz8xh0.execute-api.us-east-1.amazonaws.com/dev/download',
    getPrintJobs: 'https://sw14dz8xh0.execute-api.us-east-1.amazonaws.com/dev/fetch_jobs',
   
};

// Sample data for fallback
const samplePrintJobs = [
    {
        id: 'AC32',
        fileName: 'Experiment_1A.pdf',
        status: 'printed',
        pages: 8,
        amount: 'Rs. 16/-'
    },
    {
        id: 'BD45',
        fileName: 'Assignment_Physics.pdf',
        status: 'pending',
        pages: 12,
        amount: 'Rs. 24/-'
    },
    {
        id: 'CF78',
        fileName: 'Research_Paper.pdf',
        status: 'printed',
        pages: 20,
        amount: 'Rs. 40/-'
    },
    {
        id: 'DG91',
        fileName: 'Lab_Report.pdf',
        status: 'pending',
        pages: 5,
        amount: 'Rs. 10/-'
    },
    {
        id: 'EH12',
        fileName: 'Lecture_Notes.pdf',
        status: 'printed',
        pages: 15,
        amount: 'Rs. 30/-'
    },
    {
        id: 'FI34',
        fileName: 'Project_Proposal.pdf',
        status: 'pending',
        pages: 10,
        amount: 'Rs. 20/-'
    }
];

// DOM elements
const printItemsContainer = document.getElementById('print-items');
const detailsContainer = document.getElementById('details-container');
const printDetailsSection = document.getElementById('print-details');
const noSelectionSection = document.getElementById('no-selection');
const filterButtons = document.querySelectorAll('.filter-btn');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const modal = document.getElementById('modal');
const cancelBtn = document.getElementById('cancel-btn');
const confirmBtn = document.getElementById('confirm-btn');
const loadingSpinner = document.getElementById('loading-spinner') || createLoadingSpinner();

// Current state
let selectedJobId = null;
let currentFilter = 'all';
let currentPrintJobs = [];
let isLoading = false;

// Create loading spinner if it doesn't exist
function createLoadingSpinner() {
    const spinner = document.createElement('div');
    spinner.id = 'loading-spinner';
    spinner.className = 'loading-spinner hidden';
    spinner.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(spinner);
    return spinner;
}

// Show/hide loading spinner
function toggleLoading(show) {
    isLoading = show;
    if (show) {
        loadingSpinner.classList.remove('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
}

// Initialize the application
function init() {
    fetchPrintJobs();
    setupEventListeners();
}

// Extract AWS credentials from cookies or local storage if available
function getAwsCredentials() {
    // This is a placeholder - implement your actual auth mechanism
    // You might get these from cookies, local storage, or a separate auth service
    return {
        accessToken: localStorage.getItem('aws_access_token') || null
    };
}

// Format DynamoDB response
function formatDynamoDBItem(item) {
    // Handle various formats of DynamoDB items
    if (!item) return null;
    
    // If it's already a plain object (API Gateway might transform it)
    if (item.printCode && typeof item.printCode === 'string') {
        return {
            id: item.printCode,
            fileName: item.originalName || 'Unknown File',
            fileKey: item.fileKey || '',
            status: item.status || 'pending',
            pages: item.pages || 0,
            amount: item.amount || 'Rs. 0/-',
            timestamp: item.timestamp || new Date().toISOString()
        };
    }
    
    // If it's in DynamoDB format with type indicators
    return {
        id: item.printCode?.S || item.id?.S || 'Unknown',
        fileName: item.originalName?.S || 'Unknown File',
        fileKey: item.fileKey?.S || '',
        status: item.status?.S || 'pending',
        pages: item.pages?.N ? parseInt(item.pages.N) : 0,
        amount: item.amount?.S || `Rs. ${(item.pages?.N ? parseInt(item.pages.N) * 2 : 0)}/-`,
        timestamp: item.timestamp?.S || new Date().toISOString()
    };
}

// Calculate estimated pages based on file size
function estimatePages(fileSize) {
    // Simple estimation: 1 page ~ 100KB for PDFs
    if (!fileSize) return 1;
    
    const sizeInKB = typeof fileSize === 'string' ? 
        parseInt(fileSize.replace('KB', '').trim()) : fileSize / 1024;
    
    return Math.max(1, Math.ceil(sizeInKB / 100));
}

// Calculate amount based on pages
function calculateAmount(pages) {
    // Rs. 2 per page
    return `Rs. ${pages * 2}/-`;
}

// Fetch print jobs from DynamoDB via API Gateway
async function fetchPrintJobs() {
    toggleLoading(true);
    
    try {
        console.log('Fetching print jobs from API...');
        
        const credentials = getAwsCredentials();
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add auth header if available
        if (credentials.accessToken) {
            headers['Authorization'] = `Bearer ${credentials.accessToken}`;
        }
        
        const response = await fetch(API_ENDPOINTS.getPrintJobs, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) {
            console.error(`API error: ${response.status} ${response.statusText}`);
            throw new Error(`Network response was not ok: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API response:', data);
        
        // Check for DynamoDB format vs API Gateway transformed format
        let jobs = [];
        
        if (data.Items && Array.isArray(data.Items)) {
            // DynamoDB format
            jobs = data.Items.map(formatDynamoDBItem);
        } else if (data.jobs && Array.isArray(data.jobs)) {
            // Custom API format
            jobs = data.jobs.map(formatDynamoDBItem);
        } else if (Array.isArray(data)) {
            // Simple array format
            jobs = data.map(formatDynamoDBItem);
        }
        
        console.log('Transformed jobs:', jobs);
        
        // Update our current jobs - only use sample data if no real data exists
        if (jobs && jobs.length > 0) {
            currentPrintJobs = jobs;
            console.log('Using real data from API');
        } else {
            console.warn('No data from API, falling back to sample data');
            currentPrintJobs = [...samplePrintJobs];
        }
        
        renderPrintItems();
    } catch (error) {
        console.error('Error fetching print jobs:', error);
        // Fallback to sample data if API fails
        console.log('API failed, using sample data');
        currentPrintJobs = [...samplePrintJobs];
        renderPrintItems();
    } finally {
        toggleLoading(false);
    }
}

// Get download URL for a file from S3 via API Gateway
async function getDownloadUrl(printCode) {
    toggleLoading(true);
    
    try {
        console.log(`Getting download URL for print code: ${printCode}`);
        
        const credentials = getAwsCredentials();
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add auth header if available
        if (credentials.accessToken) {
            headers['Authorization'] = `Bearer ${credentials.accessToken}`;
        }
        
        const response = await fetch(API_ENDPOINTS.retrieveDownloadUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ printCode })
        });
        
        if (!response.ok) {
            console.error(`API error: ${response.status} ${response.statusText}`);
            throw new Error(`Failed to get download URL: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Download URL response:', data);
        
        // The response might have different formats depending on your API
        const downloadURL = data.downloadURL || data.url || data;
        
        return downloadURL;
    } catch (error) {
        console.error('Error getting download URL:', error);
        alert('Failed to get download link for this document');
        return null;
    } finally {
        toggleLoading(false);
    }
}

// Update job status
async function updateJobStatus(printCode, status) {
    toggleLoading(true);
    
    try {
        console.log(`Updating job status for ${printCode} to ${status}`);
        
        const credentials = getAwsCredentials();
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Add auth header if available
        if (credentials.accessToken) {
            headers['Authorization'] = `Bearer ${credentials.accessToken}`;
        }
        
        const response = await fetch(API_ENDPOINTS.updateJobStatus, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                printCode, 
                status 
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to update status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Status update response:', data);
        
        return { success: true };
    } catch (error) {
        console.error('Error updating job status:', error);
        return { 
            success: false, 
            error: error.message 
        };
    } finally {
        toggleLoading(false);
    }
}

// Download the file
async function downloadFile(jobId) {
    console.log(`Attempting to download file with ID: ${jobId}`);
    const downloadUrl = await getDownloadUrl(jobId);
    
    if (downloadUrl) {
        console.log(`Download URL obtained: ${downloadUrl}`);
        // Create a temporary link and click it to download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.target = '_blank';
        
        const job = currentPrintJobs.find(job => job.id === jobId);
        link.download = job ? job.fileName : 'download';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        console.error('Failed to get download URL');
        alert('Unable to download the file. Please try again later.');
    }
}

// Render print items based on current filter and search
function renderPrintItems() {
    printItemsContainer.innerHTML = '';
    
    console.log('Rendering print items. Total items:', currentPrintJobs.length);
    console.log('Current filter:', currentFilter);
    console.log('Current search:', searchInput.value);
    
    const filteredJobs = currentPrintJobs.filter(job => {
        const matchesFilter = currentFilter === 'all' || job.status === currentFilter;
        const matchesSearch = job.fileName.toLowerCase().includes(searchInput.value.toLowerCase()) || 
                             job.id.toLowerCase().includes(searchInput.value.toLowerCase());
        return matchesFilter && matchesSearch;
    });
    
    console.log('Filtered jobs:', filteredJobs.length);
    
    if (filteredJobs.length === 0) {
        printItemsContainer.innerHTML = '<div class="no-results">No print jobs found</div>';
        return;
    }
    
    filteredJobs.forEach(job => {
        const printItem = document.createElement('div');
        printItem.className = `print-item ${job.id === selectedJobId ? 'selected' : ''}`;
        printItem.dataset.id = job.id;
        
        const statusIcon = job.status === 'printed' ? 'fa-check-circle' : 'fa-clock';
        
        printItem.innerHTML = `
            <div class="file-header">
                <i class="fas fa-file-pdf file-icon"></i>
                <div class="file-name">${job.fileName}</div>
                <div class="status ${job.status}">
                    <i class="fas ${statusIcon}"></i>
                    ${job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </div>
            </div>
            <div class="file-id">ID: ${job.id}</div>
            <div class="file-details">
                <div class="detail-group">
                    <div class="detail-label">Pages</div>
                    <div class="detail-value">${job.pages || 'N/A'}</div>
                </div>
                <div class="detail-group">
                    <div class="detail-label">Amount</div>
                    <div class="detail-value">${job.amount || 'N/A'}</div>
                </div>
            </div>
        `;
        
        printItemsContainer.appendChild(printItem);
    });
}

// Format timestamp to readable date/time
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch (error) {
        return timestamp;
    }
}

// Render details for selected print job
function renderPrintDetails(jobId) {
    const job = currentPrintJobs.find(job => job.id === jobId);
    
    if (!job) {
        noSelectionSection.style.display = 'flex';
        printDetailsSection.classList.add('hidden');
        return;
    }
    
    noSelectionSection.style.display = 'none';
    printDetailsSection.classList.remove('hidden');
    
    const formattedTimestamp = formatTimestamp(job.timestamp);
    const successMessage = job.status === 'printed' ? 
        `<div class="success-message">
            <i class="fas fa-check-circle"></i>
            Document printed successfully!
        </div>` : '';
    
    printDetailsSection.innerHTML = `
        <div class="detail-header">
            <h3>${job.fileName}</h3>
            <div class="status ${job.status}" style="margin-top: 0.5rem;">
                <i class="fas ${job.status === 'printed' ? 'fa-check-circle' : 'fa-clock'}"></i>
                ${job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </div>
        </div>
        
        ${successMessage}
        
        <div class="detail-row">
            <div class="detail-col">
                <div class="detail-label">Print ID</div>
                <div class="detail-value">${job.id}</div>
            </div>
            <div class="detail-col">
                <div class="detail-label">Pages</div>
                <div class="detail-value">${job.pages || 'N/A'}</div>
            </div>
        </div>
        
        <div class="detail-row">
            <div class="detail-col">
                <div class="detail-label">Amount</div>
                <div class="detail-value">${job.amount || 'N/A'}</div>
            </div>
            <div class="detail-col">
                <div class="detail-label">Timestamp</div>
                <div class="detail-value">${formattedTimestamp}</div>
            </div>
        </div>
        
        <div class="detail-row">
            <div class="detail-col">
                <div class="detail-label">File Key</div>
                <div class="detail-value file-key">${job.fileKey || 'N/A'}</div>
            </div>
        </div>
        
        <div class="print-options">
            <div class="detail-label">Print Options</div>
            <div class="option-row">
                <div class="option-box">Black & White</div>
                <div class="option-box">Collate: Yes</div>
            </div>
        </div>
        
        <div class="action-buttons">
            <button class="print-btn" id="print-document-btn">
                <i class="fas fa-download"></i>
                Download Document
            </button>
            
            ${job.status !== 'printed' ? 
                `<button class="mark-btn" id="mark-printed-btn">
                    <i class="fas fa-check"></i>
                    Mark as Done
                </button>` : 
                `<button class="mark-btn" id="mark-pending-btn">
                    <i class="fas fa-undo"></i>
                    Mark as Pending
                </button>`
            }
        </div>
    `;
    
    // Add event listeners for the action buttons
    const printDocumentBtn = document.getElementById('print-document-btn');
    if (printDocumentBtn) {
        printDocumentBtn.addEventListener('click', () => {
            downloadFile(jobId);
        });
    }
    
    const markPrintedBtn = document.getElementById('mark-printed-btn');
    if (markPrintedBtn) {
        markPrintedBtn.addEventListener('click', () => {
            openModal(job.id, 'printed');
        });
    }
    
    const markPendingBtn = document.getElementById('mark-pending-btn');
    if (markPendingBtn) {
        markPendingBtn.addEventListener('click', () => {
            openModal(job.id, 'pending');
        });
    }
}

// Set up event listeners
function setupEventListeners() {
    // Print item selection
    printItemsContainer.addEventListener('click', (e) => {
        const printItem = e.target.closest('.print-item');
        if (printItem) {
            const jobId = printItem.dataset.id;
            selectPrintItem(jobId);
        }
    });
    
    // Filter buttons
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilter = button.dataset.filter;
            renderPrintItems();
        });
    });
    
    // Search input
    searchInput.addEventListener('input', () => {
        renderPrintItems();
    });
    
    // Refresh button
    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Refreshing...';
        refreshBtn.disabled = true;
        
        fetchPrintJobs().then(() => {
            refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh';
            refreshBtn.disabled = false;
        });
    });
    
    // Modal buttons
    cancelBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', confirmStatusChange);
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape key closes modal
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            closeModal();
        }
        
        // F5 or Ctrl+R for refresh
        if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
            e.preventDefault();
            refreshBtn.click();
        }
    });
}

// Select a print item
function selectPrintItem(jobId) {
    selectedJobId = jobId;
    document.querySelectorAll('.print-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    const selectedItem = document.querySelector(`.print-item[data-id="${jobId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        
        // Scroll item into view if needed
        const container = printItemsContainer;
        const itemRect = selectedItem.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        if (itemRect.bottom > containerRect.bottom) {
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else if (itemRect.top < containerRect.top) {
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    renderPrintDetails(jobId);
}

// Open the confirmation modal
function openModal(jobId, newStatus) {
    modal.classList.add('show');
    confirmBtn.dataset.jobId = jobId;
    confirmBtn.dataset.newStatus = newStatus;
    
    // Update modal content based on status
    const modalTitle = document.querySelector('#modal h2');
    const modalMessage = document.querySelector('#modal p');
    
    if (newStatus === 'printed') {
        modalTitle.textContent = 'Mark as Done';
        modalMessage.textContent = 'Are you sure you want to mark this job as done?';
    } else {
        modalTitle.textContent = 'Mark as Pending';
        modalMessage.textContent = 'Are you sure you want to mark this job as pending?';
    }
}

// Close the confirmation modal
function closeModal() {
    modal.classList.remove('show');
}

// Confirm status change
async function confirmStatusChange() {
    const jobId = confirmBtn.dataset.jobId;
    const newStatus = confirmBtn.dataset.newStatus;
    
    if (!jobId || !newStatus) {
        closeModal();
        return;
    }
    
    // Disable buttons during API call
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    
    // First try to update via API
    const result = await updateJobStatus(jobId, newStatus);
    
    if (result.success) {
        // API update successful
        const jobIndex = currentPrintJobs.findIndex(job => job.id === jobId);
        
        if (jobIndex !== -1) {
            // Update local data
            currentPrintJobs[jobIndex].status = newStatus;
        }
    } else {
        // API update failed, update local data only
        console.warn('API update failed, updating local data only');
        const jobIndex = currentPrintJobs.findIndex(job => job.id === jobId);
        
        if (jobIndex !== -1) {
            currentPrintJobs[jobIndex].status = newStatus;
        }
    }
    
    // Close the modal
    closeModal();
    
    // Re-enable buttons
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    
    // Re-render the UI
    renderPrintItems();
    renderPrintDetails(jobId);
    
    // Show a temporary success message
    const successToast = document.createElement('div');
    successToast.className = 'success-toast';
    successToast.innerHTML = `
        <i class="fas fa-check-circle"></i>
        Job ${newStatus === 'printed' ? 'marked as done' : 'marked as pending'} successfully!
    `;
    document.body.appendChild(successToast);
    
    // Remove the toast after 3 seconds
    setTimeout(() => {
        successToast.classList.add('hide');
        setTimeout(() => {
            document.body.removeChild(successToast);
        }, 300);
    }, 3000);
}

// CSS for loading spinner - add this to your stylesheet
const spinnerStyles = `
.loading-spinner {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.loading-spinner.hidden {
    display: none;
}

.spinner {
    width: 50px;
    height: 50px;
    border: 5px solid #f3f3f3;
    border-top: 5px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.success-toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #4CAF50;
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    opacity: 1;
    transition: opacity 0.3s;
}

.success-toast i {
    margin-right: 10px;
}

.success-toast.hide {
    opacity: 0;
}

.file-key {
    word-break: break-all;
    font-family: monospace;
    font-size: 0.9em;
}
`;

// Add styles programmatically
function addStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = spinnerStyles;
    document.head.appendChild(styleElement);
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    init();
});