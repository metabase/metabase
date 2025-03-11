const https = require('https');

function getLinkedIssues(body) {
  const matches = body.match(
    /(close(s|d)?|fixe?(s|d)?|resolve(s|d)?)(:?) (#|https?:\/\/github\.com\/.+metabase\/issues\/)(\d+)/gi,
  );

  if (matches) {
    return matches.map(m => {
      const numberMatch = m.match(/\d+/);
      return numberMatch ? numberMatch[0] : null;
    });
  }

  return null;
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

export async function link_issues(github) {
  console.log(github);

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
      owner: context.owner,
      repo: context.repo,
      issue_number: prNumber
    }).catch((err) => {
      console.log("error getting prInfo:\n" + err);
    });

    const prUrl = prInfo.html_url;
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

    let linked_issues = getLinkedIssues(prInfo.body);
    console.log(`Linked issues: ${linked_issues}`);

    let newBody = prInfo.body || '';

    // Filter out issue numbers that are already referenced in the PR body:
    let issueNumbersToAdd = [];
    for (const num of issueNumbers) {
      if (!containsIssueReference(newBody, num)) {
        issueNumbersToAdd.push(num);
      }
    }

    if (issueNumbersToAdd.length > 0) {
      // Add references to the beginning of the PR body
      if (newBody.trim()) {
        newBody += '\n\n';
      }

      // Generate closing references
      const closingRefs = issueNumbersToAdd.map(num => `closes #${num}`).join(' ');

      newBody = `<!-- Added by 'Add Issue References to PR' GitHub Action -->${closingRefs}\n\n` + newBody;

      // Update the PR
      const updateData = JSON.stringify({
        body: newBody
      });

      await github.rest.issues.update({
        owner: repoOwner,
        repo: repoName,
        issue_number: prNumber,
        ...JSON.parse(updateData)
      });

      console.log(`Updated PR #${prNumber} with issue references: ${closingRefs}`);
    } else {
      console.log('PR already contains all closing references');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

link_issues(github);
