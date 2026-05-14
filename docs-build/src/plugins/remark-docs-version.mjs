// Replaces the `{SAMPLE_APP_BRANCH}` token in markdown with the branch of the
// metabase-nodejs-react-sdk-embedding-sample repo that matches this docs build:
// "<NN>-stable" for a released version, "master" for an unreleased / latest
// build without release info.
//
// The version is derived from DOCS_BASE_PATH (set by `./bin/mage docs-build`:
// /docs/latest, /docs/v0.NN, or /docs/master), falling back to GITHUB_REF_NAME
// for "latest" builds running off a release branch.

import { visit } from "unist-util-visit";

const TOKEN = /\{SAMPLE_APP_BRANCH\}/g;

export function resolveSampleAppBranch(env = process.env) {
  const base = env.DOCS_BASE_PATH ?? "/docs/latest";
  const m = base.match(/^\/docs\/(.+)$/);
  const version = m ? m[1] : "latest";
  if (version === "master") return "master";
  let vm = version.match(/^v0\.(\d+)$/);
  if (vm) return `${vm[1]}-stable`;
  // "latest" — use the release branch CI is building from, if any.
  vm = (env.GITHUB_REF_NAME ?? "").match(/^release-x\.(\d+)\.x$/);
  return vm ? `${vm[1]}-stable` : "master";
}

export function remarkDocsVersion() {
  const branch = resolveSampleAppBranch();
  return (tree) => {
    visit(tree, (node) => {
      if (typeof node.value === "string") node.value = node.value.replace(TOKEN, branch);
      if (typeof node.url === "string") node.url = node.url.replace(TOKEN, branch);
    });
  };
}
