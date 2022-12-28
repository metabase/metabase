(ns metabase.models.parameter-card
  (:require
    [metabase.util :as u]
    [metabase.util.i18n :refer [tru]]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]
    [toucan.models :as models]))

(models/defmodel ParameterCard :parameter_card)

(defonce ^{:doc "Set of valid parameterized_object_type for a ParameterCard"}
  valid-parameterized_object_type #{"dashboard" "card"})

(defn- validate-parameterized-object-type
  [{:keys [parameterized_object_type] :as _parameter-card}]
  (when-not (valid-parameterized_object_type parameterized_object_type)
    (throw (ex-info (tru "invalid parameterized_object_type")
                    {:allowed-types valid-parameterized_object_type}))))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(defn- pre-insert
  [pc]
  (u/prog1 pc
    (validate-parameterized-object-type pc)))

(defn- pre-update
  [pc]
  (u/prog1 pc
    (validate-parameterized-object-type pc)))

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class ParameterCard)
                 models/IModel
                 (merge models/IModelDefaults
                        {:properties (constantly {:timestamped? true})
                         :types      (constantly {:parameterized_object_type :keyword})
                         :pre-insert pre-insert
                         :pre-update pre-update}))

(defn delete-all-for-parameterized-object!
  "Delete all ParameterCard for a give Parameterized Object and NOT listed in the optional
  `parameter-ids-still-in-use`."
  ([parameterized-object-type parameterized-object-id]
   (delete-all-for-parameterized-object! parameterized-object-type parameterized-object-id []))

  ([parameterized-object-type parameterized-object-id parameter-ids-still-in-use]
   (db/delete! ParameterCard
               :parameterized_object_type parameterized-object-type
               :parameterized_object_id parameterized-object-id
               (if (empty? parameter-ids-still-in-use)
                 {}
                 {:where [:not-in :parameter_id parameter-ids-still-in-use]}))))

(defn- upsert-from-parameters!
  [parameterized-object-type parameterized-object-id parameters]
  (doseq [{:keys [values_source_config id]} parameters]
    (let [card-id    (:card_id values_source_config)
          conditions {:parameterized_object_id   parameterized-object-id
                      :parameterized_object_type parameterized-object-type
                      :parameter_id              id}]
      (or (db/update-where! ParameterCard conditions :card_id card-id)
          (db/insert! ParameterCard (merge conditions {:card_id card-id}))))))

(s/defn upsert-or-delete-from-parameters!
  "From a parameters list on card or dashboard, create, update,
  or delete appropriate ParameterCards for each parameter in the dashboard"
  [parameterized-object-type :- su/NonBlankString
   parameterized-object-id   :- su/IntGreaterThanZero
   parameters                :- [su/Parameter]]
  (let [upsertable?           (fn [{:keys [values_source_type values_source_config id]}]
                                (and values_source_type id (:card_id values_source_config)
                                     (= values_source_type "card")))
        upsertable-parameters (filter upsertable? parameters)]
    (upsert-from-parameters! parameterized-object-type parameterized-object-id upsertable-parameters)
    (delete-all-for-parameterized-object! parameterized-object-type parameterized-object-id (map :id upsertable-parameters))))
