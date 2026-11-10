import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { cljExistingForPath, cljExistingForPr, sourceFileFor, testFileFor } from "../lib/clj-existing.mjs";
import { scanClj } from "../lib/clj-scan.mjs";

const BODY = `
  (testing "a sandboxed user can't upload"
    (is (false? (upload/can-upload? (mt/id) "public")))))`;

const files = {
  "src/metabase/upload/impl.clj": "(ns metabase.upload.impl)\n(defn can-upload? [db schema] true)\n",
  "test/metabase/upload/impl_test.clj": `(ns metabase.upload.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.upload.impl :as upload]))

(deftest can-upload-test${BODY}

(deftest can-upload-again-test${BODY}
`,
  "test/metabase/upload/api_test.clj": `(ns metabase.upload.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.upload.impl :as impl]))

(deftest api-can-upload-test
  (testing "a sandboxed user can't upload"
    (is (false? (impl/can-upload? (mt/id) "public")))))
`,
  "test/metabase/upload/helpers.clj": "(ns metabase.upload.helpers\n  (:require [metabase.upload.impl :as impl]))\n",
  "enterprise/backend/test/metabase_enterprise/sandbox/upload_test.clj": `(ns metabase-enterprise.sandbox.upload-test
  (:require
   [clojure.test :refer :all]
   [metabase.upload.impl-test :as upload-test]))

(deftest uploads-disabled-for-sandboxed-user-test
  (is (= 1 1)))

(deftest can-upload-false-for-sandboxed-user-test
  (is (= 2 2)))
`,
  "modules/drivers/mongo/src/metabase/driver/mongo/database.clj": "(ns metabase.driver.mongo.database)\n",
  "modules/drivers/mongo/test/metabase/driver/mongo/database_test.clj": "(ns metabase.driver.mongo.database-test)\n",
};

let root;

before(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rc-clj-")));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  const git = (...args) => spawnSync("git", args, { cwd: root });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.email=t@example.com", "-c", "user.name=T", "commit", "-qm", "init");
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

describe("scanClj", () => {
  it("should give the same hash to bodies that differ only in the alias of a namespace", () => {
    const a = scanClj(files["test/metabase/upload/impl_test.clj"], "a").tests[0];
    const b = scanClj(files["test/metabase/upload/api_test.clj"], "b").tests[0];
    assert.equal(a.body, b.body);
  });

  it("should give different hashes to bodies whose names point at different namespaces", () => {
    const own = "(ns a.x-test (:require [a.x :as x]))\n(deftest t (is (x/f 1)))\n";
    const other = "(ns b.y-test (:require [b.y :as x]))\n(deftest t (is (x/f 1)))\n";
    assert.notEqual(scanClj(own, "a").tests[0].body, scanClj(other, "b").tests[0].body);
  });

  it("should read the namespace and a deftest behind a discarded form", () => {
    const src = '#_{:clj-kondo/ignore [:a]}\n(ns a.b-test\n  (:require [a.b :as b]))\n#_{:clj-kondo/ignore [:c]}\n(deftest kept-test (is true))\n';
    const scanned = scanClj(src, "f");
    assert.equal(scanned.ns, "a.b-test");
    assert.deepEqual(scanned.requires, ["a.b"]);
    assert.deepEqual(scanned.tests.map((t) => t.name), ["kept-test"]);
  });
});

describe("test files for a source namespace", () => {
  it("should map source and test paths in the main, enterprise and driver layouts", () => {
    assert.equal(testFileFor(root, "src/metabase/upload/impl.clj"), "test/metabase/upload/impl_test.clj");
    assert.equal(sourceFileFor(root, "test/metabase/upload/impl_test.clj"), "src/metabase/upload/impl.clj");
    assert.equal(testFileFor(root, "modules/drivers/mongo/src/metabase/driver/mongo/database.clj"), "modules/drivers/mongo/test/metabase/driver/mongo/database_test.clj");
    assert.equal(sourceFileFor(root, "enterprise/backend/test/metabase_enterprise/sandbox/upload_test.clj"), null);
  });

  it("should list the conventional test file and the test files that require the namespace, but not helpers", () => {
    const { text } = cljExistingForPath({ root, target: "src/metabase/upload/impl.clj" });
    assert.match(text, /test\/metabase\/upload\/impl_test\.clj, by convention \(2 deftests\)/);
    assert.match(text, /test\/metabase\/upload\/api_test\.clj, by require \(1 deftests\)/);
    assert.doesNotMatch(text, /helpers\.clj/);
  });

  it("should flag exact copies in the same file and in the other test files for the source", () => {
    const { duplicates } = cljExistingForPath({ root, target: "test/metabase/upload/impl_test.clj" });
    const pairs = duplicates.map(({ a, b }) => [a.name, b.name].sort().join(" / ")).sort();
    assert.deepEqual(pairs, ["api-can-upload-test / can-upload-again-test", "api-can-upload-test / can-upload-test", "can-upload-again-test / can-upload-test"]);
  });

  it("should show a new deftest beside the existing ones in its namespace and find its source through the test namespace it requires", () => {
    const { text } = cljExistingForPr({
      root,
      deftests: [{ id: "metabase-enterprise.sandbox.upload-test/can-upload-false-for-sandboxed-user-test", file: "enterprise/backend/test/metabase_enterprise/sandbox/upload_test.clj", status: "new" }],
    });
    assert.match(text, /new can-upload-false-for-sandboxed-user-test/);
    assert.match(text, /Existing deftests in the same namespace: uploads-disabled-for-sandboxed-user-test/);
    assert.match(text, /It tests src\/metabase\/upload\/impl\.clj \(metabase\.upload\.impl\), through metabase\.upload\.impl-test/);
  });
});
