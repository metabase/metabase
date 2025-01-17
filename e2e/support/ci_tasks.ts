import fetch from "node-fetch"; // must be node-fetch v2 because it's non-esm

const {
  GITHUB_RUN_ID,
  GITHUB_TOKEN,
  HASH,
  PR_NUMBER,
  GITHUB_REPOSITORY,
  JOB_NAME,
} = process.env;

const MAX_TEST_LENGTH = 10;

type TestInfo = {
  fileName: string;
  testName: string;
};

// can't use "@octokit/rest" because it's ESM
const githubApi = ({
  method = "GET",
  endpoint,
  body,
}: {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  endpoint: string;
  body?: any;
}) => {
  return fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/${endpoint}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "X-Github-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
    },
  );
};

function extractTestsFromCommentText(body: string) {
  const tableLines = body.split("\n").filter(line => line.includes("|"));
  const testLines = tableLines.slice(2);
  const testData = testLines.map(line => {
    const [fileName, testName] = line.split("|").map(cell => cell.trim());
    return { fileName, testName };
  });

  return testData;
}

function getCommentText(tests: TestInfo[]) {
  if (tests.length > MAX_TEST_LENGTH) {
    tests = tests.slice(0, MAX_TEST_LENGTH);
    tests.push({ fileName: "and more...", testName: "and more..." });
  }

  return `
  ## e2e tests failed on \`${HASH ?? "hash"}\`

  [e2e test run](https://github.com/metabase/metabase/actions/runs/${GITHUB_RUN_ID}?pr=${PR_NUMBER})

  File | Test Name
  ---- | ---------
  ${tests.map(({ fileName, testName }) => `${fileName} | ${testName}`).join("\n")}
`;
}

async function addOrUpdateComment({
  tests,
  commentId,
}: {
  tests: TestInfo[];
  commentId?: string;
}) {
  const text = getCommentText(tests);

  const response = await githubApi({
    method: commentId ? "PATCH" : "POST",
    endpoint: commentId
      ? `issues/comments/${commentId}`
      : `issues/${PR_NUMBER}/comments`,
    body: { body: text },
  }).catch(console.error);

  return response;
}

function getExistingCommentSha(commentBody: string): string | undefined {
  const hash = commentBody.match(/failed on `([a-f0-9]+)`/);
  return hash?.[1];
}

async function getComment(): Promise<{ body: string; id: string } | undefined> {
  const response = await githubApi({
    endpoint: `issues/${PR_NUMBER}/comments`,
  });

  const comments = await response.json();

  if (!comments?.length) {
    return;
  }

  return comments.find((comment: { body: string; id: string }) =>
    comment?.body?.includes("## e2e tests failed on"),
  );
}

async function updateComment(newTest: TestInfo) {
  const existingComment = await getComment();

  if (!existingComment) {
    // add new comment
    return addOrUpdateComment({ tests: [newTest] });
  }

  if (existingComment) {
    // if hash has changed, discard the current list
    const existingHash = getExistingCommentSha(existingComment.body);
    if (existingHash !== HASH) {
      return addOrUpdateComment({
        commentId: existingComment.id,
        tests: [newTest],
      });
    }

    const existingTests = extractTestsFromCommentText(existingComment.body);
    if (existingTests.length >= MAX_TEST_LENGTH + 1) {
      return;
    }

    // update existing comment
    return addOrUpdateComment({
      commentId: existingComment.id,
      tests: [...existingTests, newTest],
    });
  }
}

export async function reportCIFailure({
  spec,
  test,
}: {
  spec: { name: string };
  test: { titlePath: string[] };
}) {
  if (!PR_NUMBER || !HASH) {
    console.log("missing environment variables", { PR_NUMBER, HASH });
    return null;
  }

  const testPath = test.titlePath.join(" > ");

  const newTestName = JOB_NAME?.toLowerCase().includes("flaky")
    ? `(_flaky_) ${testPath}`
    : testPath;

  const response = await updateComment({
    fileName: `\`${spec.name}\``,
    testName: newTestName,
  }).catch(console.error);

  if (response?.ok) {
    console.log(
      `Updated failure notice in PR: ${PR_NUMBER} - ${spec.name} - ${testPath}`,
    );
  }

  return null;
}
