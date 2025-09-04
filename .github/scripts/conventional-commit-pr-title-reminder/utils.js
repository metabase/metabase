exports.updateCommentForEmbedding = updateCommentForEmbedding;
exports.updateCommentForEmbeddingSdkPackage =
  updateCommentForEmbeddingSdkPackage;

/** @param {import('@types/github-script').AsyncFunctionArguments} AsyncFunctionArguments */
async function updateCommentForEmbedding({ github, context }) {
  const githubUsername = context.payload.sender.login;

  const comment = `${CONVENTIONAL_COMMENT_IDENTIFIER}
@${githubUsername} You have modified embedding code. Please make sure the PR title follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) style.
Here are all the supported types:
- \`feat\`
- \`fix\`
- \`perf\`
- \`docs\`
- \`style\`
- \`refactor\`
- \`test\`
- \`build\`
- \`ci\`

Please also make sure to include a scope.

For example, these are valid PR titles:
- \`feat(sdk-bundle): Add interactive dashboard component\`
- \`fix(embed-js): Fix API\``;

  return updateComment(comment, { github, context });
}

/** @param {import('@types/github-script').AsyncFunctionArguments} AsyncFunctionArguments */
async function updateCommentForEmbeddingSdkPackage({ github, context }) {
  const githubUsername = context.payload.sender.login;

  const comment = `${CONVENTIONAL_COMMENT_IDENTIFIER}
@${githubUsername} You have modified embedding SDK package code. Please make sure the PR title follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) style.
Here are all the supported types that will be shown in the changelog:
- \`feat\`
- \`fix\`
- \`perf\`

These types \`docs\`, \`style\`, \`refactor\`, \`test\`, \`build\`, and \`ci\` are also encouraged for non-changelog related tasks.

Please also make sure to include \`sdk-package\` scope, otherwise, the changelog will not include this task.

For example, these are valid PR titles:
- \`feat(sdk-package): Add interactive dashboard component\`
- \`feat(sdk-package): Support theming pie chart\`
- \`fix(sdk-package): Fix static dashboard crash\``;

  return updateComment(comment, { github, context });
}

/**
 * @param comment {string}
 * @param {import('@types/github-script').AsyncFunctionArguments} AsyncFunctionArguments
 */
async function updateComment(comment, { github, context }) {
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
    await github.rest.issues.deleteComment({
      owner,
      repo,
      comment_id: existingComment.id,
    });
  }

  return await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullRequestNumber,
    body: comment,
  });
}

const CONVENTIONAL_COMMENT_IDENTIFIER =
  "<!---conventional comment identifier-->";

/**
 * @param comments {{body: string}[]}
 */
function getExistingConventionalCommitReminderComment(comments) {
  for (const comment of comments) {
    if (comment.body.startsWith(CONVENTIONAL_COMMENT_IDENTIFIER)) {
      return comment;
    }
  }
}
