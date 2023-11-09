(ns metabase.models.parameter-card
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------
(def ParameterCard
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/ParameterCard)

(methodical/defmethod t2/table-name :model/ParameterCard [_model] :parameter_card)

(doto :model/ParameterCard
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ParameterCard
 {:parameterized_object_type mi/transform-keyword})

(defonce ^{:doc "Set of valid parameterized_object_type for a ParameterCard"}
  valid-parameterized-object-type #{"dashboard" "card"})

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
  (u/prog1 (t2/changes pc)
    (when (:parameterized_object_type <>)
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
     (apply t2/delete! ParameterCard conditions))))

(defn- upsert-from-parameters!
  [parameterized-object-type parameterized-object-id parameters]
  (doseq [{:keys [values_source_config id]} parameters]
    (let [card-id    (:card_id values_source_config)
          conditions {:parameterized_object_id   parameterized-object-id
                      :parameterized_object_type parameterized-object-type
                      :parameter_id              id}]
      (or (pos? (t2/update! ParameterCard conditions {:card_id card-id}))
          (t2/insert! ParameterCard (merge conditions {:card_id card-id}))))))

(mu/defn upsert-or-delete-from-parameters!
  "From a parameters list on card or dashboard, create, update,
  or delete appropriate ParameterCards for each parameter in the dashboard"
  [parameterized-object-type :- ms/NonBlankString
   parameterized-object-id   :- ms/PositiveInt
   parameters                :- [:maybe [:sequential ms/Parameter]]]
  (let [upsertable?           (fn [{:keys [values_source_type values_source_config id]}]
                                (and values_source_type id (:card_id values_source_config)
                                     (= values_source_type "card")))
        upsertable-parameters (filter upsertable? parameters)]
    (upsert-from-parameters! parameterized-object-type parameterized-object-id upsertable-parameters)
    (delete-all-for-parameterized-object! parameterized-object-type parameterized-object-id (map :id upsertable-parameters))))
