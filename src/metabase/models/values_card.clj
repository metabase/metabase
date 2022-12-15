(ns metabase.models.values-card
  (:require
   [clojure.string :as str]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [toucan.db :as db]
   [toucan.models :as models]))


(models/defmodel ValuesCard :values_card)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class ValuesCard)
                 models/IModel
                 (merge models/IModelDefaults
                        {:properties (constantly {:timestamped? true})
                         :types      (constantly {:parameterized_object_type :keyword})}))

(defn- search-match?
  [search-term filter-term]
  (str/includes? filter-term search-term))

(defn query-matches
  "Filter the values according to the `search-term`. If `search-term` is blank, return all the values without filtering"
  [search-term values]
  (if (str/blank? search-term)
    values
    (let [normalize              (comp str/lower-case str/trim)
          normalized-search-term (normalize search-term)]
      (filter #(search-match? normalized-search-term (normalize %)) values))))

(defn- query-for-dashboard
  [{dashboard-id :id} param-key]
  (->> (db/query {:select [:dataset_query]
                  :from [:report_card]
                  :join [:values_card [:= :report_card.id :values_card.card_id]]
                  :where [:and
                          [:= :parameterized_object_id dashboard-id]
                          [:= :parameterized_object_type "dashboard"]
                          [:= :parameter_id param-key]]})
       (db/do-post-select 'Card)
       first
       :dataset_query))

(defn values-for-dashboard
  "Returns a map with the filter `:values` associated with the dashboard."
  [dashboard param-key search-term]
  {:values
   (->> (qp/process-query (query-for-dashboard dashboard param-key) {:rff (constantly conj)})
        (map first)
        (query-matches search-term))})

(defn- upsert-for-dashboard!
  [dashboard-id parameters]
  (doseq [{:keys [source_options id]} parameters]
    (let [card-id    (:card_id source_options)
          conditions {:parameterized_object_id   dashboard-id
                      :parameterized_object_type "dashboard"
                      :parameter_id              id}]
      (or (db/update-where! ValuesCard conditions :card_id card-id)
          (db/insert! ValuesCard (merge conditions {:card_id card-id}))))))

(defn delete-for-dashboard!
  "Deletes any lingering ValuesCards associated with the `dashboard` and NOT listed in the optional
  `parameter-ids-still-in-use`"
  ([dashboard-id]
   (delete-for-dashboard! dashboard-id []))
  ([dashboard-id parameter-ids-still-in-use]
   (db/delete! ValuesCard
     :parameterized_object_type "dashboard"
     :parameterized_object_id   dashboard-id
     (if (empty? parameter-ids-still-in-use)
       {}
       {:where [:not-in :parameter_id parameter-ids-still-in-use]}))))

(defn upsert-or-delete-for-dashboard!
  "Create, update, or delete appropriate ValuesCards for each parameter in the dashboard"
  [{dashboard-id :id parameters :parameters}]
  (let [upsertable?           (fn [{:keys [source_type source_options id]}] (and source_type id (:card_id source_options)
                                                                                 (= source_type "card")))
        upsertable-parameters (filter upsertable? parameters)]

    (upsert-for-dashboard! dashboard-id upsertable-parameters)
    (delete-for-dashboard! dashboard-id (map :id upsertable-parameters))))
