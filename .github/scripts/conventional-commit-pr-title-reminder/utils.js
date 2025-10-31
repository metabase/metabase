const TYPES = new Set([
  "feat",
  "fix",
  "perf",
  "docs",
  "style",
  "refactor",
  "test",
  "build",
  "ci",
]);

/**
 * @param title {string}
 */
function isConventionalTitle(title) {
  const match = /^(?<type>\w+)\((?<rawScopes>[^)]+)\):/.exec(title);

  if (!match) {
    return false;
  }

  const [, type, rawScopes] = match;
  const scopes = rawScopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return TYPES.has(type) && scopes.length > 0;
}

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
- \`fix(sdk-package): Fixed MetabaseProviderPropsStore logic\`
- \`fix(sdk-package, embed-js): Fix API\``;

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

exports.isConventionalTitle = isConventionalTitle;
exports.updateCommentForEmbedding = updateCommentForEmbedding;
