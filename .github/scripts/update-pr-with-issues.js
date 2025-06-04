const https = require('https');

function getLinkedIssues(body) {
  const matches = body.match(
    /(close(s|d)?|fixe?(s|d)?|resolve(s|d)?)(:?) (#|https?:\/\/github\.com\/.+metabase\/issues\/)(\d+)/gi,
  );

  if (matches) {
    console.log(`Matches: ${matches}`);
    return matches.map(m => {
      const numberMatch = m.match(/\d+/);
      return numberMatch ? numberMatch[0] : null;
    });
  }

  return [];
}

// Function to make HTTPS requests
function httpsRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            resolve(responseData);
          }
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

// Makes an HTTPS request with exponential backoff retry logic
async function httpsRequestWithBackoff(options, data = null, backoffOptions = {}) {
  // Set default backoff options:
  const {
    maxRetries = 8,
    totalDurationSeconds = 60
  } = backoffOptions;

  let retries = 0;
  let delay = 500; // Start with a .5 second delay

  // Calculate a reasonable initial delay based on total duration and max retries
  // This helps distribute the retry attempts across the total allowed duration
  const totalDurationMs = totalDurationSeconds * 1000;

  // Track the start time
  const startTime = Date.now();

  // Ensure data is stringified if it's an object
  const requestData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;

  while (true) {
    try {
      const response = await httpsRequest(options, requestData);
      return response; // Success: Return the data

    } catch (error) {
      retries++;

      const elapsedMs = Date.now() - startTime;
      const timeRemaining = totalDurationMs - elapsedMs;

      // Stop retrying if we've hit max retries or exceeded the total duration
      if (retries >= maxRetries || timeRemaining <= 0) {
        console.error(`Failed after ${retries} retries (${Math.round(elapsedMs/1000)}s elapsed):`);
        throw error;
      }

      // Calculate the next delay with exponential backoff and jitter
      delay = Math.min(delay * 2 * (0.8 + Math.random() * 0.4), timeRemaining);

      console.log(`Request failed (attempt ${retries}/${maxRetries}). Retrying in ${Math.round(delay)}ms... (${Math.round(timeRemaining/1000)}s remaining)`);

      // Wait for the calculated delay before trying again
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function link_issues(github) {

  try {
    // Get environment variables
    const githubToken = process.env.GITHUB_TOKEN;
    const linearApiKey = process.env.LINEAR_API_KEY;
    const prNumber = process.env.PR_NUMBER;
    const repoOwner = process.env.REPO_OWNER;
    const repoName = process.env.REPO_NAME;

    if (!githubToken || !linearApiKey || !prNumber || !repoOwner || !repoName) {
      console.error('Missing required environment variables');
      process.exit(1);
    }

    // Get PR details from GitHub API
    const prInfo = await github.rest.issues.get({
      owner: repoOwner,
      repo: repoName,
      issue_number: prNumber
    }).catch((err) => {
      console.log("error getting prInfo:\n" + err);
    });

    console.log('PR Info:\n' + JSON.stringify(prInfo, null, 2) + "\n");

    if (prInfo &&
        prInfo.data &&
        prInfo.data.labels &&
        prInfo.data.labels.some(label => label.name === "no-auto-issue-links")) {
      console.log('PR has "no-auto-issue-links" label, skipping...');
      return;
    }

    const prUrl = prInfo.data.html_url;
    console.log(`Processing PR: ${prUrl}`);

    // Query Linear API to find tasks linked to this PR
    const linearQuery = JSON.stringify({
      query: `
        query {
          attachmentsForURL(url: "${prUrl}") {
            nodes {
              issue {
                id
                identifier
                attachments {
                  nodes {url}}}}}}`});

    console.log('--- Linear API query ---');
    console.log(linearQuery);
    console.log('----- End of query -----');

    const linearData = await httpsRequestWithBackoff({
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': linearApiKey
      }
    },
    linearQuery,
    { maxRetries: 8, totalDurationSeconds: 60 });

    console.log('Linear API response:');
    console.log(JSON.stringify(linearData) + "\n");

    if (!linearData.data || !linearData.data.attachmentsForURL || linearData.data.attachmentsForURL.nodes.length === 0) {
      console.log('No Linear tasks linked to this PR');
      return;
    } else {
      console.log(`Found ${linearData.data.attachmentsForURL.nodes.length} linked Linear tasks`);
    }


    // Extract GitHub issue numbers from all attachments in the linked Linear task
    const issueNumbers = [];
    for (const node of linearData.data.attachmentsForURL.nodes) {
      console.log(`checking node task: ${JSON.stringify(node)}`)
      const linearIssue = node.issue;

      for (const attachment of linearIssue.attachments.nodes) {
        const url = attachment.url;
        console.log(`-->  checking url: ${url}`)
        const match = url.match(/github\.com\/metabase\/metabase\/issues\/(\d+)/);
        if (match) {
          console.log(`-->  found match: ${match[1]}`)
          issueNumbers.push(match[1]);
          console.log("")
        }
      }
    }

    console.log(`Found linked GitHub issues: ${JSON.stringify(issueNumbers)}`);

    if (issueNumbers.length === 0) {
      console.log(`Found linked GitHub issues: ${JSON.stringify(issueNumbers)}`);
      console.log('No GitHub issues linked to the Linear task');
      return;
    }

    let body = prInfo.data.body || '';

    let linked_issues = getLinkedIssues(body);
    console.log(`Linked issues: ${linked_issues}`);

    let newBody = body || '';

    let issueNumbersToAdd = issueNumbers.filter(num => !linked_issues.includes(num));

    console.log(`Issue numbers to add: ${issueNumbersToAdd}`);

    if (issueNumbersToAdd.length > 0) {

      // Generate closing references
      const closingRefs = issueNumbersToAdd.map(num => `closes #${num}`).join(' ');

      const messagePreamble = "<!-- Added by 'Add Issue References to PR' GitHub Action. To disable linking, add 'no-auto-issue-links' label to your PR. -->"

      newBody = `${messagePreamble} ${closingRefs}\n` + newBody;

      // Update PR body with new closing references
      await github.rest.issues.update({
        owner: repoOwner,
        repo: repoName,
        issue_number: prNumber,
        body: newBody
      });

      console.log(`Updated PR #${prNumber} with issue references:\n ${closingRefs}`);
    } else {
      console.log('PR already contains all closing references');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {link_issues};
