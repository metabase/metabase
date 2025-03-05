const github = require('@actions/github');
const core = require('@actions/core');
const axios = require('axios');

async function run() {
  try {
    // Get inputs
    const githubToken = process.env.GITHUB_TOKEN;
    const linearApiKey = process.env.LINEAR_API_KEY;
    const context = github.context;
    const prNumber = context.payload.pull_request.number;

    // Initialize GitHub client
    const octokit = github.getOctokit(githubToken);

    // Get PR details
    const { data: pr } = await octokit.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber
    });

    // Extract potential Linear issue IDs
    const allText = `${pr.title} ${pr.body || ''}`;
    const issueIdMatches = allText.match(/\b([A-Z]+-\d+)\b/g) || [];

    if (issueIdMatches.length === 0) {
      core.setFailed('❌ No Linear issue IDs found in PR title or description');
      return;
    }

    // print debug info:
    console.log(`PR title: ${pr.title}`);
    console.log(`PR body: ${pr.body}`);
    console.log(`Potential issue IDs: ${issueIdMatches.join(', ')}`);


    // Check each ID against Linear API
    const validIssues = [];
    const invalidIssues = [];

    for (const issueId of issueIdMatches) {
      const query = `
        query($id: String!) {
          issue(id: $id) {
            id
            title
          }
        }
      `;

      try {
        const response = await axios({
          url: 'https://api.linear.app/graphql',
          method: 'post',
          headers: {
            'Authorization': `Bearer ${linearApiKey}`,
            'Content-Type': 'application/json'
          },
          data: {
            query,
            variables: { id: issueId }
          }
        });

        if (response.data.data.issue) {
          validIssues.push(response.data.data.issue);
        } else {
          invalidIssues.push(issueId);
        }
      } catch (error) {
        invalidIssues.push(issueId);
      }
    }

    if (validIssues.length === 0) {
      let message = '❌ No valid Linear issues found in PR';
      if (invalidIssues.length > 0) {
        message += '\nFound potential issue IDs that don\'t exist in Linear:\n';
        message += invalidIssues.map(id => `- ${id}`).join('\n');
      }
      core.setFailed(message);
    } else {
      let message = '✅ PR is linked to the following Linear issues:\n';
      message += validIssues.map(issue => `- ${issue.id}: ${issue.title}`).join('\n');
      console.log(message);
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();
