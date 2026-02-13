(ns metabase.search.filter-test
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.test :refer :all]
   [metabase.models.resolution]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]
   [metabase.search.in-place.filter :as search.in-place.filter]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk] (binding [search.ingestion/*force-sync* true]
                                  (search.tu/with-new-search-if-available-otherwise-legacy (thunk)))))

(defn- filter-keys []
  (remove #{:ids} (map :context-key (vals search.config/filters))))

(defn- active-filter-combinations []
  ;; We ignore :archived? as we've moved some of these filters to the `:where` clause as a simplifying optimization.
  ;; We ignore :card-db-id as legacy search implements this filter sneakily inside the models themselves.
  (math.combo/subsets (remove #{:archived? :table-db-id} (filter-keys))))

(defn- with-all-models [search-ctx]
  (assoc search-ctx
         :models search.config/all-models
         :enabled-transform-source-types #{"mbql"}))

(defn- with-all-models-and-regular-user [search-ctx]
  (with-all-models (assoc search-ctx :is-impersonated-user? false :is-sandboxed-user? false)))

(defn- with-all-models-and-sandboxed-user [search-ctx]
  (with-all-models (assoc search-ctx :is-impersonated-user? false :is-sandboxed-user? true)))

(defn- with-all-models-and-superuser [search-ctx]
  (-> search-ctx
      with-all-models-and-regular-user
      (assoc :is-superuser? true)))

(defn- test-value-for-filter
  "Returns an appropriate test value for each filter type."
  [filter-key]
  (case filter-key
    ;; Boolean filters
    (:archived? :search-native-query :verified) true
    ;; Collection filters (sets/sequences)
    (:created-by :last-edited-by :ids) #{1}
    :display-type #{"table"}
    ;; Date range filters (strings)
    (:created-at :last-edited-at) "2023-01-01"
    ;; Single value filters
    :table-db-id 1
    true))

(defn- create-test-filter-context
  "Creates a test filter context with appropriate values for each filter."
  [active-filters]
  (into {} (map (fn [filter-key]
                  [filter-key (test-value-for-filter filter-key)])
                active-filters)))

(deftest search-context->applicable-models-test
  (testing "All models (except transforms, which are admin-only) are relevant if we're not looking in the trash"
    (is (= (disj search.config/all-models "transform")
           (search.filter/search-context->applicable-models (with-all-models-and-regular-user {:archived? false})))))

  (testing "We only search for certain models in the trash"
    (is (= #{"dashboard" "dataset" "document" "segment" "measure" "collection" "action" "metric" "card"}
           (search.filter/search-context->applicable-models (with-all-models-and-regular-user {:archived? true})))))

  (testing "Indexed entities and transforms (which are admin-only) are not visible for sandboxed users"
    (is (= (disj search.config/all-models "indexed-entity" "transform")
           (search.filter/search-context->applicable-models (with-all-models-and-sandboxed-user {:archived? false})))))

  (testing "All models including transforms are visible for superusers"
    (is (= search.config/all-models
           (search.filter/search-context->applicable-models (with-all-models-and-superuser {:archived? false})))))

  (doseq [active-filters (active-filter-combinations)]
    (testing (str "Consistent models included when filtering on " (vec active-filters))
      (let [search-ctx (with-all-models-and-regular-user (create-test-filter-context active-filters))]
        (is (= (search.in-place.filter/search-context->applicable-models search-ctx)
               (search.filter/search-context->applicable-models search-ctx)))))))

(def kitchen-sink-filter-context
  {:archived?                      true
   :collection                     5
   :created-at                     "2024-10-01"
   :created-by                     [123]
   :include-dashboard-questions?   true
   :table-db-id                    231
   :last-edited-by                 [321]
   :last-edited-at                 "2024-10-02"
   :search-native-query            true
   :verified                       true
   :ids                            [1 2 3 4]
   :non-temporal-dim-ids           "[1]"
   :has-temporal-dim               true
   :display-type                   ["line"]
   :models                         (disj search.config/all-models "dataset")
   :enabled-transform-source-types #{"mbql"}})

(deftest with-filters-test
  (mt/with-premium-features #{}
    (testing "The kitchen sink context is complete"
      (is (empty? (remove kitchen-sink-filter-context (filter-keys)))))

    (testing "In the general case, we simply filter by models, and exclude dashboard cards"
      (is (= {:select [:some :stuff],
              :from :somewhere,
              :where
              [:and
               [:= 1 2]
               [:or [:= nil :search_index.dashboard_id] nil]]}
             (search.filter/with-filters {:models []} {:select [:some :stuff], :from :somewhere})))
      (is (= {:select [:some :stuff],
              :from :somewhere,
              :where
              [:and
               [:in :search_index.model ["a"]]
               [:or [:= nil :search_index.dashboard_id] nil]]}
             (search.filter/with-filters {:models ["a"]} {:select [:some :stuff], :from :somewhere}))))

    (testing "We can insert appropriate constraints for all the filters"
      (is (= {:select [:some :stuff],
              :from :somewhere,
              :where
              #{[:in :search_index.last_editor_id [321]]
                [:in :search_index.creator_id [123]]
                [:or [:= :search_index.collection_id 5] [:like :collection.location "%/5/%"]]
                [:not= :search_index.model [:inline "table"]]
                [:= :search_index.archived true]
                [:in :search_index.model ["card" "dataset" "metric" "dashboard" "action"]]
                [:or
                 [:= nil :search_index.dashboard_id]
                 [:not= [:inline 0] [:coalesce :search_index.dashboardcard_count [:inline 0]]]]
                [:in
                 :search_index.model
                 #{"dashboard"
                   "table"
                   "segment"
                   "collection"
                   "measure"
                   "transform"
                   "document"
                   "database"
                   "action"
                   "indexed-entity"
                   "metric"
                   "card"}]
                [:< [:cast :search_index.model_created_at :date] #t "2024-10-02"]
                [:in :search_index.model_id ["1" "2" "3" "4"]]
                [:< [:cast :search_index.last_edited_at :date] #t "2024-10-03"]
                [:>= [:cast :search_index.model_created_at :date] #t "2024-10-01"]
                [:= :search_index.non_temporal_dim_ids "[1]"]
                [:= :search_index.has_temporal_dim true]
                :and
                [:= :search_index.database_id 231]
                [:in :search_index.display_type ["line"]]
                [:>= [:cast :search_index.last_edited_at :date] #t "2024-10-02"]}}
             (-> (search.filter/with-filters kitchen-sink-filter-context {:select [:some :stuff], :from :somewhere})
                 (update :where set)))))))
