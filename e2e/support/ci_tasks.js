import { Octokit } from "@octokit/rest";
const { ACTIONS_RUN_ID, GITHUB_TOKEN, HASH } = process.env;

// FIXME get from env
const PR_NUMBER = 1;

const owner = "metabase";
const repo = "metabase";

const MAX_TEST_LENGTH = 20;

const github = new Octokit({
  auth: GITHUB_TOKEN,
});

function extractTestsFromCommentText(body) {
  const tests = body
    .split("\n")
    .slice(3)
    .map(line => {
      const [spec, test] = line.split("|").map(cell => cell.trim());
      return { spec, test };
    });

  return tests;
}

function getCommentText(tests) {
  if (tests.length > MAX_TEST_LENGTH) {
    tests = tests.slice(0, MAX_TEST_LENGTH);
    tests.push({ spec: "and more...", test: "and more..." });
  }

  return `
  ## e2e tests failed on \`${HASH}\`

  File | Test Name
  ---- | ---------
  ${tests.map(({ spec, test }) => `\`${spec}\` | \`${test}\``).join("\n")}
  `;
}

async function addComment() {
  github.issues.createComment({
    owner,
    repo,
    issue_number: PR_NUMBER,
    body: getCommentText(),
  });
}

async function getComment() {
  const comments = await github.issues.listComments({
    owner,
    repo,
    issue_number: PR_NUMBER,
  });

  if (!comments.data) {
    return;
  }

  return comments.data.find(comment =>
    comment?.body?.includes("## e2e test failed on"),
  );
}

async function updateComment({ spec, test }) {
  const comment = await getComment();

  if (!comment) {
    return addComment({ spec, test });
  }

  if (comment) {
    const existingTests = extractTestsFromCommentText(comment.body);
    if (existingTests.length >= MAX_TEST_LENGTH) {
      return;
    }
    const updatedComment = getCommentText([...existingTests, { spec, test }]);

    return github.issues.updateComment({
      owner,
      repo,
      comment_id: comment.id,
      body: updatedComment,
    });
  }
}

export async function resetComment() {
  const comment = await getComment();

  if (comment) {
    updateComment([]);
  }
}

export async function reportCIFailure({ spec, test }) {
  console.log("Test failed", { test, spec });

  if (!PR_NUMBER || !ACTIONS_RUN_ID) {
    console.log("missing environment variables", { PR_NUMBER, ACTIONS_RUN_ID });
    return;
  }

  updateComment({
    spec: spec.name,
    test: test.titlePath.join(" > "),
  });
}
