(ns metabase-enterprise.semantic-layer.complexity-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase-enterprise.semantic-layer.complexity-embedders :as embedders]
   [metabase-enterprise.semantic-layer.init]
   [metabase-enterprise.semantic-search.core :as semantic-search]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]))

(def ^:private test-entity-ids (atom 0))

(defn- entity
  "Build a fake entity map for scoring tests. Uses a monotonically-increasing counter for `:id`
  so every test entity is distinct (and so test failures print stable, readable ids)."
  [& {:keys [name kind field-count measure-names]
      :or   {kind :table field-count 0 measure-names []}}]
  {:id            (swap! test-entity-ids inc)
   :name          name
   :kind          kind
   :field-count   field-count
   :measure-names measure-names})

(defn- mock-embedder
  "Build an embedder backed by a `{name -> vector-literal}` lookup table for tests."
  [name->vec-literal]
  (embedders/fn-embedder
   (fn [names]
     (mapv #(when-let [v (get name->vec-literal %)] (float-array v)) names))))

(deftest score-catalog-pure-test
  (testing "empty catalog scores zero"
    (is (=? {:total 0
             :components {:entity-count      {:count 0 :score 0}
                          :name-collisions   {:pairs 0 :score 0}
                          :synonym-pairs     {:pairs 0 :score 0}
                          :field-count       {:count 0 :score 0}
                          :repeated-measures {:count 0 :score 0}}}
            (#'complexity/score-catalog [] nil))))

  (testing "entity count contributes +10 per entity"
    (let [es [(entity :name "orders")
              (entity :name "customers")
              (entity :name "products")]]
      (is (=? {:total 30
               :components {:entity-count {:count 3 :score 30}}}
              (#'complexity/score-catalog es nil)))))

  (testing "name collisions stack linearly: 3 identical names = +200"
    (let [es [(entity :name "orders")
              (entity :name "orders")
              (entity :name "orders")]]
      (is (=? {:components {:entity-count    {:count 3 :score 30}
                            :name-collisions {:pairs 2 :score 200}}}
              (#'complexity/score-catalog es nil)))))

  (testing "collision detection is case-insensitive and trims whitespace"
    (let [es [(entity :name "Orders")
              (entity :name " orders ")
              (entity :name "ORDERS")]]
      (is (=? {:components {:name-collisions {:pairs 2 :score 200}}}
              (#'complexity/score-catalog es nil)))))

  (testing "field count contributes +1 per field, summed across entities"
    (let [es [(entity :name "a" :field-count 10)
              (entity :name "b" :field-count 25)]]
      (is (=? {:components {:field-count {:count 35 :score 35}}}
              (#'complexity/score-catalog es nil)))))

  (testing "repeated measures contribute +2 per repeat (measure name appearing on >1 entity)"
    (let [es [(entity :name "invoices"      :measure-names ["revenue" "discount"])
              (entity :name "subscriptions" :measure-names ["revenue"])
              (entity :name "products"      :measure-names ["price"])]]
      (is (=? {:components {:repeated-measures {:count 1 :score 2}}}
              (#'complexity/score-catalog es nil)))))

  (testing "nil embedder disables synonym scoring"
    (let [es [(entity :name "customers") (entity :name "clients")]]
      (is (=? {:components {:synonym-pairs {:pairs 0 :score 0}}}
              (#'complexity/score-catalog es nil))))))

(deftest synonym-scoring-test
  (testing "cosine similarity above threshold flags a synonym pair"
    (let [es       [(entity :name "customers") (entity :name "clients")]
          embedder (mock-embedder {"customers" [1.0 0.0 0.0]
                                   "clients"   [0.9 0.1 0.0]})]
      (is (=? {:components {:synonym-pairs {:pairs 1 :score 50}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "orthogonal embeddings produce no synonym pairs"
    (let [es       [(entity :name "customers") (entity :name "widgets")]
          embedder (mock-embedder {"customers" [1.0 0.0]
                                   "widgets"   [0.0 1.0]})]
      (is (=? {:components {:synonym-pairs {:pairs 0 :score 0}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "exact-name duplicates don't double-count as synonym pairs"
    (let [es       [(entity :name "orders") (entity :name "orders") (entity :name "tickets")]
          embedder (mock-embedder {"orders"  [1.0 0.0]
                                   "tickets" [0.0 1.0]})]
      (is (=? {:components {:name-collisions {:pairs 1 :score 100}
                            :synonym-pairs   {:pairs 0 :score 0}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "entities without a vector from the embedder are simply skipped"
    (let [es       [(entity :name "customers") (entity :name "clients") (entity :name "ghost")]
          ;; "ghost" is missing → not considered. The remaining two are synonyms.
          embedder (mock-embedder {"customers" [1.0 0.0]
                                   "clients"   [0.99 0.01]})]
      (is (=? {:components {:synonym-pairs {:pairs 1 :score 50}}}
              (#'complexity/score-catalog es embedder)))))

  (testing "embedder failure degrades gracefully (score 0, not exception)"
    (let [es       [(entity :name "customers") (entity :name "clients")]
          embedder (fn [_] (throw (ex-info "boom" {})))]
      (is (=? {:components {:synonym-pairs {:pairs 0 :score 0 :error "boom"}}}
              (#'complexity/score-catalog es embedder))))))

(deftest library-empty-when-no-library-collection-test
  (testing "on an instance with no Library collection, the library score is zero and universe still reports"
    (collections.tu/without-library
     (mt/with-temp [:model/Database {db-id :id} {:name "No-library Test DB"}
                    :model/Table    _           {:db_id db-id :name "contributes_to_universe" :active true}]
       (let [{:keys [library universe]} (complexity/complexity-scores {:embedder nil})]
         (testing "library is empty (no collection tree)"
           (is (= {:total 0
                   :components {:entity-count      {:count 0 :score 0}
                                :name-collisions   {:pairs 0 :score 0}
                                :synonym-pairs     {:pairs 0 :score 0}
                                :field-count       {:count 0 :score 0}
                                :repeated-measures {:count 0 :score 0}}}
                  library)))
         (testing "universe still enumerates appdb content (our temp table + whatever else is there)"
           (is (pos? (:total universe)))))))))

(deftest startup-logic-registered-test
  (testing "loading the semantic-layer init namespace registers a startup-logic method"
    (is (contains? (methods startup/def-startup-logic!)
                   :metabase-enterprise.semantic-layer.init/PrintSemanticComplexityScore))))

(deftest search-index-embedder-degrades-gracefully-test
  (testing "returns {} when semantic-search index isn't available (no throw)"
    (is (= {} (semantic-search/search-index-embedder
               [(entity :name "orders" :kind :table)])))))

(deftest complexity-score-library-hermetic-test
  (testing "library score is computed over exactly the Library collection tree — known inputs produce known scores"
    ;; The library tree gets a fixed set of tables, fields, measures, and metric cards. One extra
    ;; collection + table + card sit outside the library so the universe is a strict superset.
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
       ;; Library tables. clients + customers are a synonym pair for the mock embedder below.
       :model/Table    {t1 :id}           {:db_id db-id :name "orders"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    {t2 :id}           {:db_id db-id :name "subscriptions"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    _                  {:db_id db-id :name "clients"
                                           :active true :is_published true :collection_id data-id}
       :model/Table    _                  {:db_id db-id :name "customers"
                                           :active true :is_published true :collection_id data-id}
       ;; Non-library tables: active (→ in universe) but not published into the library tree.
       ;; audit_events + audit_log are another synonym pair via the mock embedder.
       :model/Table    {t-audit :id}      {:db_id db-id :name "audit_events"
                                           :active true :is_published false :collection_id other-id}
       :model/Table    _                  {:db_id db-id :name "audit_log"
                                           :active true :is_published false :collection_id other-id}
       ;; Library fields: 2 on orders, 1 on subscriptions.
       :model/Field _                     {:table_id t1 :name "id"    :active true :base_type :type/Integer}
       :model/Field _                     {:table_id t1 :name "total" :active true :base_type :type/Float}
       :model/Field _                     {:table_id t2 :name "id"    :active true :base_type :type/Integer}
       ;; Non-library fields on audit_events → bumps universe field-count above library.
       :model/Field _                     {:table_id t-audit :name "audit_id"
                                           :active true :base_type :type/Integer}
       :model/Field _                     {:table_id t-audit :name "audit_ts"
                                           :active true :base_type :type/DateTime}
       ;; Library measures: "revenue" on two library tables → one repeated-measure pair in library.
       :model/Measure _                   {:table_id t1 :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       :model/Measure _                   {:table_id t2 :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       ;; Non-library measure with the same name → bumps universe repeated-measures above library.
       :model/Measure _                   {:table_id t-audit :name "revenue"
                                           :creator_id (mt/user->id :rasta)
                                           :definition {} :archived false}
       ;; Two library metric cards named "Revenue" → one name-collision pair in library.
       :model/Card _                      {:database_id db-id :type :metric :name "Revenue"
                                           :archived false :collection_id metrics-id}
       :model/Card _                      {:database_id db-id :type :metric :name "Revenue"
                                           :archived false :collection_id metrics-id}
       ;; Non-library card also named "Revenue" → 3 "Revenue" entities in universe → 2 collision pairs.
       :model/Card _                      {:database_id db-id :type :model :name "Revenue"
                                           :archived false :collection_id other-id}]
      ;; Each name gets its own orthogonal dimension so only the intended pairs cluster.
      (let [embedder (mock-embedder {"orders"        [1.0  0.0  0.0  0.0 0.0 0.0 0.0]
                                     "subscriptions" [0.0  1.0  0.0  0.0 0.0 0.0 0.0]
                                     "clients"       [0.0  0.0  1.0  0.0 0.0 0.0 0.0]
                                     "customers"     [0.0  0.0  0.99 0.1 0.0 0.0 0.0]   ; ≈ clients (library)
                                     "revenue"       [0.0  0.0  0.0  0.0 1.0 0.0 0.0]   ; "Revenue" cards normalize here
                                     "audit_events"  [0.0  0.0  0.0  0.0 0.0 1.0 0.0]
                                     "audit_log"     [0.0  0.0  0.0  0.0 0.0 0.99 0.1]}) ; ≈ audit_events (universe-only)
            {:keys [library universe]} (complexity/complexity-scores {:embedder embedder})]
        (testing "library reflects exactly what we put in the Library collection tree"
          ;; Library: 4 tables + 2 metric cards = 6 entities.
          ;;  entity-count       6 × 10 = 60
          ;;  name-collisions    "revenue" (2 metric cards) = 1 pair × 100 = 100
          ;;  synonym-pairs      clients ↔ customers = 1 × 50 = 50
          ;;  field-count        orders(2) + subscriptions(1) + others(0) = 3 × 1 = 3
          ;;  repeated-measures  "revenue" on orders + subscriptions = 1 × 2 = 2
          ;;  total              60 + 100 + 50 + 3 + 2 = 215
          (is (= {:total      215
                  :components {:entity-count      {:count 6 :score 60}
                               :name-collisions   {:pairs 1 :score 100}
                               :synonym-pairs     {:pairs 1 :score 50}
                               :field-count       {:count 3 :score 3}
                               :repeated-measures {:count 1 :score 2}}}
                 library)))
        (testing "universe is a strict superset of library on every axis: every count and score is higher"
          ;; Different components use different 'count' keys: :pairs for collision/synonym, :count elsewhere.
          (doseq [[component count-key] [[:entity-count      :count]
                                         [:name-collisions   :pairs]
                                         [:synonym-pairs     :pairs]
                                         [:field-count       :count]
                                         [:repeated-measures :count]]
                  k [count-key :score]
                  :let [lib-v (get-in library  [:components component k])
                        uni-v (get-in universe [:components component k])]]
            (is (> uni-v lib-v)
                (format "universe %s %s (%d) should be strictly > library %s %s (%d)"
                        component k uni-v component k lib-v))))
        (testing "universe total is strictly higher than library total"
          (is (> (:total universe) (:total library))))))))

