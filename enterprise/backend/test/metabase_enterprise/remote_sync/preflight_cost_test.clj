(ns metabase-enterprise.remote-sync.preflight-cost-test
  "Cost of the export preflight (`GET /export-preflight` -> `impl/preview-export-merge`): counts, not clocks.

  Scenario: N synced MBQL cards; the remote has advanced by one commit that edits a single card. Per-entity cost is
  the difference between two sizes. Not ^:parallel: the JDBC counter is JVM-wide."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.app-db.activity-test-util :as db-activity]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- counting [counter real]
  (fn [& args] (swap! counter inc) (apply real args)))

(defn- edit-one-card
  "`tree` with one card's display changed, as a remote commit would."
  [tree]
  (let [[path content] (first (filter (fn [[_ c]] (str/includes? c "name: Cost card 000")) tree))]
    (assert path "card 000 not found in tree")
    (assoc tree path (str/replace content "display: line" "display: bar"))))

(defn- edit-every-card
  "`tree` with the display of every card changed, as a remote commit would."
  [tree]
  (update-vals tree #(str/replace % "display: line" "display: bar")))

(defn- count-activity!
  "[[db-activity/count-db-activity!]] of `thunk`. The settings cache checks for changes at most once a minute,
  JVM-wide, so a check inside the count would add statements to one count only: force the check just before."
  [thunk]
  (setting/restore-cache-if-needed! :force-check? true)
  (db-activity/count-db-activity! thunk))

(defn- measure-preflight!
  "Creates `n` remote-synced MBQL cards, makes the remote one commit ahead with `edit` applied to the tree (by default
  one card edited), and measures `preview-export-merge`: JDBC counts, plus :serialized (entities serialized to YAML)
  and :walk-statements (the statements of the export dependency walk alone)."
  [n & {:keys [edit] :or {edit edit-one-card}}]
  (cost/do-with-content!
   {:cards n}
   (fn [base]
     (let [src        (rs.test/versioned-source :trees {"v0" base "v1" (edit base)} :current "v1")
           serialized (atom 0)]
       (mt/with-dynamic-fn-redefs [remote-sync.task/last-version (constantly "v0")
                                   source/source-from-settings   (constantly src)
                                   source/entity->file-spec      (counting serialized (mt/original-fn #'source/entity->file-spec))]
         (let [walk   (count-activity! spec/exportable-entities)
               counts (count-activity! #(impl/preview-export-merge "main"))]
           (assoc counts
                  :serialized      @serialized
                  :walk-statements (:statements walk))))))))

(defn- per-entity [small large n-small n-large]
  (into {}
        (for [k [:serialized :statements :checkouts :walk-statements]]
          [k (double (/ (- (k large) (k small)) (- n-large n-small)))])))

(deftest preflight-cost-test
  (testing "With one remote change, the preflight serializes a constant number of entities, not one per local card"
    (let [small    (measure-preflight! 10)
          large    (measure-preflight! 20)
          per-card (per-entity small large 10 20)]
      (log/infof "preflight, 1 remote change: n=10 %s; n=20 %s; per card %s"
                 (select-keys small [:serialized :statements :checkouts :walk-statements])
                 (select-keys large [:serialized :statements :checkouts :walk-statements])
                 per-card)
      (is (= 0.0 (:serialized per-card)))
      (testing "the only app-DB work that grows with the local card count is the dependency walk"
        (is (<= (:statements per-card) (:walk-statements per-card))))
      (is (= {:diverged? true :clean? true :conflicts [] :summary {:added 0 :updated 1 :removed 0}
              :force-push-casualties {:deleted [] :overwritten ["Cost card 000 (collections/"]}}
             (-> (:result large)
                 (update-in [:force-push-casualties :overwritten]
                            (partial mapv #(subs % 0 (inc (str/index-of % "/")))))))))))

(deftest preflight-checkouts-when-remote-changes-every-card-test
  (testing "When the remote changed every card, the preflight checks out no more connections for each local card"
    ;; the lookup of each changed path is the cost that grows: about 1 statement for each changed card
    (let [small    (measure-preflight! 10 :edit edit-every-card)
          large    (measure-preflight! 20 :edit edit-every-card)
          per-card (per-entity small large 10 20)]
      (is (= 0.0 (:checkouts per-card)) (pr-str per-card)))))
