(ns metabase.search.filter-test
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.test :refer :all]
   [metabase.models]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]
   [metabase.search.in-place.filter :as search.in-place.filter]))

(comment
  ;; We load this to ensure all the search-models are registered
  metabase.models/keep-me)

(defn- filter-keys []
  (remove #{:ids} (map :context-key (vals search.config/filters))))

(defn- active-filter-combinations []
  ;; We ignore :archived? as we've moved some of these filters to the `:where` clause as a simplifying optimization.
  ;; We ignore :card-db-id as legacy search implements this filter sneakily inside the models themselves.
  (math.combo/subsets (remove #{:archived? :table-db-id} (filter-keys))))

(defn- with-all-models [search-ctx]
  (assoc search-ctx :models search.config/all-models))

(defn- with-all-models-and-regular-user [search-ctx]
  (with-all-models (assoc search-ctx :is-impersonated-user? false :is-sandboxed-user? false)))

(defn- with-all-models-and-sandboxed-user [search-ctx]
  (with-all-models (assoc search-ctx :is-impersonated-user? false :is-sandboxed-user? true)))

(deftest search-context->applicable-models-test
  (testing "All models are relevant if we're not looking in the trash"
    (is (= search.config/all-models
           (search.filter/search-context->applicable-models (with-all-models-and-regular-user {:archived? false})))))

  (testing "We only search for certain models in the trash"
    (is (= #{"dashboard" "dataset" "segment" "collection" "action" "metric" "card"}
           (search.filter/search-context->applicable-models (with-all-models-and-regular-user {:archived? true})))))

  (testing "Indexed entities are not visible for sandboxed users"
    (is (= (disj search.config/all-models "indexed-entity")
           (search.filter/search-context->applicable-models (with-all-models-and-sandboxed-user {:archived? false})))))

  (doseq [active-filters (active-filter-combinations)]
    (testing (str "Consistent models included when filtering on " (vec active-filters))
      (let [search-ctx (with-all-models-and-regular-user (zipmap active-filters (repeat true)))]
        (is (= (search.in-place.filter/search-context->applicable-models search-ctx)
               (search.filter/search-context->applicable-models search-ctx)))))))

(def kitchen-sink-filter-context
  {:archived?           true
   :created-at          "2024-10-01"
   :created-by          [123]
   :table-db-id         231
   :last-edited-by      [321]
   :last-edited-at      "2024-10-02"
   :search-native-query true
   :verified            true
   :ids                 [1 2 3 4]
   :models              (disj search.config/all-models "dataset")})

(deftest with-filters-test
  (testing "The kitchen sink context is complete"
    (is (empty? (remove kitchen-sink-filter-context (filter-keys)))))
  (testing "We leave the query alone if there are no filters"
    (is (= {:select [:some :stuff]
            :from   :somewhere}
           (search.filter/with-filters {} {:select [:some :stuff], :from :somewhere}))))
  (testing "We can insert appropriate constraints for all the filters"
    (is (= {:select [:some :stuff]
            :from   :somewhere
            ;; This :where clause is a set to avoid flakes, since the clause order will be non-deterministic.
            :where  #{:and
                      [:in :model #{"dashboard" "table" "segment" "collection" "database" "action" "indexed-entity" "metric" "card"}]
                      [:in :model_id [1 2 3 4]]
                      [:in :model ["card" "dataset" "metric" "dashboard" "action"]]
                      [:= :search_index.archived true]
                      [:>= [:cast :search_index.model_created_at :date] #t"2024-10-01"]
                      [:< [:cast :search_index.model_created_at :date] #t"2024-10-02"]
                      ;; depends on whether :content-verification is enabled
                      #_[:= :search_index.verified true]
                      [:in :search_index.creator_id [123]]
                      [:= :search_index.database_id 231]
                      [:>= [:cast :search_index.last_edited_at :date] #t"2024-10-02"]
                      [:< [:cast :search_index.last_edited_at :date] #t"2024-10-03"]
                      [:in :search_index.last_editor_id [321]]}}
           (-> (search.filter/with-filters kitchen-sink-filter-context {:select [:some :stuff], :from :somewhere})
               (update :where set))))))
