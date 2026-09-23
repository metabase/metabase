(ns metabase-enterprise.remote-sync.preflight-cost-test
  "Cost of the export preflight (`GET /export-preflight` -> `impl/preview-export-merge`): counts, not clocks.

  Scenario: N synced MBQL cards; the remote has advanced by one commit that edits a single card. Per-entity cost is
  the difference between two sizes (see [[metabase-enterprise.remote-sync.pull-cost-test]]). Not ^:parallel: the
  JDBC counter is JVM-wide."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db-activity :as db-activity]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- counting [counter real]
  (fn [& args] (swap! counter inc) (apply real args)))

(defn- synced-tree []
  (into {} (map (juxt :path :content)) (source/serialize-specs (spec/extract-entities-for-export) nil)))

(defn- edit-one-card
  "`tree` with one card's display changed, as a remote commit would."
  [tree]
  (let [[path content] (first (filter (fn [[_ c]] (str/includes? c "name: Cost card 000")) tree))]
    (assert path "card 000 not found in tree")
    (assoc tree path (str/replace content "display: line" "display: bar"))))

(defn- measure-preflight
  "Creates `n` remote-synced MBQL cards, makes the remote one commit ahead (one card edited), and measures
  `preview-export-merge`: JDBC counts plus :serialized (entities serialized to YAML) and :extract-models (calls to
  `serdes/extract-all`)."
  [n]
  (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
    (mt/with-model-cleanup [:model/Card :model/Collection]
      (let [coll (t2/insert-returning-pk! :model/Collection {:name "Cost" :is_remote_synced true :location "/"})]
        (dotimes [i n]
          (t2/insert! :model/Card
                      {:name                   (format "Cost card %03d" i)
                       :collection_id          coll
                       :creator_id             (mt/user->id :rasta)
                       :display                :line
                       :visualization_settings {}
                       :dataset_query          (mt/mbql-query venues
                                                 {:aggregation [[:sum $price]]
                                                  :breakout    [$category_id]
                                                  :filter      [:> $price i]})}))
        (let [base       (synced-tree)
              src        (rs.test/versioned-source :trees {"v0" base "v1" (edit-one-card base)} :current "v1")
              serialized (atom 0)]
          (mt/with-dynamic-fn-redefs [remote-sync.task/last-version (constantly "v0")
                                      source/source-from-settings   (constantly src)
                                      source/entity->file-spec      (counting serialized (mt/original-fn #'source/entity->file-spec))]
            (let [walk   (db-activity/count-db-activity spec/exportable-entities)
                  counts (db-activity/count-db-activity #(impl/preview-export-merge "main"))]
              (assoc counts
                     :serialized      @serialized
                     :walk-statements (:statements walk)))))))))

(defn- per-entity [small large n-small n-large]
  (into {}
        (for [k [:serialized :statements :checkouts :walk-statements]]
          [k (double (/ (- (k large) (k small)) (- n-large n-small)))])))

(deftest preflight-cost-report-test
  (testing "Report the preflight's per-card cost with one remote change (always green; read the printed numbers)"
    (let [small (measure-preflight 10)
          large (measure-preflight 20)]
      (log/infof "preflight, 1 remote change: n=10 %s; n=20 %s; per card %s"
                 (select-keys small [:serialized :statements :checkouts :walk-statements])
                 (select-keys large [:serialized :statements :checkouts :walk-statements])
                 (per-entity small large 10 20))
      (is (= {:diverged? true :clean? true :conflicts [] :summary {:added 0 :updated 1 :removed 0}
              :force-push-casualties {:deleted [] :overwritten ["Cost card 000 (collections/"]}}
             (-> (:result large)
                 (update-in [:force-push-casualties :overwritten]
                            (partial mapv #(subs % 0 (inc (str/index-of % "/")))))))))))
