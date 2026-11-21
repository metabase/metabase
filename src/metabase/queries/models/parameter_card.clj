(ns metabase.queries.models.parameter-card
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.db :as queries.db]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
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

(mr/def ::parameterized-object-type
  (into [:enum] (sort valid-parameterized-object-type)))

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

(defn values-source-card-ids
  "Returns the ids of the Cards `parameters` draw their values from."
  [parameters]
  (into #{}
        (keep (fn [{:keys [values_source_type values_source_config]}]
                (when (= (keyword values_source_type) :card)
                  (:card_id values_source_config))))
        parameters))

(defn- read-check-cards
  "Throws unless the current user can read every Card of `card-ids`, with a 404 for an id without a Card."
  [card-ids]
  (let [id->card (into {} (map (juxt :id identity)) (t2/hydrate (queries.db/cards card-ids) :can_read))]
    (doseq [card-id card-ids]
      (api/read-check (get id->card card-id)))))

(mu/defn check-parameter-source-card-permissions
  "Read-check the Cards `parameters` draw their values from."
  [parameters :- [:maybe [:sequential ::parameters.schema/parameter]]]
  (read-check-cards (values-source-card-ids parameters)))

(mu/defn check-new-parameter-source-card-permissions
  "Read-check the source Cards newly referenced by `parameters` that are not already stored for this object."
  [parameterized-object-type :- ::parameterized-object-type
   parameterized-object-id   :- pos-int?
   parameters                :- [:maybe [:sequential ::parameters.schema/parameter]]]
  (when-let [wanted (not-empty (values-source-card-ids parameters))]
    (let [existing (queries.db/parameter-card-card-ids parameterized-object-type parameterized-object-id)]
      (read-check-cards (into #{} (remove #(contains? existing %)) wanted)))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn delete-all-for-parameterized-object!
  "Delete all ParameterCard for a give Parameterized Object and NOT listed in the optional
  `parameter-ids-still-in-use`."
  ([parameterized-object-type parameterized-object-id]
   (delete-all-for-parameterized-object! parameterized-object-type parameterized-object-id []))

  ([parameterized-object-type parameterized-object-id parameter-ids-still-in-use]
   (if (seq parameter-ids-still-in-use)
     (queries.db/delete-parameter-cards-for-object-except! parameterized-object-type
                                                           parameterized-object-id
                                                           parameter-ids-still-in-use)
     (queries.db/delete-parameter-cards-for-object! parameterized-object-type parameterized-object-id))))

(mu/defn delete-all-for-parameterized-objects!
  "Delete all ParameterCards of the parameterized objects of the type with `parameterized-object-ids`."
  [parameterized-object-type :- ::parameterized-object-type
   parameterized-object-ids  :- [:sequential pos-int?]]
  (when (seq parameterized-object-ids)
    (queries.db/delete-parameter-cards-for-objects! parameterized-object-type parameterized-object-ids)))

(defn- upsert-from-parameters!
  [parameterized-object-type parameterized-object-id parameters]
  (doseq [{:keys [values_source_config id]} parameters]
    (let [card-id    (:card_id values_source_config)
          conditions {:parameterized_object_id   parameterized-object-id
                      :parameterized_object_type parameterized-object-type
                      :parameter_id              id}]
      ;; TODO: Maybe update! should return different values for no rows to update vs
      ;; no changes to be made
      (if (queries.db/parameter-card-exists? parameterized-object-type parameterized-object-id id)
        (queries.db/set-parameter-card-card-id! parameterized-object-type parameterized-object-id id card-id)
        (queries.db/insert-parameter-card! (merge conditions {:card_id card-id}))))))

(mu/defn upsert-or-delete-from-parameters!
  "From a parameters list on card or dashboard, create, update,
  or delete appropriate ParameterCards for each parameter in the dashboard"
  [parameterized-object-type :- ::parameterized-object-type ; TODO (Cam 9/25/25) -- change this to take `:model/Dashboard` or `:model/Card` instead of ANY STRING
   parameterized-object-id   :- pos-int?
   parameters                :- [:maybe [:sequential ::parameters.schema/parameter]]]
  (let [upsertable?           (fn [{:keys [values_source_type values_source_config id]}]
                                (and values_source_type id (:card_id values_source_config)
                                     (= values_source_type :card)))
        upsertable-parameters (filter upsertable? parameters)]
    (upsert-from-parameters! parameterized-object-type parameterized-object-id upsertable-parameters)
    (delete-all-for-parameterized-object! parameterized-object-type parameterized-object-id (map :id upsertable-parameters))))

(defn- upsertable-parameter?
  "Whether `parameter` takes its values from a Card."
  [{:keys [values_source_type values_source_config id]}]
  (boolean (and values_source_type id (:card_id values_source_config) (= values_source_type :card))))

(mu/defn sync-parameter-cards!
  "From the parameters lists of several objects of `object-type`, `objects`, each `[object-id parameters]` of a
  Dashboard or Card, create, update, or delete the ParameterCards of each of them, in a fixed number of statements."
  [object-type :- ::parameterized-object-type
   objects     :- [:sequential [:tuple pos-int? [:maybe [:sequential ::parameters.schema/parameter]]]]]
  (let [wanted (into {}
                     (for [[object-id parameters] objects
                           {:keys [id values_source_config] :as parameter} parameters
                           :when (upsertable-parameter? parameter)]
                       [[object-id id] (:card_id values_source_config)]))
        stored (into {}
                     (map (juxt (juxt :parameterized_object_id :parameter_id) identity))
                     (queries.db/parameter-cards-for-objects object-type (mapv first objects)))
        stale  (into [] (comp (remove #(contains? wanted (key %))) (map (comp :id val))) stored)
        new    (into []
                     (keep (fn [[[object-id parameter-id :as k] card-id]]
                             (when-not (contains? stored k)
                               {:parameterized_object_id   object-id
                                :parameterized_object_type object-type
                                :parameter_id              parameter-id
                                :card_id                   card-id})))
                     wanted)
        moved  (group-by first
                         (keep (fn [[k card-id]]
                                 (when-let [row (get stored k)]
                                   (when (not= card-id (:card_id row))
                                     [card-id (:id row)])))
                               wanted))]
    (when (seq new)
      (queries.db/insert-parameter-cards! new))
    (doseq [[card-id pairs] moved]
      (queries.db/set-parameter-cards-card-id! (mapv second pairs) card-id))
    (when (seq stale)
      (queries.db/delete-parameter-cards-by-id! stale))))

(mu/defn delete-parameter-cards-for-objects!
  "Delete the ParameterCards of the Cards or Dashboards of `object-type` with `object-ids`, and those drawing values
  from the Cards with `card-ids`."
  [object-type :- ::parameterized-object-type
   object-ids  :- [:sequential pos-int?]
   card-ids    :- [:sequential pos-int?]]
  (when (seq object-ids)
    (queries.db/delete-parameter-cards-for-objects! object-type object-ids))
  (when (seq card-ids)
    (queries.db/delete-parameter-cards-for-cards! card-ids)))

(mu/defn delete-parameter-cards-for-card!
  "Delete the ParameterCards that draw their values from the Card with `card-id`."
  [card-id :- pos-int?]
  (queries.db/delete-parameter-cards-for-card! card-id))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ParameterCard [_model]
  {:skip? false})
