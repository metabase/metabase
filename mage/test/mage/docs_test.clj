(ns mage.docs-test
  (:require
   [babashka.fs :as fs]
   [clojure.test :as t :refer [are deftest is testing]]
   [mage.docs :as docs]))

(deftest base-path-for-branch-test
  (testing "release branches publish under /docs/v0.NN"
    (are [branch expected] (= expected (docs/base-path-for-branch branch))
      "release-x.55.x"   "/docs/v0.55"
      "release-x.60.x"   "/docs/v0.60"
      "release-x.100.x"  "/docs/v0.100"))

  (testing "non-release branches publish under /docs/latest"
    (are [branch] (= "/docs/latest" (docs/base-path-for-branch branch))
      "master"
      "main"
      "feature/some-feature"
      "docs-build"
      "release-x"            ; not a full match
      "release-55.x"         ; missing x. prefix
      "x-release-x.55.x"     ; trailing match not enough
      ""))

  (testing "nil branch (e.g. detached HEAD) falls back to /docs/latest"
    (is (= "/docs/latest" (docs/base-path-for-branch nil)))))

(deftest slugify-test
  (testing "slashes and special chars become dashes"
    (are [input expected] (= expected (docs/slugify input))
      "release-x.55.x"        "release-x.55.x"      ; already filesystem-safe
      "master"                "master"
      "feature/foo-bar"       "feature-foo-bar"
      "team/sub/branch"       "team-sub-branch"
      "weird name!"           "weird-name-"
      "tag@v1.0"              "tag-v1.0"
      "spaces in here"        "spaces-in-here"
      "preserve_underscores"  "preserve_underscores"
      "preserve.dots"         "preserve.dots")))

(deftest base-tail-test
  (testing "extracts the last path segment"
    (are [base-path expected] (= expected (docs/base-tail base-path))
      "/docs/v0.55"   "v0.55"
      "/docs/v0.100"  "v0.100"
      "/docs/latest"  "latest"
      "/docs/master"  "master"))

  (testing "no leading slash works too"
    (is (= "latest" (docs/base-tail "docs/latest")))))

;; Realistic epoch-millis values, well above 0, far apart enough that any
;; filesystem mtime precision quirks (seconds vs millis) are irrelevant.
(def ^:private older-mtime 1700000000000) ; 2023-11-14T22:13:20Z
(def ^:private newer-mtime 1700001000000) ; +1000 seconds

(defn- touch! [path mtime]
  (.setLastModified (java.io.File. ^String (str path)) mtime))

(deftest artifact-fresh?-test
  (let [root (str (fs/create-temp-dir {:prefix "mage-docs-test-"}))]
    (try
      (let [artifact-rel "out.json"
            artifact-abs (str root "/" artifact-rel)
            source-rel   "src/foo.clj"
            source-abs   (str root "/" source-rel)]
        (fs/create-dirs (str root "/src"))

        (testing "missing artifact is not fresh"
          (is (false? (docs/artifact-fresh? root artifact-rel ["src/**.clj"]))))

        (testing "zero-byte artifact is not fresh (caught generation died mid-write)"
          (spit artifact-abs "")
          (is (false? (docs/artifact-fresh? root artifact-rel ["src/**.clj"]))))

        (testing "non-empty artifact with no matching sources is fresh (degrades to exists+nonempty)"
          (spit artifact-abs "x")
          (is (true? (docs/artifact-fresh? root artifact-rel ["nothing/**.clj"]))))

        (testing "artifact newer than all sources is fresh"
          (spit source-abs "src")
          (touch! source-abs older-mtime)
          (touch! artifact-abs newer-mtime)
          (is (true? (docs/artifact-fresh? root artifact-rel ["src/**.clj"]))))

        (testing "artifact older than any source is not fresh"
          (touch! artifact-abs older-mtime)
          (touch! source-abs newer-mtime)
          (is (false? (docs/artifact-fresh? root artifact-rel ["src/**.clj"]))))

        (testing "artifact mtime equal to newest source mtime is fresh (boundary)"
          (touch! source-abs newer-mtime)
          (touch! artifact-abs newer-mtime)
          (is (true? (docs/artifact-fresh? root artifact-rel ["src/**.clj"]))))

        (testing "freshness is judged against the newest source, not any single one"
          (let [other-source-abs (str root "/src/bar.clj")]
            (spit other-source-abs "bar")
            (touch! source-abs        older-mtime)
            (touch! other-source-abs  newer-mtime)
            (touch! artifact-abs      older-mtime)
            (is (false? (docs/artifact-fresh? root artifact-rel ["src/**.clj"]))
                "artifact older than bar.clj should not be considered fresh"))))
      (finally
        (fs/delete-tree root)))))

(deftest newest-mtime-ms-test
  (let [root (str (fs/create-temp-dir {:prefix "mage-docs-test-"}))]
    (try
      (testing "returns nil when no files match"
        (is (nil? (docs/newest-mtime-ms root ["does-not-exist/**.clj"]))))

      (testing "returns the newest mtime across all matching globs"
        (fs/create-dirs (str root "/a"))
        (fs/create-dirs (str root "/b"))
        (let [a (str root "/a/x.clj")
              b (str root "/b/y.clj")]
          (spit a "a") (touch! a older-mtime)
          (spit b "b") (touch! b newer-mtime)
          (is (= newer-mtime
                 (docs/newest-mtime-ms root ["a/**.clj" "b/**.clj"])))))
      (finally
        (fs/delete-tree root)))))

(deftest staleness-test
  (let [root (str (fs/create-temp-dir {:prefix "mage-docs-test-"}))]
    (try
      (let [artifact-rel "out.json"
            artifact-abs (str root "/" artifact-rel)
            source-rel   "src/foo.clj"
            source-abs   (str root "/" source-rel)]
        (fs/create-dirs (str root "/src"))

        (testing "missing artifact"
          (is (= {:reason :missing}
                 (docs/staleness root artifact-rel ["src/**.clj"]))))

        (testing "empty artifact"
          (spit artifact-abs "")
          (is (= {:reason :empty}
                 (docs/staleness root artifact-rel ["src/**.clj"]))))

        (testing "fresh artifact returns nil"
          (spit artifact-abs "x")
          (spit source-abs "src")
          (touch! source-abs older-mtime)
          (touch! artifact-abs newer-mtime)
          (is (nil? (docs/staleness root artifact-rel ["src/**.clj"]))))

        (testing "no matching sources + non-empty artifact returns nil (degrades to fresh)"
          (is (nil? (docs/staleness root artifact-rel ["nothing/**.clj"]))))

        (testing "stale artifact names the newest source"
          (touch! artifact-abs older-mtime)
          (touch! source-abs newer-mtime)
          (let [s (docs/staleness root artifact-rel ["src/**.clj"])]
            (is (= :stale (:reason s)))
            (is (= older-mtime (:artifact-mtime s)))
            (is (= newer-mtime (get-in s [:newest-source :mtime])))
            (is (= source-abs (get-in s [:newest-source :path]))))))
      (finally
        (fs/delete-tree root)))))

(defn- mk-worktree! [root name branch]
  (let [dir (str root "/__worktrees/" name)]
    (fs/create-dirs dir)
    (spit (str dir "/.docs-build-branch") (str branch "\n"))
    dir))

(deftest list-docs-worktrees-test
  (let [root (str (fs/create-temp-dir {:prefix "mage-docs-test-"}))]
    (try
      (testing "returns empty when __worktrees does not exist"
        (is (empty? (docs/list-docs-worktrees root))))

      (testing "returns empty when __worktrees exists but has no docs- dirs"
        (fs/create-dirs (str root "/__worktrees/other-tool"))
        (is (empty? (docs/list-docs-worktrees root))))

      (testing "lists docs-* worktrees with markers, sorted by mtime"
        (let [old (mk-worktree! root "docs-old" "release-x.55.x")
              new (mk-worktree! root "docs-new" "master")]
          (touch! old older-mtime)
          (touch! new newer-mtime)
          (let [result (docs/list-docs-worktrees root)]
            (is (= 2 (count result)))
            (is (= [old new] (map :dir result))
                "oldest worktree comes first")
            (is (= ["release-x.55.x" "master"] (map :branch result))))))

      (testing "skips docs-* directories that lack the marker file"
        (fs/create-dirs (str root "/__worktrees/docs-not-ours"))
        (is (= 2 (count (docs/list-docs-worktrees root)))
            "unmarked docs-* dirs are ignored — they may belong to unrelated tooling"))

      (testing "skips non-docs- worktrees even when they have the marker"
        (let [unrelated (str root "/__worktrees/something-else")]
          (fs/create-dirs unrelated)
          (spit (str unrelated "/.docs-build-branch") "master\n"))
        (is (= 2 (count (docs/list-docs-worktrees root)))))
      (finally
        (fs/delete-tree root)))))
