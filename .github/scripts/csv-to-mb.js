/**
 * jsonData must be in the format:
 * [
 *   { column1: value1, column2: value2, ... },
 *   { column1: value3, column2: value4, ... },
 *   ...
 * ]
 */
function jsonToCsvFormData(jsonData) {
  const formData = new FormData();
  const csvHeader = Object.keys(jsonData[0]).join(',') + '\n';
  const csvContent = jsonData.map(row =>
    Object.values(row).map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csvHeader + csvContent], { type: 'text/csv' });
  formData.append('file', blob, 'data.csv');

  return formData;
}

// Transient failures worth retrying: throttling and server-side errors. A 4xx
// (bad request, auth) won't succeed on retry, so those fail fast.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

class UploadError extends Error {
  constructor(message, { retryable }) {
    super(message);
    this.retryable = retryable;
  }
}

async function attemptUpload(url, jsonData, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        "x-api-key": process.env.API_KEY
      },
      // Rebuilt per attempt: a consumed request body can't be reused.
      body: jsonToCsvFormData(jsonData),
      // Without this the request can hang indefinitely on a stalled server,
      // eating the whole job timeout. An abort surfaces below as a retryable
      // network error, so it retries with backoff instead.
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (networkError) {
    throw new UploadError(networkError.message, { retryable: true });
  }

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => '');
  throw new UploadError(
    `Upload failed: ${response.status} ${response.statusText} ${body}`.trim(),
    { retryable: RETRYABLE_STATUS.has(response.status) }
  );
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Uploads jsonData as CSV, retrying transient API errors with exponential
 * backoff. `retries` is the number of extra attempts after the first (so the
 * default 2 means up to 3 tries). `timeoutMs` is a per-attempt total deadline
 * (default 60s) that aborts a stalled request. Throws the last error once
 * attempts are exhausted or the error is non-retryable.
 */
async function uploadCsvToMb({ baseUrl, tableId, jsonData, mode = 'append', retries = 2, retryDelayMs = 1000, timeoutMs = 60_000 }) {
  const operation = mode === 'replace' ? 'replace-csv' : 'append-csv';
  const url = `${baseUrl}/api/table/${tableId}/${operation}`;

  for (let attempt = 0; ; attempt++) {
    try {
      await attemptUpload(url, jsonData, timeoutMs);
      return { success: true };
    } catch (error) {
      if (!error.retryable || attempt >= retries) {
        throw error;
      }
      const delay = retryDelayMs * 2 ** attempt;
      console.warn(`Upload attempt ${attempt + 1} failed (${error.message}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

module.exports = { uploadCsvToMb };
