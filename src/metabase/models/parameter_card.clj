(ns metabase.models.parameter-card
  (:require
   [clojure.string :as str]
   [metabase.query-processor :as qp]
   [metabase.search.util :as search]
   [metabase.util :as u]
   [toucan.db :as db]
   [toucan.models :as models]))


(models/defmodel ParameterCard :parameter_card)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class ParameterCard)
                 models/IModel
                 (merge models/IModelDefaults
                        {:properties (constantly {:timestamped? true})
                         :types      (constantly {:parameterized_object_type :keyword})}))

(defn query-matches
  "Filter the values according to the `search-term`. If `search-term` is blank, return all the values without filtering"
  [search-term values]
  (if (str/blank? search-term)
    values
    (let [normalized-search-term (search/normalize search-term)]
      (filter #(str/includes? (search/normalize (if (string? %)
                                                  %
                                                  ;; search by label
                                                  (second %)))
                              normalized-search-term) values))))

(defn- query-for-dashboard
  [{dashboard-id :id} param-key]
  (->> (db/query {:select [:dataset_query]
                  :from [:report_card]
                  :join [:parameter_card [:= :report_card.id :parameter_card.card_id]]
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
        (query-matches search-term))
   :has_more_values false}) ;; TODO: this should be more clever

(defn- upsert-for-dashboard!
  [dashboard-id parameters]
  (doseq [{:keys [source_options id]} parameters]
    (let [card-id    (:card_id source_options)
          conditions {:parameterized_object_id   dashboard-id
                      :parameterized_object_type "dashboard"
                      :parameter_id              id}]
      (or (db/update-where! ParameterCard conditions :card_id card-id)
          (db/insert! ParameterCard (merge conditions {:card_id card-id}))))))

(defn delete-for-dashboard!
  "Deletes any lingering ParameterCards associated with the `dashboard` and NOT listed in the optional
  `parameter-ids-still-in-use`"
  ([dashboard-id]
   (delete-for-dashboard! dashboard-id []))
  ([dashboard-id parameter-ids-still-in-use]
   (db/delete! ParameterCard
     :parameterized_object_type "dashboard"
     :parameterized_object_id   dashboard-id
     (if (empty? parameter-ids-still-in-use)
       {}
       {:where [:not-in :parameter_id parameter-ids-still-in-use]}))))

(defn upsert-or-delete-for-dashboard!
  "Create, update, or delete appropriate ParameterCards for each parameter in the dashboard"
  [{dashboard-id :id parameters :parameters}]
  (let [upsertable?           (fn [{:keys [source_type source_options id]}] (and source_type id (:card_id source_options)
                                                                                 (= source_type "card")))
        upsertable-parameters (filter upsertable? parameters)]

    (upsert-for-dashboard! dashboard-id upsertable-parameters)
    (delete-for-dashboard! dashboard-id (map :id upsertable-parameters))))
