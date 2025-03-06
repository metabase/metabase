const https = require('https');

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

async function main() {
  console.log("???")
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
    const prData = await httpsRequest({
      hostname: 'api.github.com',
      path: `/repos/${repoOwner}/${repoName}/pulls/${prNumber}`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'Linear-GitHub-Action'
      }
    });

    const prUrl = prData.html_url;
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

    const linearData = await httpsRequest({
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': linearApiKey
      }
    }, linearQuery);

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
        const match = url.match(/github\.com\/.*\/.*\/issues\/(\d+)/);
        if (match) {
          console.log(`-->  found match: ${match[1]}`)
          issueNumbers.push(match[1]);
        }
      }
    }

    console.log(`Found linked GitHub issues: ${JSON.stringify(issueNumbers)}`);

    if (issueNumbers.length === 0) {
      console.log(`Found linked GitHub issues: ${JSON.stringify(issueNumbers)}`);
      console.log('No GitHub issues linked to the Linear task');
      return;
    }

    // Generate closing references
    const closingRefs = issueNumbers.map(num => `closes #${num}`).join(' ');

    // Check if the PR body already contains these references
    let newBody = prData.body || '';

    let shouldUpdate = false;
    for (const num of issueNumbers) {
      if (!newBody.includes(`closes #${num}`) && !newBody.includes(`Closes #${num}`)) {
        shouldUpdate = true;
        break;
      }
    }

    if (shouldUpdate) {
      // Add references to the beginning of the PR body
      if (newBody.trim()) {
        newBody += '\n\n';
      }
      newBody = `<!-- Added by 'Add Issue References to PR' GitHub Action -->\n${closingRefs}\n\n---\n` + newBody;

      // Update the PR
      const updateData = JSON.stringify({
        body: newBody
      });

      await httpsRequest({
        hostname: 'api.github.com',
        path: `/repos/${repoOwner}/${repoName}/pulls/${prNumber}`,
        method: 'PATCH',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${githubToken}`,
          'User-Agent': 'Linear-GitHub-Action',
          'Content-Type': 'application/json',
          'Content-Length': updateData.length
        }
      }, updateData);

      console.log(`Updated PR #${prNumber} with issue references: ${closingRefs}`);
    } else {
      console.log('PR already contains all closing references');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
