(ns mage.owner-approval-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.owner-approval]))

;; Referenced by core_test.clj to ensure this namespace is loaded (and its tests run) under `mage -test`.
(def keep-me :loaded)

(def ^:private file-owner-teams @#'mage.owner-approval/file-owner-teams)
(def ^:private approving-teams @#'mage.owner-approval/approving-teams)
(def ^:private parse-pr-node @#'mage.owner-approval/parse-pr-node)
(def ^:private path-owners @#'mage.owner-approval/path-owners)
(def ^:private enforced-for? @#'mage.owner-approval/enforced-for?)
(def ^:private no-team-label @#'mage.owner-approval/no-team-label)
(def ^:private no-team-bucket @#'mage.owner-approval/no-team-bucket)

;; Longest path first, as codeowners-rules emits: a deeper rule (incl. an owner-less exclusion) wins.
(def ^:private rules
  [["docs/developers-guide" #{}]
   ["src/metabase/lib" #{"@metabase/core-backend-querying-platform"}]
   ["src/metabase" #{"@metabase/graphy"}]
   ["docs" #{"@metabase/tech-writers"}]])

(def ^:private config '{lib {:team "Querying Platform"} graph {:team "Graphy"}})

(deftest file-owner-teams-resolves-backend-files-only-test
  (testing "one team per owned file; files outside any module drop out"
    (is (= ["Querying Platform" "Graphy"]
           (file-owner-teams config
                             ["src/metabase/lib/core.clj"
                              "frontend/src/metabase/foo.tsx"
                              "docs/x.md"
                              "src/metabase/graph/impl.clj"])))))

(deftest file-owner-teams-counts-duplicates-test
  (testing "two files in the same module yield the team twice, so count = owned files, set = required teams"
    (let [teams (file-owner-teams config ["src/metabase/lib/a.clj" "test/metabase/lib/a_test.clj"])]
      (is (= 2 (count teams)))
      (is (= #{"Querying Platform"} (set teams))))))

(deftest approving-teams-test
  (testing "a required team counts as approving iff one of its members approved"
    (is (= #{"Graphy"}
           (approving-teams {"Querying Platform" #{"camsaul" "metamben"}
                             "Graphy" #{"dpsutton" "escherize"}}
                            #{"Querying Platform" "Graphy"}
                            #{"dpsutton" "outsider"})))))

(deftest parse-pr-node-keeps-only-approved-authors-test
  (testing "approvers = logins with an APPROVED review; other states ignored"
    (is (= {:pr 42 :author "alice" :merged-at "2025-07-01T00:00:00Z" :n-reviews 3 :approvers #{"bob"}}
           (parse-pr-node {:number 42
                           :author {:login "alice"}
                           :mergedAt "2025-07-01T00:00:00Z"
                           :reviews {:totalCount 3
                                     :nodes [{:state "APPROVED" :author {:login "bob"}}
                                             {:state "COMMENTED" :author {:login "carol"}}
                                             {:state "CHANGES_REQUESTED" :author {:login "dave"}}]}})))))

(deftest parse-pr-node-nil-for-missing-test
  (testing "a null node (number wasn't a PR) yields nil"
    (is (nil? (parse-pr-node nil)))))

(deftest path-owners-picks-most-specific-rule-test
  (testing "the deepest ancestor rule governs; an owner-less exclusion overrides a broad owner; uncovered = nil"
    (is (= #{"@metabase/core-backend-querying-platform"} (path-owners rules "src/metabase/lib/core.clj")))
    (is (= #{"@metabase/graphy"}                         (path-owners rules "src/metabase/graph/impl.clj")))
    (is (= #{}                                           (path-owners rules "docs/developers-guide/x.md")))
    (is (nil?                                            (path-owners rules "README.md")))))

(deftest enforced-for?-owner-aware-with-no-team-fallback-test
  (testing "a real team is enforced only by its own handle"
    (is (true?  (enforced-for? rules "src/metabase/lib/core.clj" "Querying Platform" "@metabase/core-backend-querying-platform")))
    (is (false? (enforced-for? rules "src/metabase/graph/impl.clj" "Querying Platform" "@metabase/core-backend-querying-platform")))
    (is (false? (enforced-for? rules "src/metabase/lib/core.clj" "Embedding" nil))))
  (testing "(no team) counts any owner, but not an owner-less or uncovered path"
    (is (true?  (enforced-for? rules "src/metabase/graph/impl.clj" no-team-label nil)))
    (is (false? (enforced-for? rules "docs/developers-guide/x.md" no-team-label nil)))
    (is (false? (enforced-for? rules "README.md" no-team-label nil)))))

(deftest no-team-bucket-test
  (testing "unmoduled product code and drivers are their own buckets; everything else is tooling"
    (is (= "unmoduled backend" (no-team-bucket "src/metabase/thing.clj")))
    (is (= "unmoduled backend" (no-team-bucket "test/metabase/thing_test.clj")))
    (is (= "unmoduled backend" (no-team-bucket "enterprise/backend/src/metabase_enterprise/thing.clj")))
    (is (= "drivers"           (no-team-bucket "modules/drivers/mongo/src/x.clj")))
    (is (= "tooling & scripts" (no-team-bucket ".clj-kondo/hooks/x.clj")))
    (is (= "tooling & scripts" (no-team-bucket "dev/src/dev/x.clj")))
    (is (= "tooling & scripts" (no-team-bucket "mage/src/mage/x.clj")))))
