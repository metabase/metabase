const githubSlackMap = require("../../release/github-slack-map.json");

async function getIssueData({ context, github, manualIssueNumber }) {
  let issueNumber;
  let issueData;
  let prReviews = [];
  const triggerType = context.eventName;

  if (context.eventName === "issues") {
    issueNumber = context.payload.issue.number;
    issueData = context.payload.issue;
  } else if (context.eventName === "workflow_dispatch") {
    issueNumber = parseInt(manualIssueNumber);
    const { data } = await github.rest.issues.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
    });
    issueData = data;
  } else if (context.eventName === "pull_request_review") {
    const prNumber = context.payload.pull_request.number;
    const { data: prData } = await github.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
    });

    // Extract issue number from branch name (e.g., "claude-fix/issue-12345-some-title")
    const branchMatch = prData.head.ref.match(/claude-fix\/issue-(\d+)/);
    if (!branchMatch) {
      throw new Error(
        `Could not extract issue number from branch name: ${prData.head.ref}`,
      );
    }

    issueNumber = parseInt(branchMatch[1]);

    const { data } = await github.rest.issues.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issueNumber,
    });
    issueData = data;

    const { data: reviews } = await github.rest.pulls.listReviews({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
    });

    prReviews = reviews.filter(
      (review) =>
        review.state === "CHANGES_REQUESTED" &&
        isMetabaseMember(review.user.login),
    );
  }

  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
  });

  const employeeComments = comments.filter((comment) =>
    isMetabaseMember(comment.user.login),
  );

  return {
    issueNumber,
    issueData,
    employeeComments,
    prReviews,
    triggerType,
    isIssueAuthorEmployee: isMetabaseMember(issueData.user.login),
  };
}

function isMetabaseMember(username) {
  return username in githubSlackMap;
}

module.exports = {
  getIssueData,
};
