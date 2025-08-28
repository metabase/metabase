const { getLinkedIssues } = require("../../release/src/linked-issues");

/**
 * Gets issue data and related information based on the trigger type
 * @param {Object} context - GitHub Actions context
 * @param {Object} github - GitHub API client
 * @returns {Promise<Object>} Issue data and metadata
 */
async function getIssueData({ context, github, manualIssueNumber }) {
  let issueNumber,
    issueData,
    prReviews = [];
  const triggerType = context.eventName;

  if (context.eventName === "issues") {
    // Original issue label event
    issueNumber = context.payload.issue.number;
    issueData = context.payload.issue;
  } else if (context.eventName === "workflow_dispatch") {
    // Manual trigger with issue number input
    issueNumber = parseInt(manualIssueNumber);
    const { data } = await github.rest.issues.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
    });
    issueData = data;
  } else if (context.eventName === "pull_request_review") {
    // Pull request review trigger - extract issue number from branch or PR body
    const prNumber = context.payload.pull_request.number;
    const branchName = context.payload.pull_request.head.ref;

    // Extract issue number from branch name (format: claude-fix/issue-{number}-{title})
    const branchMatch = branchName.match(/claude-fix\/issue-(\d+)-/);
    if (branchMatch) {
      issueNumber = parseInt(branchMatch[1]);
    } else {
      // Fallback: extract from PR body using existing linked-issues logic
      const { data: prData } = await github.rest.pulls.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber,
      });

      const linkedIssues = getLinkedIssues(prData.body || "");
      if (linkedIssues && linkedIssues.length > 0) {
        issueNumber = parseInt(linkedIssues[0]);
      } else {
        throw new Error(
          "Could not extract issue number from branch name or PR body",
        );
      }
    }

    // Get the original issue data
    const { data } = await github.rest.issues.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
    });
    issueData = data;

    // Get PR reviews
    const { data: reviews } = await github.rest.pulls.listReviews({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
    });

    for (const review of reviews) {
      if (review.state === "CHANGES_REQUESTED") {
        const username = review.user.login;

        // Check if reviewer is employee
        if (await isMetabaseMember(github, username)) {
          prReviews.push(review);
          console.log(
            `Including review with changes requested by employee: ${username}`,
          );
        }
      }
    }
  }

  // Fetch issue comments
  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
  });

  // Filter comments to only include those by Metabase employees
  const employeeComments = await filterEmployeeComments(github, comments);

  return {
    issueNumber,
    issueData,
    employeeComments,
    prReviews,
    triggerType,
  };
}

// Global cache for membership lookups to avoid duplicate API calls
const membershipCache = new Map();

/**
 * Checks if a user is a Metabase employee (with persistent caching)
 * @param {Object} github - GitHub API client
 * @param {string} username - GitHub username
 * @returns {Promise<boolean>} True if user is an employee
 */
async function isMetabaseMember(github, username) {
  // Check cache first
  if (membershipCache.has(username)) {
    return membershipCache.get(username);
  }

  try {
    const { data: membership } = await github.rest.orgs.getMembershipForUser({
      org: "metabase",
      username: username,
    });

    const isEmployee = membership.state === "active";
    membershipCache.set(username, isEmployee);
    return isEmployee;
  } catch (error) {
    if (error.status === 404) {
      membershipCache.set(username, false);
      return false;
    } else if (error.status === 403) {
      console.error(
        `Permission denied checking membership for ${username}. GitHub App may lack organization member permissions.`,
      );
      throw new Error(
        `Unable to check organization membership: ${error.message}`,
      );
    } else {
      console.error(`Error checking membership for ${username}:`, error);
      throw new Error(
        `Failed to check organization membership: ${error.message}`,
      );
    }
  }
}

/**
 * Filters comments to only include those by Metabase employees
 * @param {Object} github - GitHub API client
 * @param {Array} comments - Array of comment objects
 * @returns {Promise<Array>} Filtered comments by employees
 */
async function filterEmployeeComments(github, comments) {
  const employeeComments = [];

  for (const comment of comments) {
    const username = comment.user.login;

    if (await isMetabaseMember(github, username)) {
      employeeComments.push(comment);
      console.log(`Including comment by employee: ${username}`);
    } else {
      console.log(`Skipping comment by non-employee: ${username}`);
    }
  }

  return employeeComments;
}

function clearMembershipCache() {
  membershipCache.clear();
}

module.exports = {
  getIssueData,
  clearMembershipCache,
};
