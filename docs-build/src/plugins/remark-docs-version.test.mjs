import test from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "mdast-util-from-markdown";
import { remarkDocsVersion, resolveSampleAppBranch } from "./remark-docs-version.mjs";

test("resolveSampleAppBranch: /docs/v0.NN → NN-stable", () => {
  assert.equal(resolveSampleAppBranch({ DOCS_BASE_PATH: "/docs/v0.58" }), "58-stable");
});

test("resolveSampleAppBranch: /docs/master → master", () => {
  assert.equal(resolveSampleAppBranch({ DOCS_BASE_PATH: "/docs/master" }), "master");
});

test("resolveSampleAppBranch: /docs/latest + release ref → NN-stable", () => {
  assert.equal(
    resolveSampleAppBranch({ DOCS_BASE_PATH: "/docs/latest", GITHUB_REF_NAME: "release-x.60.x" }),
    "60-stable",
  );
});

test("resolveSampleAppBranch: /docs/latest with no usable ref → master", () => {
  assert.equal(resolveSampleAppBranch({ DOCS_BASE_PATH: "/docs/latest" }), "master");
  assert.equal(resolveSampleAppBranch({}), "master");
  assert.equal(resolveSampleAppBranch({ DOCS_BASE_PATH: "/docs/latest", GITHUB_REF_NAME: "feature/x" }), "master");
});

test("remarkDocsVersion replaces {SAMPLE_APP_BRANCH} in text, links, and code", () => {
  const prev = process.env.DOCS_BASE_PATH;
  process.env.DOCS_BASE_PATH = "/docs/v0.59";
  try {
    const tree = fromMarkdown(
      "See [sample](https://x/tree/{SAMPLE_APP_BRANCH}).\n\n```bash\ngit checkout {SAMPLE_APP_BRANCH}\n```",
    );
    remarkDocsVersion()(tree);
    const link = tree.children[0].children.find((n) => n.type === "link");
    assert.equal(link.url, "https://x/tree/59-stable");
    const code = tree.children.find((n) => n.type === "code");
    assert.equal(code.value, "git checkout 59-stable");
  } finally {
    if (prev === undefined) delete process.env.DOCS_BASE_PATH;
    else process.env.DOCS_BASE_PATH = prev;
  }
});
