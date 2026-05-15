(ns mage.docs-test
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [clojure.test :as t :refer [are deftest is testing]]
   [mage.docs :as docs]
   [mage.util :as u]))

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

;; Realistic epoch-millis values, well above 0, far apart enough that any
;; filesystem mtime precision quirks (seconds vs millis) are irrelevant.
(def ^:private older-mtime 1700000000000) ; 2023-11-14T22:13:20Z
(def ^:private newer-mtime 1700001000000) ; +1000 seconds

(defn- touch! [path mtime]
  (.setLastModified (java.io.File. ^String (str path)) mtime))

(deftest artifact-present?-test
  (let [root (str (fs/create-temp-dir {:prefix "mage-docs-test-"}))]
    (try
      (let [artifact-rel "out.json"
            artifact-abs (str root "/" artifact-rel)]

        (testing "missing artifact is absent"
          (is (false? (docs/artifact-present? root artifact-rel))))

        (testing "existing artifact is present"
          (spit artifact-abs "x")
          (is (true? (docs/artifact-present? root artifact-rel)))))
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

;; ---------------------------------------------------------------------------
;; Unified generators / lazy-artifact view
;; ---------------------------------------------------------------------------

(deftest generators-shape-test
  (let [generators @#'docs/generators]

    (testing "every entry has a :tag and at least one of :cmd or :lazy"
      (doseq [{:keys [tag cmd lazy]} generators]
        (is (some? tag))
        (is (or cmd lazy)
            (str "Entry " tag " must declare :cmd (docs-generate) or :lazy (pre-flight)"))))

    (testing "runnable tags (have :cmd) are exactly the docs-generate slices"
      (is (= #{:env-vars :config :api :commands :analytics :country-codes}
             (set (map :tag (filter :cmd generators))))))

    (testing "lazy pre-flight covers the build-blocking artifacts"
      (is (= #{:api :sdk-typedoc :sdk-html}
             (set (map :tag (filter :lazy generators))))))

    (testing "lazy entries declare an existence check path and missing-msg"
      (doseq [{:keys [tag lazy]} (filter :lazy generators)]
        (is (some? (:check lazy)) (str "Entry " tag " :lazy/:check missing"))
        (is (some? (:missing-msg lazy)) (str "Entry " tag " :lazy/:missing-msg missing"))))

    (testing "standalone entries (no :cmd) supply :lazy/:regen so the pre-flight has something to call"
      (doseq [{:keys [tag cmd lazy]} generators
              :when (and lazy (not cmd))]
        (is (fn? (:regen lazy))
            (str "Entry " tag " is standalone (no :cmd); its :lazy/:regen must be a function"))))

    (testing "for entries with :cmd, omitting :lazy/:regen means the lazy path reuses :cmd"
      (let [api (some #(when (= :api (:tag %)) %) generators)]
        (is (nil? (get-in api [:lazy :regen]))
            ":api should rely on the default behavior so adding it twice is impossible")))))

(deftest lazy-entries-derived-test
  (testing "lazy-entries yields the lazy generator entries in declaration order"
    (let [lazy-entries (@#'docs/lazy-entries)
          generators   @#'docs/generators]
      (is (= (map :tag (filter :lazy generators))
             (map :tag lazy-entries))
          "Order should match the order in `generators` — deterministic pre-flight."))))

;; ---------------------------------------------------------------------------
;; docs-help markdown emitter and dev-guide drift detection
;; ---------------------------------------------------------------------------

(deftest help-table-markdown-test
  (let [md (docs/help-table-markdown)]
    (testing "wrapped in BEGIN/END markers"
      (is (str/starts-with? md "<!-- BEGIN docs-help-table -->"))
      (is (str/ends-with? md "<!-- END docs-help-table -->")))
    (testing "3-column header with the expected titles"
      (is (re-find #"(?m)^\| Command\s+\| Purpose\s+\| Implemented by\s+\|" md)))
    (testing "every command appears as a backticked cell"
      (doseq [[cmd _ _] @#'docs/help-rows]
        (is (str/includes? md (str "`" cmd "`"))
            (str "expected `" cmd "` in markdown"))))))

(deftest dev-guide-table-in-sync-test
  (testing "dev guide's bracketed help-table block matches the generated markdown"
    (let [path      (str u/project-root-directory "/docs/developers-guide/docs.md")
          text      (slurp path)
          re        #"(?s)<!-- BEGIN docs-help-table -->.*?<!-- END docs-help-table -->"
          dev-block (re-find re text)]
      (is dev-block
          (str path " should contain BEGIN/END docs-help-table markers"))
      (is (= (docs/help-table-markdown) dev-block)
          (str "Dev guide's help-table block has drifted from help-rows. "
               "Run `./bin/mage docs-help --write` to regenerate.")))))
