(ns metabase.models.persisted-info
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def PersistedInfo
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the Card symbol in our codebase."
  :model/PersistedInfo)

(methodical/defmethod t2/table-name :model/PersistedInfo [_model] :persisted_info)

(derive :model/PersistedInfo :metabase/model)

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

(def ^:private Metadata
  "Spec for metadata. Just asserting we have base types and names, not the full metadata of the qp."
  [:maybe
   [:sequential
    [:map
     [:name      :string]
     [:base_type ::lib.schema.common/base-type]
     [:effective_type {:optional true} ::lib.schema.common/base-type]]]])

(mu/defn metadata->definition :- ::lib.schema.metadata/persisted-info.definition
  "Returns a ddl definition datastructure. A :table-name and :field-deifinitions vector of field-name and base-type."
  [metadata :- Metadata table-name]
  {:table-name        table-name
   :field-definitions (mapv field-metadata->field-defintion metadata)})

(mu/defn query-hash
  "Base64 string of the hash of a query."
  [query :- :map]
  (String. ^bytes (codecs/bytes->b64 (qp.util/query-hash query))))

(def ^:dynamic *allow-persisted-substitution*
  "Allow persisted substitution. When refreshing, set this to nil to ensure that all underlying queries are used to
  rebuild the persisted table."
  true)

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
    (let [existing-ids (t2/select-fn-set :card_id PersistedInfo
                                         :card_id [:in (map :id cards)]
                                         :state [:in (refreshable-states)])]
      (map (fn [{id :id :as card}]
             (assoc card :persisted (contains? existing-ids id)))
           cards))))

(defn mark-for-pruning!
  "Marks PersistedInfo as `deletable` or `off`, these will at some point be cleaned up by the PersistPrune task.

   `deletable` will wipe out all trace of persisted-info and allow them to be turned back on by automatic processes
     use when you are disabling peristence at a high level.
   `off` will ensure automatic processes do not pick up these up and re-enable."
  ([conditions-map]
   (mark-for-pruning! conditions-map "deletable"))
  ([conditions-map state]
   (t2/update! PersistedInfo conditions-map {:active false, :state state, :state_change_at :%now})))

(defn invalidate!
  "Invalidates any caches corresponding to the `conditions-map`. Equivalent to toggling the caching off and on again."
  [conditions-map]
  ;; We do not immediately delete the cached table, it will get clobbered during the next refresh cycle.
  (t2/update! PersistedInfo
              (merge {:active true} conditions-map)
              ;; TODO perhaps we should immediately kick off a recalculation of these caches
              {:active false, :state "creating", :state_change_at :%now}))

(defn- create-row
  "Marks PersistedInfo as `creating`, these will at some point be persisted by the PersistRefresh task."
  [user-id card]
  (let [slug (-> card :name slug-name)
        {:keys [database_id]} card
        card-id (u/the-id card)]
    {:card_id         card-id
     :database_id     database_id
     :question_slug   slug
     :table_name      (format "model_%s_%s" card-id slug)
     :active          false
     :refresh_begin   :%now
     :refresh_end     nil
     :state           "creating"
     :state_change_at :%now
     :creator_id      user-id}))

(defn ready-unpersisted-models!
  "Looks for all new models in database and creates a persisted-info ready to be synced."
  [database-id]
  (let [cards (t2/select :model/Card
                         {:where [:and
                                  [:= :database_id database-id]
                                  [:= :type "model"]
                                  [:not [:exists {:select [1]
                                                  :from [:persisted_info]
                                                  :where [:= :persisted_info.card_id :report_card.id]}]]]})]
    (t2/insert! PersistedInfo (map #(create-row nil %) cards))))

(defn turn-on-model!
  "Marks PersistedInfo as `creating`, these will at some point be persisted by the PersistRefresh task."
  [user-id card]
  (let [card-id (u/the-id card)
        existing-persisted-info (t2/select-one PersistedInfo :card_id card-id)
        persisted-info (cond
                         (not existing-persisted-info)
                         (first (t2/insert-returning-instances! PersistedInfo (create-row user-id card)))

                         (contains? #{"deletable" "off"} (:state existing-persisted-info))
                         (do
                           (t2/update! PersistedInfo (u/the-id existing-persisted-info)
                                       {:active false, :state "creating", :state_change_at :%now})
                           (t2/select-one PersistedInfo :card_id card-id)))]
    persisted-info))

(defn ready-database!
  "Sets PersistedInfo state to `creating` for models without a PeristedInfo or those in a `deletable` state.
   Will ignore explicitly set `off` models."
  [database-id]
  (t2/query-one
    {:update [:persisted_info]
     :where [:and
             [:= :database_id database-id]
             [:= :state "deletable"]]
     :set {:active false,
           :state "creating",
           :state_change_at :%now}})
  (ready-unpersisted-models! database-id))
