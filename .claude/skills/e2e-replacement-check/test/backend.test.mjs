import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { backendSelectors } from "../lib/run.mjs";

describe("backendSelectors", () => {
  it("should run a touched file's whole test namespace even when the PR's new deftest lives in it", () => {
    const selectors = backendSelectors(
      ["metabase.comments.api-test/comment-notification-email-content-test", "metabase.documents.api.document-test/put-document-test"],
      ["metabase.comments.api-test"],
    );
    assert.deepEqual(selectors, ["metabase.documents.api.document-test/put-document-test", "metabase.comments.api-test"]);
  });

  it("should run the PR's deftests on their own when no touched file has a test namespace", () => {
    assert.deepEqual(backendSelectors(["a.b-test/c-test"], []), ["a.b-test/c-test"]);
  });

  it("should keep a deftest whose namespace only shares a prefix with a whole namespace", () => {
    assert.deepEqual(backendSelectors(["a.b-test-extra/c-test"], ["a.b-test"]), ["a.b-test-extra/c-test", "a.b-test"]);
  });
});
