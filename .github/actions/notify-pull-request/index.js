const core = require("@actions/core");
const github = require("@actions/github");

const message = core.getInput("message");
const shouldIncludeLog = core.getInput("include-log") === "true";

let body = `@${author} ${message}`;

if (shouldIncludeLog) {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
  body += ` [[Logs]](${runUrl})`;
}

const author = context.payload.comment.user.login;

github.issues.createComment({
  issue_number: context.payload.issue.number,
  owner: context.repo.owner,
  repo: context.repo.repo,
  body,
});
