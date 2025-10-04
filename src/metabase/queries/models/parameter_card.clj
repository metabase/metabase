(ns metabase.queries.models.parameter-card
  (:require
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------
(methodical/defmethod t2/table-name :model/ParameterCard [_model] :parameter_card)

(doto :model/ParameterCard
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ParameterCard
  {:parameterized_object_type mi/transform-keyword})

(def valid-parameterized-object-type
  "Set of valid parameterized_object_type for a ParameterCard"
  #{"dashboard" "card"})

(defn- validate-parameterized-object-type
  [{:keys [parameterized_object_type] :as _parameter-card}]
  (when-not (valid-parameterized-object-type parameterized_object_type)
    (throw (ex-info (tru "invalid parameterized_object_type")
                    {:allowed-types valid-parameterized-object-type}))))

(t2/define-before-insert :model/ParameterCard
  [pc]
  (u/prog1 pc
    (validate-parameterized-object-type pc)))

(t2/define-before-update :model/ParameterCard
  [pc]
  (u/prog1 pc
    (when (:parameterized_object_type (t2/changes <>))
      (validate-parameterized-object-type <>))))

(defn delete-all-for-parameterized-object!
  "Delete all ParameterCard for a give Parameterized Object and NOT listed in the optional
  `parameter-ids-still-in-use`."
  ([parameterized-object-type parameterized-object-id]
   (delete-all-for-parameterized-object! parameterized-object-type parameterized-object-id []))

  ([parameterized-object-type parameterized-object-id parameter-ids-still-in-use]
   (let [conditions (concat [:parameterized_object_type parameterized-object-type
                             :parameterized_object_id parameterized-object-id]
                            (when (seq parameter-ids-still-in-use)
                              [:parameter_id [:not-in parameter-ids-still-in-use]]))]
     (apply t2/delete! :model/ParameterCard conditions))))

(defn- upsert-from-parameters!
  [parameterized-object-type parameterized-object-id parameters]
  (doseq [{:keys [values_source_config id]} parameters]
    (let [card-id    (:card_id values_source_config)
          conditions {:parameterized_object_id   parameterized-object-id
                      :parameterized_object_type parameterized-object-type
                      :parameter_id              id}]
      ;; TODO: Maybe update! should return different values for no rows to update vs
      ;; no changes to be made
      (if (m/mapply t2/exists? :model/ParameterCard conditions)
        (t2/update! :model/ParameterCard conditions {:card_id card-id})
        (t2/insert! :model/ParameterCard (merge conditions {:card_id card-id}))))))

(mu/defn upsert-or-delete-from-parameters!
  "From a parameters list on card or dashboard, create, update,
  or delete appropriate ParameterCards for each parameter in the dashboard"
  [parameterized-object-type :- ms/NonBlankString ; TODO (Cam 9/25/25) -- change this to take `:model/Dashboard` or `:model/Card` instead of ANY STRING
   parameterized-object-id   :- ms/PositiveInt
   parameters                :- [:maybe [:sequential ::parameters.schema/parameter]]]
  (let [upsertable?           (fn [{:keys [values_source_type values_source_config id]}]
                                (and values_source_type id (:card_id values_source_config)
                                     (= values_source_type :card)))
        upsertable-parameters (filter upsertable? parameters)]
    (upsert-from-parameters! parameterized-object-type parameterized-object-id upsertable-parameters)
    (delete-all-for-parameterized-object! parameterized-object-type parameterized-object-id (map :id upsertable-parameters))))
