(ns metabase.model-persistence.models.persisted-info
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.model-persistence.db :as model-persistence.db]
   [metabase.model-persistence.schema :as model-persistence.schema]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/PersistedInfo [_model] :persisted_info)

(derive :model/PersistedInfo :metabase/model)

(t2/define-before-insert :model/PersistedInfo
  [persisted-info]
  (merge {:refresh_begin (mi/now), :state_change_at (mi/now)} persisted-info))

(t2/define-before-update :model/PersistedInfo
  [persisted-info]
  (let [changes (t2/changes persisted-info)
        state   (some-> (:state changes) name)]
    (cond-> persisted-info
      (and state (not (contains? changes :state_change_at)))
      (assoc :state_change_at (mi/now))

      (and (= state "refreshing") (not (contains? changes :refresh_begin)))
      (assoc :refresh_begin (mi/now))

      (and (#{"persisted" "error"} state) (not (contains? changes :refresh_end)))
      (assoc :refresh_end (mi/now)))))

(defn transform-definition-out
  "Parse the value of `:definition` when it comes out of the application Database."
  [definition]
  (when-let [definition (not-empty (mi/json-out-with-keywordization definition))]
    (update definition :field-definitions (fn [field-definitions]
                                            (mapv #(update % :base-type keyword)
                                                  field-definitions)))))

(t2/deftransforms :model/PersistedInfo
  {:definition {:in  mi/json-in
                :out transform-definition-out}})

(defn- field-metadata->field-defintion
  "Map containing the type and name of fields for dll. The type is :base-type and uses the effective_type else base_type
  of a field."
  [{field-name :name :keys [base_type effective_type]}]
  {:field-name field-name
   :base-type (or effective_type base_type)})

(mu/defn metadata->definition :- ::lib.schema.metadata/persisted-info.definition
  "Returns a ddl definition datastructure. A :table-name and :field-deifinitions vector of field-name and base-type."
  [metadata   :- [:maybe ::lib.schema.metadata/card.result-metadata]
   table-name :- ::lib.schema.common/non-blank-string]
  {:table-name        table-name
   :field-definitions (mapv field-metadata->field-defintion metadata)})

(mu/defn query-hash
  "Base64 string of the hash of a query."
  [query :- :metabase.lib-be.schema/maybe-legacy-or-empty-query]
  (String. ^bytes (codecs/bytes->b64 (qp.util/query-hash query))))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *allow-persisted-substitution*
  "Allow persisted substitution. When refreshing, set this to nil to ensure that all underlying queries are used to
  rebuild the persisted table."
  true)

(defn allow-persisted-substitution?
  "Whether to allow persisted substitution. When refreshing, set this to nil to ensure that all underlying queries are
  used to rebuild the persisted table."
  []
  *allow-persisted-substitution*)

(defmacro with-persisted-substituion-disabled
  "Execute `body` with [[*allow-persisted-substitution*]] set to `false`."
  [& body]
  `(binding [*allow-persisted-substitution* false]
     ~@body))

(defn- slug-name
  "A slug from a card suitable for a table name. This slug is not intended to be unique but to be human guide if looking
  at schemas. Persisted table names will follow the pattern `model_<card-id>_slug` and the model-id will ensure
  uniqueness."
  [nom]
  (->> (str/replace (u/lower-case-en nom) #"\s+" "_")
       (take 10)
       (apply str)))

(defenterprise refreshable-states
  "States of `persisted_info` records which can be refreshed.

   'off' needs to be handled here even though setting the state to off is only possible with :cache-granular-controls
   enabled. A model could still have state=off if the instance previously had the feature flag, then downgraded to not
   have it. In that case models with state=off were previously prunable when the feature flag enabled, but they should be
   refreshable with the feature flag disabled."
  metabase-enterprise.cache.config
  []
  ;; meant to be the same as the enterprise version except that "off" is not honored and is refreshed
  #{"refreshing" "creating" "persisted" "error" "off"})

(defenterprise prunable-states
  "States of `persisted_info` records which can be pruned."
  metabase-enterprise.cache.config
  []
  #{"deletable"})

(mi/define-batched-hydration-method persisted?
  :persisted
  "Hydrate a card :is_persisted for the frontend."
  [cards]
  (when (seq cards)
    (let [existing-ids (model-persistence.db/persisted-card-ids-in-states (map :id cards) (refreshable-states))]
      (map (fn [{id :id :as card}]
             (assoc card :persisted (contains? existing-ids id)))
           cards))))

(defenterprise default-persistent-info-state
  "The default state for a new PersistedInfo record. Defaults to 'creating' for OSS"
  metabase-enterprise.cache.config
  []
  "creating")

(defn- create-row
  "Creates a mew PersistedInfo with the default state. If `creating`, these will at some point be persisted by the PersistRefresh task."
  [user-id card]
  (let [slug (-> card :name slug-name)
        default-state (default-persistent-info-state)
        {:keys [database_id]} card
        card-id (u/the-id card)]
    {:card_id         card-id
     :database_id     database_id
     :question_slug   slug
     :table_name      (format "model_%s_%s" card-id slug)
     :active          false
     :refresh_end     nil
     :state           default-state
     :creator_id      user-id}))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn mark-persisted-infos-for-pruning!
  "Mark the PersistedInfos with `ids` inactive and as `state`, for the PersistPrune task to clean up: `deletable`, which
  wipes out every trace of them and lets automatic processes turn them back on, when persistence is disabled at a
  high level, or `off`, which keeps automatic processes from picking them up again."
  [ids state]
  (when (seq ids)
    (model-persistence.db/update-persisted-infos! ids {:active false, :state state, :state_change_at :%now})))

(defn mark-persisted-infos-for-pruning-for-databases!
  "Marks every PersistedInfo of the Databases with `database-ids` as `deletable`, inactive, for the PersistPrune task;
  one owner-scoped statement instead of a read of the ids of a Database's models."
  [database-ids]
  (when (seq database-ids)
    (model-persistence.db/update-persisted-infos-for-databases!
     database-ids {:active false, :state "deletable", :state_change_at :%now})))

(defn mark-persisted-infos-for-pruning-for-disabling!
  "Marks every PersistedInfo as `deletable`, inactive, which disabling model persistence for the instance does."
  []
  (model-persistence.db/update-all-persisted-infos! {:active false, :state "deletable", :state_change_at :%now}))

(defn invalidate!
  "Invalidates any caches corresponding to the Cards with `card-ids`. Equivalent to toggling the caching off and
  on again."
  [card-ids]
  ;; We do not immediately delete the cached table, it will get clobbered during the next refresh cycle.
  ;; TODO perhaps we should immediately kick off a recalculation of these caches
  (when (seq card-ids)
    (model-persistence.db/update-active-persisted-infos-for-cards!
     card-ids {:active false, :state "creating", :state_change_at :%now})))

(defn ready-unpersisted-models!
  "Looks for all new models in database and creates a persisted-info ready to be synced."
  [database-id]
  (let [cards (model-persistence.db/unpersisted-models-for-database database-id)]
    (model-persistence.db/insert-persisted-infos! (map #(create-row nil %) cards))))

(defn turn-on-model!
  "Marks PersistedInfo as `creating`, these will at some point be persisted by the PersistRefresh task."
  [user-id card]
  (let [card-id (u/the-id card)
        existing-persisted-info (model-persistence.db/persisted-info-for-card card-id)
        persisted-info (cond
                         (not existing-persisted-info)
                         (model-persistence.db/insert-persisted-info! (create-row user-id card))

                         (contains? #{"deletable" "off"} (:state existing-persisted-info))
                         (do
                           (model-persistence.db/reset-persisted-info-to-creating! (u/the-id existing-persisted-info))
                           (model-persistence.db/persisted-info-for-card card-id)))]
    persisted-info))

(defn turn-on-models!
  "Insert a PersistedInfo in the default state for each of the model `cards`, which have none, for `user-id`, in one
  statement; the PersistRefresh task persists those `creating`."
  [user-id cards]
  (when (seq cards)
    (model-persistence.db/insert-persisted-infos! (mapv #(create-row user-id %) cards))))

(defn ready-database!
  "Sets PersistedInfo state to the default state for models without a PeristedInfo or those in a `deletable` state.
   Will ignore explicitly set `off` models."
  [database-id]
  (model-persistence.db/ready-deletable-persisted-infos! database-id (default-persistent-info-state))
  (ready-unpersisted-models! database-id))

(mu/defn begin-persisted-info-refresh!
  "Mark the PersistedInfo with `id` as refreshing `definition` (with `query-hash`), starting now."
  [id         :- ms/PositiveInt
   definition :- [:maybe ::model-persistence.schema/persisted-info.definition]
   query-hash :- [:maybe :string]]
  (model-persistence.db/begin-persisted-info-refresh! id definition query-hash))

(mu/defn end-persisted-info-refresh!
  "Record the outcome of the refresh of the PersistedInfo with `id`: `state`, whether it is now `active?`, and the
  `error` message, ended now."
  [id      :- ms/PositiveInt
   active? :- :boolean
   state   :- [:enum "persisted" "error"]
   error   :- [:maybe :string]]
  (model-persistence.db/end-persisted-info-refresh! id active? state error))

(mu/defn delete-persisted-infos! :- :nil
  "Delete the PersistedInfos with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/PersistedInfo ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/PersistedInfo [_model]
  {:skip? false})
