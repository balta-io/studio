const folderDatabaseName = 'studio-storage';
const folderStoreName = 'settings';

function getFolderDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(folderDatabaseName, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(folderStoreName);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveFolderHandle(directoryHandle) {
    const database = await getFolderDatabase();
    const transaction = database.transaction(folderStoreName, 'readwrite');
    transaction.objectStore(folderStoreName).put(directoryHandle, 'last-valid-folder');
    await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    database.close();
}

async function getSavedFolderHandle() {
    const database = await getFolderDatabase();
    const request = database.transaction(folderStoreName).objectStore(folderStoreName).get('last-valid-folder');
    const directoryHandle = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return directoryHandle;
}

async function saveApplicationFolderHandle(directoryHandle) {
    const database = await getFolderDatabase();
    const transaction = database.transaction(folderStoreName, 'readwrite');
    transaction.objectStore(folderStoreName).put(directoryHandle, 'application-folder');
    await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    database.close();
}

async function getApplicationFolderHandle() {
    const database = await getFolderDatabase();
    const request = database.transaction(folderStoreName).objectStore(folderStoreName).get('application-folder');
    const directoryHandle = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    database.close();
    return directoryHandle;
}
