exports.updateComment = updateComment;

/** @param {import('@types/github-script').AsyncFunctionArguments} AsyncFunctionArguments */
async function updateComment({ github, context }) {
  const githubUsername = context.payload.sender.login;
  const comment = `${CONVENTIONAL_COMMIT_REMINDER_COMMENT_IDENTIFIER}
@${githubUsername} You have modified embedding SDK code. Please make sure the PR title follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) style.
Here are all the supported types that will be shown in the changelog:
- \`feat\`
- \`fix\`
- \`perf\`

These types \`docs\`, \`style\`, \`refactor\`, \`test\`, \`build\`, and \`ci\` are also encouraged for non-changelog related tasks.

Please also make sure to include \`sdk\` scope, otherwise, the changelog will not include this task.

For example, these are valid PR titles:
- \`feat(sdk): Add interactive dashboard component\`
- \`feat(sdk): Support theming pie chart\`
- \`fix(sdk): Fix static dashboard crash\``;

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pullRequestNumber = context.issue.number;
  const comments = await github.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullRequestNumber,
  });

  const existingComment = getExistingConventionalCommitReminderComment(
    comments.data,
  );

  if (existingComment) {
    return await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body: comment,
    });
  } else {
    return await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullRequestNumber,
      body: comment,
    });
  }
}

const CONVENTIONAL_COMMIT_REMINDER_COMMENT_IDENTIFIER =
  "<!---conventional commit reminder comment ID-->";
/**
 * @typedef Comment
 * @property {string} body
 *
 * @param {Comment[]} comments
 */
function getExistingConventionalCommitReminderComment(comments) {
  for (const comment of comments) {
    if (
      comment.body.startsWith(CONVENTIONAL_COMMIT_REMINDER_COMMENT_IDENTIFIER)
    ) {
      return comment;
    }
  }
}
