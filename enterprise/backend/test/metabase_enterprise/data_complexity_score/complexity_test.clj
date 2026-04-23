(ns metabase-enterprise.data-complexity-score.complexity-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase-enterprise.data-complexity-score.init :as init]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase-enterprise.semantic-search.embedders :as ss.embedders]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

(def ^:private test-entity-ids (atom 0))

(defn- entity
  "Fake-entity builder for scoring tests. Uses a monotonic counter so ids are stable across
  assertions. Richer-than-v1 shape: `:description`, `:fields` [{:name :semantic-type :description}]."
  [& {:keys [name kind field-count fields measure-names description]
      :or   {kind :table field-count 0 fields [] measure-names [] description nil}}]
  {:id            (swap! test-entity-ids inc)
   :name          name
   :kind          kind
   :description   description
   :field-count   (if (seq fields) (count fields) field-count)
   :fields        fields
   :measure-names measure-names})

(defn- catalog
  "`{:entities [...] :collection-count N}` wrapper for the score-from-entities arg. Collection
  count defaults to the entity count when unspecified so tests that don't care about scale pass
  something reasonable to the scale dimension."
  ([entities] (catalog entities nil))
  ([entities collection-count]
   {:entities entities :collection-count (or collection-count (count entities))}))

(defn- mock-embedder
  "Build an embedder backed by a `{name -> vector-literal}` lookup table for tests."
  [name->vec-literal]
  (embedders/fn-embedder
   (fn [names]
     (mapv #(when-let [v (get name->vec-literal %)] (float-array v)) names))))

(defn- score-entities
  "Call score-catalog via its private var. Wraps the argument plumbing."
  [entities embedder level & {:keys [collection-count] :or {collection-count 0}}]
  (#'complexity/score-catalog entities {:collection-count collection-count} embedder level))

;;; ------------------------------ pure per-dimension -----------------------------

(deftest ^:parallel score-catalog-empty-test
  (testing "empty catalog scores zero on every scored variable"
    (let [{:keys [total dimensions]} (score-entities [] nil 2)]
      (is (= 0 total))
      (is (= 0 (get-in dimensions [:scale :sub-total])))
      (is (= 0 (get-in dimensions [:nominal :sub-total])))
      (is (= 0 (get-in dimensions [:semantic :sub-total]))))))

(deftest ^:parallel scale-dim-test
  (testing "entity-count contributes +10 per entity"
    (let [es [(entity :name "orders") (entity :name "customers") (entity :name "products")]]
      (is (=? {:dimensions {:scale {:variables {:entity-count {:value 3 :score 30}}}}}
              (score-entities es nil 1)))))
  (testing "field-count sums :field-count across entities, +1 each"
    (let [es [(entity :name "a" :field-count 10)
              (entity :name "b" :field-count 25)]]
      (is (=? {:dimensions {:scale {:variables {:field-count {:value 35 :score 35}}}}}
              (score-entities es nil 1)))))
  (testing "collection-tree-size contributes +1 per collection in scope"
    (is (=? {:dimensions {:scale {:variables {:collection-tree-size {:value 7 :score 7}}}}}
            (score-entities [] nil 1 :collection-count 7))))
  (testing "fields-per-entity is descriptive (no :score)"
    (let [es [(entity :name "a" :field-count 4) (entity :name "b" :field-count 6)]]
      (is (=? {:dimensions {:scale {:variables {:fields-per-entity {:value 5.0}}}}}
              (score-entities es nil 1)))
      (is (nil? (get-in (score-entities es nil 1)
                        [:dimensions :scale :variables :fields-per-entity :score]))))))

(deftest ^:parallel nominal-dim-test
  (testing "name-collisions: 3 identical names = 2 pairs × 100 = 200; case-insensitive + whitespace-trimmed"
    (let [es [(entity :name "Orders") (entity :name " orders ") (entity :name "ORDERS")]]
      (is (=? {:dimensions {:nominal {:variables {:name-collisions {:value 2 :score 200}}}}}
              (score-entities es nil 1)))))
  (testing "repeated-measures: measure-name appearing on >1 entity = +2 per repeat"
    (let [es [(entity :name "a" :measure-names ["revenue" "discount"])
              (entity :name "b" :measure-names ["revenue"])
              (entity :name "c" :measure-names ["price"])]]
      (is (=? {:dimensions {:nominal {:variables {:repeated-measures {:value 1 :score 2}}}}}
              (score-entities es nil 1)))))
  (testing "field-level-collisions: field name appearing on >1 distinct table = +5 per collision"
    (let [es [(entity :name "orders"  :fields [{:name "id"} {:name "customer_id"}])
              (entity :name "widgets" :fields [{:name "id"} {:name "status"}])
              (entity :name "lonely"  :fields [{:name "only_here"}])]]
      (is (=? {:dimensions {:nominal {:variables {:field-level-collisions {:value 1 :score 5}}}}}
              (score-entities es nil 1)))))
  (testing "name-collisions-density is collisions/entity-count × 100"
    (let [es [(entity :name "a") (entity :name "a") (entity :name "b") (entity :name "c")]]
      (is (=? {:dimensions {:nominal {:variables {:name-collisions-density {:value 25.0}}}}}
              (score-entities es nil 1))))))

(deftest ^:parallel semantic-dim-triangle-plus-isolated-test
  (testing "triangle of similar names + one isolated name yields components=2, largest=3, cluster=1.0"
    (let [es       [(entity :name "a") (entity :name "b") (entity :name "c") (entity :name "d")]
          embedder (mock-embedder {"a" [1.0 0.0 0.0]
                                   "b" [0.99 0.1 0.0]
                                   "c" [0.98 0.12 0.02]
                                   "d" [0.0 0.0 1.0]})]
      (is (=? {:dimensions
               {:semantic
                {:variables {:synonym-pairs             {:value 3 :score 150}
                             :synonym-components        {:value 2}
                             :synonym-largest-component {:value 3}
                             :synonym-clustering-coef   {:value 1.0}}}}}
              (score-entities es embedder 2))))))

(deftest ^:parallel semantic-dim-graceful-degradation-test
  (testing "orthogonal vectors produce no pairs; clustering-coef is nil (no triples)"
    (let [es       [(entity :name "a") (entity :name "b")]
          embedder (mock-embedder {"a" [1.0 0.0] "b" [0.0 1.0]})]
      (is (=? {:dimensions {:semantic {:variables
                                       {:synonym-pairs {:value 0 :score 0}
                                        :synonym-clustering-coef {:value nil}}}}}
              (score-entities es embedder 2)))))
  (testing "exact-name duplicates don't double-count: name-collision counts once, synonym counts once"
    (let [es       [(entity :name "orders") (entity :name "orders") (entity :name "tickets")]
          embedder (mock-embedder {"orders" [1.0 0.0] "tickets" [0.0 1.0]})]
      (is (=? {:dimensions {:nominal  {:variables {:name-collisions {:value 1 :score 100}}}
                            :semantic {:variables {:synonym-pairs   {:value 0 :score 0}}}}}
              (score-entities es embedder 2)))))
  (testing "entities missing from the embedder are simply skipped"
    (let [es       [(entity :name "a") (entity :name "b") (entity :name "ghost")]
          embedder (mock-embedder {"a" [1.0 0.0] "b" [0.99 0.01]})]
      (is (=? {:dimensions {:semantic {:variables {:synonym-pairs {:value 1 :score 50}}}}}
              (score-entities es embedder 2)))))
  (testing "embedder failure degrades gracefully (score 0, not exception; :error propagates)"
    (let [es       [(entity :name "a") (entity :name "b")]
          embedder (fn [_] (throw (ex-info "boom" {})))]
      (is (=? {:dimensions {:semantic {:variables {:synonym-pairs {:value 0 :score 0
                                                                   :error "boom"}}}}}
              (score-entities es embedder 2))))))

(deftest ^:parallel semantic-dim-singleton-and-edge-density-regression-test
  (testing "a singleton graph reports one component and zero-valued graph ratios"
    (let [es       [(entity :name "only")]
          embedder (mock-embedder {"only" [1.0 0.0 0.0]})]
      (is (=? {:dimensions
               {:semantic
                {:variables {:synonym-pairs             {:value 0 :score 0}
                             :synonym-edge-density      {:value 0.0}
                             :synonym-components        {:value 1}
                             :synonym-largest-component {:value 1}
                             :synonym-avg-degree        {:value 0.0}
                             :synonym-degree-summary    {:value {:p50 0 :p90 0 :max 0}}}}}}
              (score-entities es embedder 2)))))
  (testing "edge density uses |E| / |V| * 100"
    (let [es       [(entity :name "a") (entity :name "b") (entity :name "c") (entity :name "d")]
          embedder (mock-embedder {"a" [1.0 0.0]
                                   "b" [0.95 0.05]
                                   "c" [0.94 0.06]
                                   "d" [0.0 1.0]})
          result   (score-entities es embedder 2)]
      (is (= 3 (get-in result [:dimensions :semantic :variables :synonym-pairs :value])))
      (is (= 75.0 (get-in result [:dimensions :semantic :variables :synonym-edge-density :value])))
      (is (= 1.5 (get-in result [:dimensions :semantic :variables :synonym-avg-degree :value]))))))

(deftest ^:parallel metadata-dim-test
  (testing "description-coverage counts entities whose description is ≥ 20 chars"
    (let [es [(entity :name "a" :description "A curated fact table for orders.")
              (entity :name "b" :description "short")
              (entity :name "c" :description nil)]]
      (is (=? {:dimensions {:metadata {:variables {:description-coverage {:value (/ 1.0 3.0)}}}}}
              (score-entities es nil 1)))))
  (testing "curated-metric-coverage is fraction of table entities with ≥ 1 measure"
    (let [es [(entity :name "a" :kind :table :measure-names ["x"])
              (entity :name "b" :kind :table :measure-names [])
              (entity :name "m" :kind :metric)]]
      (is (=? {:dimensions {:metadata {:variables {:curated-metric-coverage {:value 0.5}}}}}
              (score-entities es nil 1)))))
  (testing "metadata has no :score on any variable and is NOT in :total"
    (let [es [(entity :name "a" :description "A nicely-described table with lots of info.")]
          {:keys [total dimensions]} (score-entities es nil 1)]
      (is (nil? (get-in dimensions [:metadata :variables :description-coverage :score])))
      (is (nil? (get-in dimensions [:metadata :sub-total])))
      (is (= total (+ (get-in dimensions [:scale :sub-total])
                      (get-in dimensions [:nominal :sub-total]))))
      (is (contains? (:metadata dimensions) :coverage)))))

;;; ----------------------------- level-gated behavior ----------------------------

(deftest ^:sequential level-gating-test
  (testing "level 0 short-circuits — no dimensions computed for any catalog, no embedder call"
    (let [embed-calls (atom 0)
          embedder    (fn [& _] (swap! embed-calls inc) {})
          result      (complexity/score-from-entities (catalog [(entity :name "a")])
                                                      (catalog [(entity :name "b")])
                                                      embedder
                                                      {:level 0})]
      (is (= 0 @embed-calls) "embedder is never invoked at level 0")
      (is (= {} (get-in result [:library  :dimensions])))
      (is (= {} (get-in result [:universe :dimensions])))
      (is (= 0 (get-in result [:library  :total])))
      (is (= 0 (get-in result [:meta :level])))))
  (testing "level 1 omits :semantic and doesn't call the embedder"
    (let [embed-calls (atom 0)
          embedder    (fn [& _] (swap! embed-calls inc) {})
          result      (complexity/score-from-entities (catalog [(entity :name "a") (entity :name "b")])
                                                      (catalog [(entity :name "a") (entity :name "b")])
                                                      embedder
                                                      {:level 1})]
      (is (= 0 @embed-calls) "embedder is never invoked at level 1")
      (is (not (contains? (get-in result [:library :dimensions]) :semantic)))
      (is (contains? (get-in result [:library :dimensions]) :scale))
      (is (contains? (get-in result [:library :dimensions]) :nominal))
      (is (contains? (get-in result [:library :dimensions]) :metadata))))
  (testing "level defaults to the setting when absent"
    (mt/with-temporary-setting-values [settings/semantic-complexity-level 1]
      (let [result (complexity/score-from-entities (catalog [(entity :name "a")])
                                                   (catalog [(entity :name "b")])
                                                   (constantly {})
                                                   {})]
        (is (= 1 (get-in result [:meta :level])))
        (is (not (contains? (get-in result [:library :dimensions]) :semantic)))))))

;;; ------------------------ metabot-scope orchestration --------------------------

(deftest ^:sequential complexity-scores-metabot-scope-opt-test
  (testing ":verified-only? true routes :metabot through metabot-catalog"
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog []))
                                  complexity/universe-catalog (fn [] (catalog [(entity :name "orders")
                                                                               (entity :name "widgets")]))
                                  complexity/metabot-catalog  (fn [scope]
                                                                (reset! captured scope)
                                                                (catalog [(entity :name "orders")]))]
        (let [{:keys [universe metabot]} (complexity/complexity-scores
                                          :embedder nil
                                          :metabot-scope {:verified-only? true :collection-id nil})]
          (is (= {:verified-only? true :collection-id nil} @captured))
          (is (= 1 (get-in metabot  [:dimensions :scale :variables :entity-count :value])))
          (is (= 2 (get-in universe [:dimensions :scale :variables :entity-count :value])))))))
  (testing ":collection-id alone also routes through metabot-catalog"
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog []))
                                  complexity/universe-catalog (fn [] (catalog [(entity :name "orders")
                                                                               (entity :name "widgets")]))
                                  complexity/metabot-catalog  (fn [scope]
                                                                (reset! captured scope)
                                                                (catalog [(entity :name "orders")]))]
        (let [{:keys [metabot]} (complexity/complexity-scores
                                 :embedder nil
                                 :metabot-scope {:verified-only? false :collection-id 42})]
          (is (= {:verified-only? false :collection-id 42} @captured))
          (is (= 1 (get-in metabot [:dimensions :scale :variables :entity-count :value])))))))
  (testing "empty scope reuses the :universe score without recomputing"
    (doseq [scope [nil {} {:verified-only? false :collection-id nil}]]
      (let [metabot-called? (atom false)]
        (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog []))
                                    complexity/universe-catalog (fn [] (catalog [(entity :name "orders")]))
                                    complexity/metabot-catalog  (fn [_]
                                                                  (reset! metabot-called? true)
                                                                  (catalog []))]
          (let [{:keys [universe metabot]} (complexity/complexity-scores
                                            :embedder nil
                                            :metabot-scope scope)]
            (is (not @metabot-called?)
                (format "metabot-catalog was not invoked for scope=%s" (pr-str scope)))
            (is (identical? universe metabot))))))))

(deftest ^:sequential metabot-collection-scope-ids-test
  (testing "nil collection-id returns nil (no Metabot collection scope configured)"
    (is (nil? (#'complexity/metabot-collection-scope-ids nil))))
  (testing "valid collection-id returns the id plus its descendants"
    (mt/with-temp [:model/Collection {parent :id} {:name "Scope parent" :location "/"}
                   :model/Collection {child  :id} {:name "Scope child"  :location (format "/%d/" parent)}]
      (is (= #{parent child}
             (#'complexity/metabot-collection-scope-ids parent)))))
  (testing "invalid/deleted collection-id still returns a singleton set with the raw id"
    (let [ghost-id Integer/MAX_VALUE]
      (is (nil? (t2/select-one :model/Collection :id ghost-id))
          "pre-check: the phantom id isn't actually a real collection")
      (is (= #{ghost-id}
             (#'complexity/metabot-collection-scope-ids ghost-id))))))

(deftest ^:parallel fn-embedder-test
  (testing "normalizes names, dedupes, zips vectors by position, omits entries with no vector"
    (let [known-vectors {"foo" (float-array [1.0 0.0])
                         "bar" (float-array [0.0 1.0])}
          embedder      (embedders/fn-embedder (partial mapv known-vectors))
          result        (embedder [{:name "Foo"}
                                   {:name " BAR"}
                                   {:name " Foo  \t \n"}
                                   {:name "missing"}])]
      (is (=? {"foo" (known-vectors "foo")
               "bar" (known-vectors "bar")}
              result)))))

;;; -------------------------- live-DB integration tests --------------------------

(deftest ^:sequential library-empty-when-no-library-collection-test
  (testing "on an instance with no Library collection, the library score is zero and universe still reports"
    (collections.tu/without-library
     (mt/with-temp [:model/Database {db-id :id} {:name "No-library Test DB"}
                    :model/Table    _           {:db_id db-id :name "contributes_to_universe" :active true}]
       (let [{:keys [library universe]} (complexity/complexity-scores :embedder nil)]
         (testing "library dimension block is all zeros / no collisions"
           (is (= 0 (:total library)))
           (is (= 0 (get-in library [:dimensions :scale :variables :entity-count :value]))))
         (testing "universe still enumerates appdb content"
           (is (pos? (:total universe)))))))))

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(deftest ^:parallel startup-logic-registered-test
  (testing "loading the data-complexity-score init namespace registers a startup-logic method"
    (is (contains? (methods startup/def-startup-logic!)
                   :metabase-enterprise.data-complexity-score.init/PrintSemanticComplexityScore))))

(deftest ^:parallel search-index-embedder-degrades-gracefully-test
  (testing "returns {} when semantic-search index isn't available (no throw)"
    (is (= {} (semantic-search/search-index-embedder
               [(entity :name "orders" :kind :table)])))))

;;; --------------------------- search-index embedder -----------------------------
;;; These exercise the embedder itself, not the complexity scorer. Unchanged from v1.

(defn- stub-fetch-batch [expected]
  (let [unseen (atom (set (keys expected)))]
    {:unseen unseen
     :stub   (fn [_ _ pairs]
               (let [k (mapv vec pairs)]
                 (if (contains? @unseen k)
                   (do (swap! unseen disj k) (get expected k))
                   (throw (ex-info (format "fetch-batch called with unexpected or duplicate pairs: %s (remaining expected: %s)"
                                           (pr-str k) (pr-str @unseen))
                                   {:pairs k :remaining @unseen})))))}))

(deftest ^:sequential search-index-embedder-global-dedup-test
  (testing "global dedup picks lowest numeric model_id regardless of batch boundaries"
    (let [winner-vec (float-array [1.0 0.0 0.0])
          loser-vec  (float-array [0.0 1.0 0.0])
          {:keys [unseen stub]}
          (stub-fetch-batch
           {[["table" "10"]] [{:name "Orders" :model_id "10" :model "table" :embedding loser-vec}]
            [["table" "2"]]  [{:name "orders" :model_id "2"  :model "table" :embedding winner-vec}]})]
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector :mock :table-name "t" :model nil})
                    ss.embedders/fetch-batch-size 1
                    ss.embedders/fetch-batch stub]
        (let [result (semantic-search/search-index-embedder
                      [{:id 10 :name "Orders" :kind :table}
                       {:id 2  :name "orders" :kind :table}])]
          (is (= 1 (count result)))
          (is (= (seq winner-vec) (seq (get result "orders"))))
          (is (empty? @unseen))))))
  (testing "cross-model duplicates: lowest model_id wins, model is secondary tie-break"
    (let [card-vec  (float-array [1.0 0.0])
          table-vec (float-array [0.0 1.0])
          {:keys [unseen stub]}
          (stub-fetch-batch
           {[["card" "5"]]  [{:name "Revenue" :model_id "5" :model "card"  :embedding card-vec}]
            [["table" "5"]] [{:name "revenue" :model_id "5" :model "table" :embedding table-vec}]})]
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector :mock :table-name "t" :model nil})
                    ss.embedders/fetch-batch-size 1
                    ss.embedders/fetch-batch stub]
        (let [result (semantic-search/search-index-embedder
                      [{:id 5 :name "Revenue" :kind :question}
                       {:id 5 :name "revenue" :kind :table}])]
          (is (= 1 (count result)))
          (is (= (seq card-vec) (seq (get result "revenue"))))
          (is (empty? @unseen)))))))

(deftest ^:parallel prefer-new-row-test
  (let [prefer? #'ss.embedders/prefer-new-row?]
    (are [expected new-row prior-row]
         (= expected (prefer? new-row prior-row))
      true  {:mid 2  :model_id "2"  :model "card"}   {:mid 10 :model_id "10" :model "card"}
      false {:mid 10 :model_id "10" :model "card"}   {:mid 2  :model_id "2"  :model "card"}
      true  {:mid 5  :model_id "5"  :model "card"}   {:mid 5  :model_id "5"  :model "table"}
      false {:mid 5  :model_id "5"  :model "table"}  {:mid 5  :model_id "5"  :model "card"}
      true  {:mid 2  :model_id "02" :model "card"}   {:mid 2  :model_id "2"  :model "card"}
      false {:mid 2  :model_id "2"  :model "card"}   {:mid 2  :model_id "02" :model "card"}
      true  {:mid 99 :model_id "99" :model "card"}   {:mid nil :model_id "abc" :model "card"}
      false {:mid nil :model_id "abc" :model "card"}  {:mid 1  :model_id "1"   :model "card"}
      true  {:mid nil :model_id "abc" :model "card"}  {:mid nil :model_id "xyz" :model "card"}
      false {:mid nil :model_id "xyz" :model "card"}  {:mid nil :model_id "abc" :model "card"})))

(deftest ^:sequential meta-embedding-model-absent-when-unavailable-test
  (with-redefs [complexity/library-catalog  (fn [] (catalog []))
                complexity/universe-catalog (fn [] (catalog []))]
    (testing ":embedding-model key is absent from :meta when the search index is unreachable"
      (with-redefs [ss.embedders/try-active-index-state (constantly nil)]
        (let [{:keys [meta]} (complexity/complexity-scores :embedder semantic-search/search-index-embedder)]
          (is (not (contains? meta :embedding-model))))))
    (testing ":embedding-model key is present in :meta when the active model is non-nil"
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector   :mock
                                 :table-name "mock_table"
                                 :model      {:provider "openai" :model-name "text-embedding-3-small"}})
                    ss.embedders/fetch-batch (constantly [])]
        (let [{:keys [meta]} (complexity/complexity-scores :embedder semantic-search/search-index-embedder)]
          (is (= {:provider "openai" :model-name "text-embedding-3-small"}
                 (:embedding-model meta))))))))

(deftest ^:sequential active-embedding-model-reads-from-active-index-test
  (testing "active-embedding-model returns the model from the active index, not the configured setting"
    (let [active-model {:provider "openai" :model-name "text-embedding-ada-002"}]
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector   :mock
                                 :table-name "mock_table"
                                 :model      active-model})]
        (is (= active-model
               (semantic-search/active-embedding-model))))))
  (testing "active-embedding-model returns nil when the index state has no model"
    (with-redefs [ss.embedders/try-active-index-state
                  (constantly {:pgvector   :mock
                               :table-name "mock_table"
                               :model      nil})]
      (is (nil? (semantic-search/active-embedding-model)))))
  (testing "active-embedding-model returns nil when the index is unreachable"
    (with-redefs [ss.embedders/try-active-index-state (constantly nil)]
      (is (nil? (semantic-search/active-embedding-model))))))

;;; --------------------------------- Snowplow ------------------------------------

(defn- complexity-events! []
  (->> (snowplow-test/pop-event-data-and-user-id!)
       (map :data)
       (filter #(= "data_complexity_scored" (get % "event")))))

(defn- raw-complexity-events []
  (->> @snowplow-test/*snowplow-collector*
       (map #(get-in % [:properties "data"]))
       (filter #(= "iglu:com.metabase/semantic_complexity/jsonschema/2-0-0"
                   (get % "schema")))))

(def ^:private semantic-complexity-schema
  (delay
    (-> "snowplow/iglu-client-embedded/schemas/com.metabase/semantic_complexity/jsonschema/2-0-0"
        slurp
        json/decode+kw)))

(defn- schema-enum
  [prop]
  (set (get-in @semantic-complexity-schema [:properties prop :enum])))

(deftest ^:sequential emit-snowplow-publishes-totals-and-variables-test
  (testing "one event per catalog-total + one per (catalog × dimension × variable)"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog [(entity :name "a")
                                                                               (entity :name "b")]))
                                  complexity/universe-catalog (fn [] (catalog [(entity :name "a")
                                                                               (entity :name "b")
                                                                               (entity :name "c")]))]
        (snowplow-test/pop-event-data-and-user-id!)
        (complexity/complexity-scores :embedder nil)
        (let [events (complexity-events!)
              by-cat (group-by #(get % "catalog") events)
              axis-of #(set (map (fn [e] (get e "axis")) %))]
          (testing "every event carries event name + formula version + level"
            (is (every? (fn [e]
                          (and (= "data_complexity_scored" (get e "event"))
                               (integer? (get e "formula_version"))
                               (integer? (get e "level"))))
                        events)))
          (testing "each catalog emits a :total event (no :dimension key) plus variable events"
            (doseq [cat ["library" "universe" "metabot"]]
              (is (contains? (axis-of (get by-cat cat)) "total")
                  (format "%s has a :axis=total event" cat))
              (is (some #(and (= "total" (get % "axis"))
                              (not (contains? % "dimension")))
                        (get by-cat cat))
                  (format "%s :total event omits :dimension" cat))))
          (testing "variable events carry :dimension"
            (let [var-events (filter #(not= "total" (get % "axis")) events)]
              (is (every? #(string? (get % "dimension")) var-events)))))))))

(deftest ^:sequential emit-snowplow-includes-measurement-test
  (testing "scored variable events carry their raw pre-score measurement"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog [(entity :name "orders" :field-count 2)
                                                                               (entity :name "orders" :field-count 0)
                                                                               (entity :name "widgets" :field-count 3)]
                                                                              5))
                                  complexity/universe-catalog (fn [] (catalog []))]
        (snowplow-test/pop-event-data-and-user-id!)
        (complexity/complexity-scores :embedder nil)
        (let [by-axis (->> (complexity-events!)
                           (filter #(= "library" (get % "catalog")))
                           (into {} (map (juxt #(get % "axis") identity))))]
          (is (= 3 (get-in by-axis ["entity_count" "measurement"])))
          (is (= 5 (get-in by-axis ["field_count"  "measurement"])))
          (is (= 1 (get-in by-axis ["name_collisions" "measurement"])))
          (testing "the aggregate total has no measurement key"
            (is (not (contains? (get by-axis "total") "measurement")))))))))

(deftest ^:sequential emit-snowplow-propagates-error-on-embedder-failure-test
  (testing ":synonym_pairs event carries the embedder error string; other axes do not"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog [(entity :name "customers")
                                                                               (entity :name "clients")]))
                                  complexity/universe-catalog (fn [] (catalog []))]
        (snowplow-test/pop-event-data-and-user-id!)
        (complexity/complexity-scores :embedder (fn [_] (throw (ex-info "embedder boom" {}))))
        (let [by-axis (->> (complexity-events!)
                           (filter #(= "library" (get % "catalog")))
                           (into {} (map (juxt #(get % "axis") identity))))]
          (is (= "embedder boom" (get-in by-axis ["synonym_pairs" "error"])))
          (is (not-any? #(contains? % "error")
                        (vals (dissoc by-axis "synonym_pairs")))))))))

(deftest ^:sequential emit-snowplow-truncates-error-to-schema-max-test
  (testing "a pathologically long exception message is truncated so it doesn't fail schema validation"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog [(entity :name "customers")
                                                                               (entity :name "clients")]))
                                  complexity/universe-catalog (fn [] (catalog []))]
        (snowplow-test/pop-event-data-and-user-id!)
        (let [huge (apply str (repeat 5000 "x"))]
          (complexity/complexity-scores :embedder (fn [_] (throw (ex-info huge {}))))
          (let [err (->> (complexity-events!)
                         (filter #(and (= "library" (get % "catalog"))
                                       (= "synonym_pairs" (get % "axis"))))
                         first
                         (#(get % "error")))]
            (is (= 1024 (count err))
                "error is clipped to the schema's maxLength of 1024")))))))

(deftest ^:sequential emit-snowplow-schema-2-0-0-payload-shape-test
  (snowplow-test/with-fake-snowplow-collector
    (doseq [level [0 1 2]]
      (testing (format "level %d events match schema 2-0-0 payload expectations" level)
        (snowplow-test/pop-event-data-and-user-id!)
        (let [result (complexity/score-from-entities
                      (catalog [(entity :name "orders" :field-count 2)
                                (entity :name "orders" :field-count 0)]
                               2)
                      (catalog [(entity :name "facts"
                                        :description "A long enough description for coverage.")]
                               1)
                      (mock-embedder {"orders" [1.0 0.0]
                                      "facts"  [0.0 1.0]})
                      {:level level})]
          (#'complexity/emit-snowplow! result)
          (let [raw-events            (raw-complexity-events)
                events                (complexity-events!)
                expected-axes         (set
                                       (mapcat
                                        (fn [[catalog {:keys [dimensions]}]]
                                          (cons ["total" nil (name catalog)]
                                                (for [[dimension {:keys [variables]}] dimensions
                                                      axis                         (keys variables)]
                                                  [(#'complexity/axis-name axis)
                                                   (name dimension)
                                                   (name catalog)])))
                                        [[:library (:library result)]
                                         [:universe (:universe result)]
                                         [:metabot (:metabot result)]]))
                emitted-axes          (set (map (juxt #(get % "axis")
                                                      #(get % "dimension")
                                                      #(get % "catalog"))
                                                events))
                total                 (first (filter #(and (= "library" (get % "catalog"))
                                                           (= "total" (get % "axis")))
                                                     events))
                fields-per-entity     (first (filter #(and (= "library" (get % "catalog"))
                                                           (= "fields_per_entity" (get % "axis")))
                                                     events))
                description-coverage  (first (filter #(and (= "universe" (get % "catalog"))
                                                           (= "description_coverage" (get % "axis")))
                                                     events))
                name-collisions       (first (filter #(and (= "library" (get % "catalog"))
                                                           (= "name_collisions" (get % "axis")))
                                                     events))
                synonym-edge-density  (first (filter #(and (= "library" (get % "catalog"))
                                                           (= "synonym_edge_density" (get % "axis")))
                                                     events))]
            (is (seq raw-events) "sanity: semantic complexity events were emitted")
            (is (= (count raw-events) (count events)))
            (is (every? #(= "iglu:com.metabase/semantic_complexity/jsonschema/2-0-0"
                            (get % "schema"))
                        raw-events))
            (is (every? #(= level (get % "level")) events))
            (is (= expected-axes emitted-axes))
            (is (every? #(contains? (schema-enum :axis) (get % "axis")) events))
            (is (every? #(contains? (schema-enum :catalog) (get % "catalog")) events))
            (is (every? #(contains? (schema-enum :dimension) (get % "dimension")) events))
            (if (zero? level)
              (do
                (is (every? #(not (contains? % "synonym_threshold")) events))
                (is (every? #(= "total" (get % "axis")) events)))
              (do
                (is (= "scale" (get fields-per-entity "dimension")))
                (is (contains? fields-per-entity "measurement"))
                (is (not (contains? fields-per-entity "score")))
                (is (= "metadata" (get description-coverage "dimension")))
                (is (contains? description-coverage "measurement"))
                (is (not (contains? description-coverage "score")))
                (is (= "nominal" (get name-collisions "dimension")))
                (is (= 100 (get name-collisions "score")))
                (is (= 1 (get name-collisions "measurement")))
                (if (= 2 level)
                  (do
                    (is (every? #(contains? % "synonym_threshold") events))
                    (is (= "semantic" (get synonym-edge-density "dimension")))
                    (is (contains? synonym-edge-density "measurement"))
                    (is (not (contains? synonym-edge-density "score"))))
                  (is (every? #(not (contains? % "synonym_threshold")) events)))))
            (is (contains? total "score"))
            (is (not (contains? total "dimension")))
            (is (not (contains? total "measurement")))))))))

(deftest ^:sequential emit-snowplow-includes-embedding-model-meta-test
  (testing "every event carries embedding_model_provider/name when the search-index embedder is active"
    (snowplow-test/with-fake-snowplow-collector
      (with-redefs [ss.embedders/try-active-index-state
                    (constantly {:pgvector   :mock
                                 :table-name "mock_table"
                                 :model      {:provider "openai" :model-name "text-embedding-3-small"}})
                    ss.embedders/fetch-batch (constantly [])]
        (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog [(entity :name "orders")]))
                                    complexity/universe-catalog (fn [] (catalog [(entity :name "orders")]))]
          (snowplow-test/pop-event-data-and-user-id!)
          (complexity/complexity-scores :embedder semantic-search/search-index-embedder)
          (let [events (complexity-events!)]
            (is (seq events) "sanity: events were emitted")
            (is (every? #(= "openai" (get % "embedding_model_provider")) events))
            (is (every? #(= "text-embedding-3-small" (get % "embedding_model_name")) events))))))))

(deftest ^:sequential emit-snowplow-failure-is-swallowed-test
  (testing "Snowplow emission failure is caught; complexity-scores still returns the score"
    (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog [(entity :name "orders")]))
                                complexity/universe-catalog (fn [] (catalog [(entity :name "orders")]))
                                analytics/track-event!       (fn [& _] (throw (RuntimeException. "snowplow down")))]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.data-complexity-score.complexity :warn]]
        (let [result (complexity/complexity-scores :embedder nil)]
          (is (pos? (get-in result [:library  :total])))
          (is (pos? (get-in result [:universe :total])))
          (is (some #(re-find #"Failed to publish complexity score" (:message %))
                    (messages))))))))

(deftest ^:sequential local-info-log-is-emitted-even-when-snowplow-fails-test
  (testing "the 'Semantic complexity score' info log fires independently of Snowplow emission"
    (mt/with-dynamic-fn-redefs [complexity/library-catalog  (fn [] (catalog [(entity :name "orders")]))
                                complexity/universe-catalog (fn [] (catalog [(entity :name "orders")]))
                                analytics/track-event!       (fn [& _] (throw (RuntimeException. "snowplow down")))]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.data-complexity-score.complexity :info]]
        (complexity/complexity-scores :embedder nil)
        (is (some #(and (= :info (:level %))
                        (re-find #"Semantic complexity score" (:message %)))
                  (messages)))))))

(deftest ^:sequential startup-hook-schedules-complexity-scores-test
  (testing "the boot-time hook schedules complexity-scores via quick-task/submit-task!"
    ;; Guards four regressions together:
    ;; 1. A regression that calls `complexity-scores` directly instead of via `submit-task!`
    ;;    would still produce the old test's info-log assertion, but fails this test because
    ;;    `submit-task!` was never invoked.
    ;; 2. A regression that turned the hook body into a no-op would fail `scored?` here.
    ;; 3. `complexity-scores` is stubbed so the test exercises only the startup wiring — not
    ;;    the real search-index embedder or Snowplow collector.
    ;; 4. A regression that removes the `cluster-lock/with-cluster-lock` wrapper would fail the
    ;;    assertion that the lock was taken around scoring, reintroducing the multi-node
    ;;    concurrent-scoring bug.
    (let [submitted?    (atom false)
          scored?       (atom false)
          score-args    (atom nil)
          lock-opts     (atom nil)
          locked-during-score? (atom false)]
      (with-redefs [quick-task/submit-task!         (fn [task]
                                                      (reset! submitted? true)
                                                      (task)
                                                      nil)
                    cluster-lock/do-with-cluster-lock (fn [opts thunk]
                                                        (reset! lock-opts opts)
                                                        (thunk))
                    complexity/complexity-scores    (fn [& args]
                                                      (reset! scored? true)
                                                      (reset! score-args args)
                                                      (reset! locked-during-score?
                                                              (some? @lock-opts))
                                                      {})
                    analytics/track-event!          (fn [& _] nil)
                    semantic-search/search-index-embedder (constantly {})]
        (startup/def-startup-logic! ::init/PublishSemanticComplexityScore)
        (is (true? @submitted?) "the startup hook must schedule its work via quick-task/submit-task!")
        (is (true? @scored?)    "the scheduled task must invoke complexity/complexity-scores")
        (is (empty? @score-args) "the startup hook calls complexity-scores with no args")
        (is (true? @locked-during-score?)
            "scoring must run inside cluster-lock/with-cluster-lock")
        (is (=? {:lock :metabase-enterprise.data-complexity-score.init/publish-complexity-score-lock
                 :timeout-seconds pos-int?
                 :retry-config {:max-retries pos-int?
                                :delay-ms    pos-int?}}
                @lock-opts)
            "the cluster lock must use an explicit timeout/retry budget, not the bare-keyword defaults")))))

;;; ------------------------ hermetic library DB test -----------------------------

(deftest ^:sequential complexity-score-library-hermetic-test
  (testing "library score is computed over exactly the Library collection tree"
    (mt/with-temp
      [:model/Collection {lib-id :id}     {:type     collections/library-collection-type
                                           :name     "Library"
                                           :location "/"}
       :model/Collection {data-id :id}    {:type     collections/library-data-collection-type
                                           :name     "Data"
                                           :location (format "/%d/" lib-id)}
       :model/Collection {metrics-id :id} {:type     collections/library-metrics-collection-type
                                           :name     "Metrics"
                                           :location (format "/%d/" lib-id)}
       :model/Collection {other-id :id}   {:name "Outside" :location "/"}
       :model/Database {db-id :id}        {:name "Hermetic Library DB"}
       :model/Table    {t1 :id}           {:db_id db-id :name "orders"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    {t2 :id}           {:db_id db-id :name "subscriptions"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    _                  {:db_id db-id :name "clients"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    _                  {:db_id db-id :name "customers"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    {t-audit :id}      {:db_id db-id :name "audit_events"
                                           :active true :is_published false :collection_id other-id}
       :model/Table    _                  {:db_id db-id :name "audit_log"
                                           :active true :is_published false :collection_id other-id}
       :model/Field _                     {:table_id t1 :name "id"    :active true :base_type :type/Integer}
       :model/Field _                     {:table_id t1 :name "total" :active true :base_type :type/Float}
       :model/Field _                     {:table_id t2 :name "id"    :active true :base_type :type/Integer}
       :model/Field _                     {:table_id t-audit :name "audit_id"
                                           :active true :base_type :type/Integer}
       :model/Field _                     {:table_id t-audit :name "audit_ts"
                                           :active true :base_type :type/DateTime}
       :model/Measure _                   {:table_id t1 :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       :model/Measure _                   {:table_id t2 :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       :model/Measure _                   {:table_id t-audit :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       :model/Card _                      {:database_id db-id :type :metric :name "Revenue"
                                           :archived false :collection_id metrics-id}
       :model/Card _                      {:database_id db-id :type :metric :name "Revenue"
                                           :archived false :collection_id metrics-id}
       :model/Card _                      {:database_id db-id :type :model :name "Revenue"
                                           :archived false :collection_id other-id}]
      (let [embedder (mock-embedder {"orders"        [1.0  0.0  0.0  0.0 0.0 0.0 0.0]
                                     "subscriptions" [0.0  1.0  0.0  0.0 0.0 0.0 0.0]
                                     "clients"       [0.0  0.0  1.0  0.0 0.0 0.0 0.0]
                                     "customers"     [0.0  0.0  0.99 0.1 0.0 0.0 0.0]
                                     "revenue"       [0.0  0.0  0.0  0.0 1.0 0.0 0.0]
                                     "audit_events"  [0.0  0.0  0.0  0.0 0.0 1.0 0.0]
                                     "audit_log"     [0.0  0.0  0.0  0.0 0.0 0.99 0.1]})
            {:keys [library universe]} (complexity/complexity-scores {:embedder embedder})]
        (testing "library exact dimension breakdown"
          ;; Library: 4 tables + 2 metric cards = 6 entities.
          ;;   scale.entity-count        6 × 10 = 60
          ;;   scale.field-count         orders(2) + subscriptions(1) + others(0) = 3 → 3
          ;;   scale.collection-tree-size 3 collections in tree (lib root + data + metrics) → 3
          ;;   nominal.name-collisions   "Revenue" × 2 metric cards = 1 pair × 100 = 100
          ;;   nominal.repeated-measures "revenue" on orders + subscriptions = 1 × 2 = 2
          ;;   nominal.field-level       "id" on orders + subscriptions = 1 × 5 = 5
          ;;   semantic.synonym-pairs    clients ↔ customers = 1 × 50 = 50
          ;;   total = 60 + 3 + 3 + 100 + 2 + 5 + 50 = 223
          (is (=? {:total 223
                   :dimensions
                   {:scale    {:variables {:entity-count         {:value 6 :score 60}
                                           :field-count          {:value 3 :score 3}
                                           :collection-tree-size {:value 3 :score 3}}}
                    :nominal  {:variables {:name-collisions        {:value 1 :score 100}
                                           :repeated-measures      {:value 1 :score 2}
                                           :field-level-collisions {:value 1 :score 5}}}
                    :semantic {:variables {:synonym-pairs {:value 1 :score 50}}}}}
                  library)))
        (testing "universe is a strict superset of library on every scored axis"
          (doseq [[dim var] [[:scale    :entity-count]
                             [:scale    :field-count]
                             [:nominal  :name-collisions]
                             [:nominal  :repeated-measures]
                             [:nominal  :field-level-collisions]
                             [:semantic :synonym-pairs]]
                  metric    [:value :score]
                  :let [lib (get-in library  [:dimensions dim :variables var metric])
                        uni (get-in universe [:dimensions dim :variables var metric])]]
            (is (> uni lib)
                (format "universe %s %s %s (%d) should be strictly > library's (%d)"
                        dim var metric uni lib))))
        (testing "universe total is strictly higher"
          (is (> (:total universe) (:total library))))))))

(comment
  ;; Avoid the `str` unused-require warning by touching the alias.
  (str/trim "x"))
