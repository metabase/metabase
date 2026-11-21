(ns metabase.queries.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require
   [better-cond.core :as b]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.cache.models.cache-config :as cache-config]
   [metabase.change-log.core :as change-log]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.content-verification.models.moderation-review :as moderation-review]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.metrics.core :as metrics]
   [metabase.models.db :as models.db]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.params :as params]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.pulse.core :as pulse]
   [metabase.queries.audit :as queries.audit]
   [metabase.queries.cached-result :as cached-result]
   [metabase.queries.card-schema :as card-schema]
   [metabase.queries.collection-items :as queries.collection-items]
   [metabase.queries.db :as queries.db]
   [metabase.queries.dependencies :as queries.dependencies]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.queries.models.query :as query]
   [metabase.queries.recent-views :as queries.recent-views]
   [metabase.queries.replacement :as queries.replacement]
   [metabase.queries.revisions :as queries.revisions]
   [metabase.queries.schema :as queries.schema]
   [metabase.queries.search :as queries.search]
   [metabase.queries.serialization :as queries.serialization]
   [metabase.queries.staleness :as queries.staleness]
   [metabase.queries.xrays :as queries.xrays]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.replacement.spec :as replacement]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.models.revision :as revision]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Card [_model] :report_card)

(methodical/defmethod t2.hydrate/model-for-automagic-hydration [#_model :default #_k :card]
  [_original-model _k]
  :model/Card)

(def starting-card-schema-version
  "The default schema version assigned to all cards that existed before the `:card_schema` column was added in v0.55.
  This value is used when loading old revision records that predate the schema versioning system."
  20)

(def current-card-schema-version
  "Latest schema version number. This is an increasing integer stored in each card's `:card_schema` column.
  It is used to guide `after-select` logic in how to modernize a card correctly.

  `20` is the \"legacy\" version - that was the default value given to all cards that existed when the `card_schema`
  column was added.

  Update process:
  - Increment this number.
  - Update `before-insert` and `before-update` if necessary, so they are storing upgraded cards.
  - Add a new [[upgrade-card-schema-to]] implementation, that upgrades the immediately previous version to your new
    version.

  The core `after-select` logic compares each row's `card_schema` and runs the upgrade functions for all versions up to
  and including [[current-card-schema-version]]."
  24)

(defmulti ^:private upgrade-card-schema-to
  "Upgrades a card on read, so that it fits the given schema version number.

  The number is the **target** revision - if we read a row with `:card_schema` 22 and the [[current-card-schema-version]]
  is 25, then the `after-select` logic will effectively call

      (-> card
          (upgrade-card-schema-to 23)
          (upgrade-card-schema-to 24)
          (upgrade-card-schema-to 25))
  "
  {:arglists '([card target-schema-version])}
  (fn [_card target-schema-version]
    target-schema-version))

;;; ------------------------------------------------- Dimension Transforms -------------------------------------------------

;;; ------------------------------------------------- Metric Dimension Persistence --------------------------------------------------

(declare update-cards!)

(defmethod metrics/save-dimensions! :metadata/metric
  [metric dimensions dimension-mappings]
  (when-let [metric-id (:id metric)]
    (update-cards! [{:id                 metric-id
                     :dimensions         dimensions
                     :dimension_mappings dimension-mappings}])))

(defmethod metrics/dimensions-initialized? :metadata/metric
  [metric]
  (some? (:dimensions (queries.db/raw-card-dimensions (:id metric)))))

(t2/deftransforms :model/Card
  {:dataset_query          lib-be/transform-query
   :public_uuid            (mi/transform-encrypted-text "report_card.public_uuid")
   :display                mi/transform-keyword
   :embedding_params       mi/transform-json-no-keywordization
   :query_type             mi/transform-keyword
   :result_metadata        mi/transform-result-metadata
   :visualization_settings lib-be/transform-visualization-settings
   :parameters             parameters/transform-parameters
   :parameter_mappings     parameters/transform-parameter-mappings
   :type                   mi/transform-keyword
   :dimensions             metrics/transform-dimensions
   :dimension_mappings     metrics/transform-dimension-mappings})

(doto :model/Card
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defn- summary-card-snapshots
  "The snapshots linked to `card` when it is an ephemeral card of an exploration Summary (`document`), or nil when it
  is not one or has none. Such a card renders only those snapshots — a composite links its own plus one per source —
  so it is gated on their artifact verdicts rather than on the Summary's content gate over every thread."
  [card document]
  (when (and (:exploration_id document) (:id card))
    (not-empty (queries.db/stored-result-gate-inputs-for-card (:id card)))))

(defn- parent-documents
  "The parent Documents of `cards`, hydrated with the permission `k`, as `{:document-id f, :documents {id document}}`,
  where `f` gives the parent Document id of a Card, or nil. A Card selected without `:document_id` has it resolved
  from its `:id`, so that a narrowed select can't pass for a Card of no Document; a Card with neither has none."
  [cards k]
  (let [unresolved  (into [] (comp (remove #(contains? % :document_id)) (keep :id)) cards)
        resolved    (if (seq unresolved)
                      (queries.db/card-document-ids unresolved)
                      {})
        document-id (fn [card]
                      (if (contains? card :document_id)
                        (:document_id card)
                        (get resolved (:id card))))
        ids         (into [] (comp (keep document-id) (distinct)) cards)]
    {:document-id document-id
     :documents   (if (seq ids)
                    (u/index-by :id (t2/hydrate (queries.db/documents-collection-and-exploration ids) k))
                    {})}))

(defn- check-can-read-keys
  "Throws unless `card` has the columns its `:can_read` hydration reads."
  [card]
  (api/check-500 (contains? card :collection_id) "No :collection_id is set for a Card."))

(defn- check-can-write-keys
  "Throws unless `card` has the columns its `:can_write` hydration reads."
  [card]
  (api/check-500 (contains? card :collection_id) "No :collection_id is set for a Card."))

(methodical/defmethod t2/batched-hydrate [:model/Card :can_read]
  "Whether the current user reads each of `cards`: its Collection's content, and, for a Card of a Document, the
  Document, or, for a Card of an exploration Summary with snapshots, the Summary's Collection and each snapshot."
  [_model _k cards]
  (run! #(when % (check-can-read-keys %)) cards)
  (let [rows                            (remove nil? cards)
        readable                        (collection/content-readable-collection-ids (map :collection_id rows)
                                                                                    {:root-namespace nil, :audit-rules? true})
        {:keys [document-id documents]} (parent-documents rows :can_read)
        summary-readable                (delay (collection/content-readable-collection-ids
                                                (map :collection_id (vals documents))
                                                {:root-namespace nil, :audit-rules? false}))]
    (for [card cards]
      (when card
        (vary-meta card assoc :can_read
                   (boolean
                    (and (contains? readable (:collection_id card))
                         (let [id (document-id card)]
                           (or (nil? id)
                               (when-let [document (get documents id)]
                                 (if-let [snapshots (summary-card-snapshots card document)]
                                   (and (contains? @summary-readable (:collection_id document))
                                        (every? cached-result/viewer-can-view-cached-result? snapshots))
                                   (mi/can-read? (t2/hydrate document :can_read)))))))))))))

(methodical/defmethod t2/batched-hydrate [:model/Card :can_write]
  "Whether the current user writes each of `cards`: its Collection's content, and, for a Card of a Document, the
  Document, which a Card of an exploration Summary never is."
  [_model _k cards]
  (run! #(when % (check-can-write-keys %)) cards)
  (let [rows                            (remove nil? cards)
        writable                        (collection/content-writable-collection-ids (map :collection_id rows)
                                                                                    {:root-namespace nil, :audit-rules? true})
        {:keys [document-id documents]} (parent-documents rows :can_write)]
    (for [card cards]
      (when card
        (assoc card :can_write
               (boolean
                (and (contains? writable (:collection_id card))
                     (let [id (document-id card)]
                       (or (nil? id)
                           (when-let [document (get documents id)]
                             (and (nil? (:exploration_id document))
                                  (mi/can-write? (t2/hydrate document :can_write)))))))))))))

(def card-read-check-columns
  "The columns the `:can_read` hydration reads from a Card."
  [:id :collection_id :document_id])

(defn model?
  "Returns true if `card` is a model."
  [card]
  (= (keyword (:type card)) :model))

(defn visible-metric-cards-where-clause
  "HoneySQL `:where` clause selecting non-archived metric Cards that the current user
   can read (collection visibility applied). Use with `t2/select` / `t2/count` against
   `:model/Card`."
  []
  [:and
   [:= :type "metric"]
   [:= :archived false]
   (perms/visible-collections-filter-clause :report_card.collection_id (api/current-user-info) {:include-trash-collection? false
                                                                                                :include-archived-items    :exclude
                                                                                                :permission-level          :read
                                                                                                :root-namespace            nil})])

;;; -------------------------------------------------- Hydration --------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Card :dashboard_count]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   (fn []
     (->> (queries.db/dashcard-counts-by-card (map :id cards))
          (map (juxt :card_id :count))
          (into {})))
   :id
   {:default 0}))

(methodical/defmethod t2/batched-hydrate [:model/Card :in_dashboards]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   (fn []
     (let [card-ids       (map u/the-id cards)
           all-dashboards (queries.db/dashboards-for-cards card-ids)]
       (update-vals
        (group-by :card_id all-dashboards)
        (fn [dashes]
          (->> dashes
               (map #(dissoc % :card_id))
               ;; TODO (Cam 7/30/25) -- we could probably do the 'distinct' in the query itself
               distinct
               (mapv #(t2/instance :model/Dashboard %)))))))
   :id
   {:default []}))

(mu/defn- source-card-id :- [:maybe ::lib.schema.id/card]
  [query :- [:maybe [:or ::lib.schema/query ::lib-be.schema/empty-query]]]
  (some-> query not-empty lib/primary-source-card-id))

(methodical/defmethod t2/batched-hydrate [:model/Card :can_manage_db]
  "Hydrate can_manage_db onto cards. Indicates whether the current user has access to the database admin page for the
  database powering this card."
  [_model _k cards]
  (map
   (fn [card]
     (assoc card
            :can_manage_db
            (perms/user-has-permission-for-databases? (perms/user-info api/*current-user-id*) :perms/manage-database :yes [(:database_id card)])))
   cards))

(methodical/defmethod t2/batched-hydrate [:model/Card :parameter_usage_count]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(->> (queries.db/parameter-card-counts-by-card (map :id cards))
         (map (juxt :card_id :count))
         (into {}))
   :id
   {:default 0}))

(methodical/defmethod t2/batched-hydrate [:model/Card :average_query_time]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(->> (queries.db/average-running-times-by-card (map :id cards))
         (map (juxt :card_id :running_time))
         (into {}))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/Card :last_query_start]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(->> (queries.db/last-query-starts-by-card (map :id cards))
         (map (juxt :card_id :started_at))
         (into {}))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/Card :metrics]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(group-by :source_card_id
              (mi/readable (queries.db/metric-cards-for-source-cards (map :id cards))))
   :id))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(mu/defn populate-query-fields
  "Lift `database_id`, `table_id`, `query_type`, and `source_card_id` fields
  from query definition when inserting/updating a Card.

  `clear-stale-table-id?` (default true) controls whether a nil derived table id overwrites an existing `:table_id`.
  Pass false when the query itself is not changing, so that an unrelated update (rename, archive, ...) doesn't wipe
  a previously-valid table_id just because the derivation can no longer resolve it (e.g. the source card was
  deleted)."
  ([card :- ::queries.schema/card]
   (populate-query-fields card true))
  ([{query :dataset_query, :as card} :- ::queries.schema/card
    clear-stale-table-id? :- :boolean]
   (merge
    card
    (when (and (seq query) (map? query))
      (merge
       ;; This used to be conditional on not nilling source-card-id, changed due to #68080.
       {:source_card_id (source-card-id query)
        :query_type     (if (query/query-is-native? query) :native :query)}
       (when-let [{:keys [database-id table-id]} (query/query->database-and-table-ids query)]
         (merge
          ;; a stale table_id gets cleared when the query no longer has a source table (e.g. it was converted to
          ;; native SQL), same as :source_card_id above
          (when (or table-id clear-stale-table-id?)
            {:table_id table-id})
          (when database-id
            {:database_id database-id}))))))))

(defn- check-field-filter-fields-are-from-correct-database
  "Check that all native query Field filter parameters of `cards` reference Fields belonging to the Database the
  query points against, with one read of all the Fields. This is done when saving a Card. The goal here is to prevent
  people from saving Cards with invalid queries -- it's better to error now then to error down the road in Query
  Processor land.

  The usual way a user gets into the situation of having a mismatch between the Database and Field Filters is by
  creating a native query in the Query Builder UI, adding parameters, and *then* changing the Database that the query
  targets. See https://github.com/metabase/metabase/issues/14145 for more details."
  [cards]
  (let [with-fields (into []
                          (keep (fn [{{query-db-id :database, :as query} :dataset_query, :as card}]
                                  (when query
                                    (when-let [field-ids (not-empty (params/card->template-tag-field-ids card))]
                                      [query-db-id field-ids]))))
                          cards)]
    (when (seq with-fields)
      (let [infos (u/index-by :field-id (queries.db/field-database-info-for-ids
                                         (into #{} (mapcat second) with-fields)))]
        (doseq [[query-db-id field-ids] with-fields
                field-id                field-ids
                :let                    [{:keys [field-name table-name field-db-id]} (get infos field-id)]
                :when                   (and (contains? infos field-id) (not= field-db-id query-db-id))]
          (throw (ex-info (letfn [(describe-database [db-id]
                                    (format "%d %s" db-id (pr-str (queries.db/database-name db-id))))]
                            (tru "Invalid Field Filter: Field {0} belongs to Database {1}, but the query is against Database {2}"
                                 (format "%d %s.%s" field-id (pr-str table-name) (pr-str field-name))
                                 (describe-database field-db-id)
                                 (describe-database query-db-id)))
                          {:status-code           400
                           :query-database        query-db-id
                           :field-filter-database field-db-id}))))))
  nil)

(mu/defn- assert-valid-type
  "Check that the card is a valid model if being saved as one. Throw an exception if not."
  [{query :dataset_query, card-type :type, source-card :source_card_id, :as _card} :- [:maybe ::queries.schema/card]]
  (assert (not (and (query/query-is-native? query)
                    (some? source-card)))
          "A native SQL question cannot have a source card.")
  (when (= (keyword card-type) :model)
    (let [template-tag-types (into #{}
                                   (map :type)
                                   (some-> query not-empty lib/all-template-tags))]
      (when (seq (set/difference template-tag-types #{:card :snippet}))
        (throw (ex-info (tru "A model made from a native SQL question cannot have a variable or field filter.")
                        {:status-code 400})))))
  nil)

(mu/defn- assert-not-native-audit-db-query
  [{query :dataset_query, :as _card} :- [:maybe ::queries.schema/card]]
  (when (and (seq query)
             (= (:database query) audit/audit-db-id)
             (lib/any-native-stage? query))
    (throw (ex-info (tru "You cannot save a native query that targets the audit database.")
                    {:status-code 400})))
  nil)

(defn- dashboard-internal-card? [card]
  (boolean (:dashboard_id card)))

(defn- invalid-dashboard-internal-card-update-reason?
  "Returns the reason, if any, why this card is an invalid Dashboard Question"
  [card changes]
  (let [dq-will-change? (api/column-will-change? (:dashboard_id card) (get changes :dashboard_id ::api/not-provided))
        will-be-dq? (or (and (not dq-will-change?)
                             (:dashboard_id card))
                        (and dq-will-change?
                             (:dashboard_id changes)))]
    (when will-be-dq?
      (cond
        (not (or dq-will-change?
                 (not (api/column-will-change? (:collection_id card) (get changes :collection_id ::api/not-provided)))))
        (tru "Invalid Dashboard Question: Cannot manually set `collection_id` on a Dashboard Question")
        (api/column-will-change? (:collection_position card) (get changes :collection_position ::api/not-provided))
        (tru "Invalid Dashboard Question: Cannot set `collection_position` on a Dashboard Question")
        ;; `column-will-change?` seems broken in the case where we 'change' :question to "question"
        (and (api/column-will-change? (:type card) (get changes :type ::api/not-provided))
             (not (contains? #{"question" :question} (:type changes))))
        (tru "Invalid Dashboard Question: Cannot set `type` on a Dashboard Question")))))

(defn- other-dashboard-id->name
  "Map of id to name for the dashboards `card` appears on, excluding its current dashboard and the one `changes`
  targets."
  [card changes]
  (->> (t2/hydrate card :in_dashboards)
       :in_dashboards
       (remove #(contains? #{(:dashboard_id changes) (:dashboard_id card)} (:id %)))
       (map (juxt :id :name))
       (into {})))

(defn- assert-is-valid-dashboard-internal-update [changes card]
  ;; Clients re-send the current `dashboard_id` on every save, so only a genuine move into a dashboard is checked
  ;; (#82237).
  (when (and (api/column-will-change? (:dashboard_id card) (get changes :dashboard_id ::api/not-provided))
             (:dashboard_id changes))
    (let [dashboard-id->name (other-dashboard-id->name card changes)]
      (when (seq dashboard-id->name)
        (throw (ex-info
                (tru "Can''t move question into dashboard. Questions saved in dashboards can''t appear in other dashboards.")
                {:status-code 400
                 :other-dashboards dashboard-id->name})))))
  (when-let [reason (invalid-dashboard-internal-card-update-reason? card changes)]
    (throw (ex-info reason {:status-code 400
                            :changes changes
                            :card card})))
  changes)

(defn- check-dashboard-internal-card-shape
  "Throws unless the new Card `card`, which is in a Dashboard, is a question with no position in a Collection."
  [card]
  (when (or (not (contains? #{:question "question" nil} (:type card)))
            (some? (:collection_position card)))
    (throw (ex-info (tru "Invalid dashboard-internal card")
                    {:status-code 400
                     :card card})))
  card)

(defn- maybe-check-dashboard-internal-card [card]
  (cond-> card
    (dashboard-internal-card? card) check-dashboard-internal-card-shape))

;; TODO -- consider whether we should validate the Card query when you save/update it?? (#40013)
;;
;; TODO (Cam 7/18/25) -- weird/offputting to have half of the before-insert logic live here and then the other half live
;; in `define-before-insert`... we should consolidate it so it all lives in one or the other.
(defn- pre-insert [card]
  (let [card     (lib/normalize ::queries.schema/card card)
        defaults {:parameters         []
                  :parameter_mappings []
                  :card_schema        current-card-schema-version}
        card     (maybe-check-dashboard-internal-card
                  (merge defaults card))]
    (u/prog1 card
      ;; TODO: add a check to see if all id in :parameter_mappings are in :parameters (#40013)
      (assert-valid-type card)
      (assert-not-native-audit-db-query card)
      (params/assert-valid-parameters card)
      (params/assert-valid-parameter-mappings card))))

(defenterprise pre-update-check-sandbox-constraints
  "Throws when a change of the result metadata of a Card stops it matching the Tables of its sandboxes, which OSS never
  does."
  metabase-enterprise.sandbox.models.sandbox
  [_ _])

(defenterprise sandboxes-allow-card-delete?
  "Whether sandboxing lets the current user delete `card`, which only an admin may when a sandbox is built out of it,
  and which OSS always does."
  metabase-enterprise.sandbox.models.sandbox
  [_card]
  true)

(defn can-delete?
  "Whether the current user may hard delete `card`: they write it and sandboxing lets them."
  [card]
  (and (mi/can-write? (t2/hydrate card :can_write))
       (sandboxes-allow-card-delete? card)))

(defn- value-field-gone?
  [metadata-columns value-field]
  (or (nil? value-field)
      (empty? metadata-columns)
      (nil? (lib/find-matching-column (lib/->mbql5 value-field) metadata-columns))))

(defn- reset-values-sources!
  "Resets to the default source the parameters among those of the Cards and Dashboards that `parameter-cards` link to
  whose ids `affected-param-ids` gives from the ParameterCards of one parameterized object, reading the parameters of
  all the objects at once."
  [parameter-cards affected-param-ids]
  (when (seq parameter-cards)
    (let [by-object     (group-by (juxt :parameterized_object_type :parameterized_object_id) parameter-cards)
          object-ids    (fn [object-type]
                          (into [] (comp (map key) (filter #(= object-type (first %))) (map second)) by-object))
          card-ids      (object-ids :card)
          dashboard-ids (object-ids :dashboard)
          card-params   (when (seq card-ids) (queries.db/cards-parameters card-ids))
          dash-params   (when (seq dashboard-ids) (queries.db/dashboards-parameters dashboard-ids))
          new-params    (fn [parameters param-cards]
                          (let [affected-param-ids-set (affected-param-ids param-cards parameters)]
                            (map (fn [parameter]
                                   (if (affected-param-ids-set (:id parameter))
                                     (-> parameter
                                         (assoc :values_source_type nil)
                                         (dissoc :values_source_config))
                                     parameter))
                                 parameters)))
          card-updates  (into []
                              (keep (fn [id]
                                      (let [parameters     (get card-params id)
                                            new-parameters (new-params parameters (get by-object [:card id]))]
                                        (when-not (= parameters new-parameters)
                                          {:id id :parameters new-parameters}))))
                              card-ids)]
      (when (seq card-updates)
        (update-cards! card-updates))
      (doseq [id    dashboard-ids
              :let  [parameters     (get dash-params id)
                     new-parameters (new-params parameters (get by-object [:dashboard id]))]
              :when (not= parameters new-parameters)]
        (queries.db/update-dashboard! id {:parameters new-parameters})))))

(defn- reset-values-sources-of-changed-cards!
  "Resets to the default source the parameters of any Dashboard or Card that take their values from a field of one of
  the `cards` that its new `result_metadata` in its changes, `[card changes]` pairs, no longer has;
  [[after-archived-change]] resets those of archived cards."
  [cards+changes]
  (let [targets (into {}
                      (keep (fn [[{:keys [id database_id]} changes]]
                              (when (and (contains? changes :result_metadata) (not (:archived changes)))
                                [id (when-let [result-metadata (:result_metadata changes)]
                                      (lib/->card-metadata-columns
                                       (lib-be/application-database-metadata-provider database_id)
                                       result-metadata))])))
                      cards+changes)]
    (when (seq targets)
      (reset-values-sources!
       (queries.db/parameter-cards-for-cards (vec (keys targets)))
       (fn [param-cards parameters]
         (let [param-id->parameter (m/index-by :id parameters)]
           (->> param-cards
                (filter (fn [param-card]
                          (value-field-gone?
                           (get targets (:card_id param-card))
                           (get-in (param-id->parameter (:parameter_id param-card))
                                   [:values_source_config :value_field]))))
                (map :parameter_id)
                set)))))))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *update-baseline-select?*
  "True when the select is being for the purposes of fetching the current baseline before diffing it in
  [[t2/update!]]. This can be checked during [[t2/define-after-select]] to restrict certain logic to run only for
  true, top-level `t2/select*` calls and not for the internal reads during an update."
  false)

(defn- pre-update [card changes]
  (u/prog1 card
    (when (:dataset_query changes)
      (assert-not-native-audit-db-query changes))
    (params/assert-valid-parameters changes)
    (params/assert-valid-parameter-mappings changes)
    (assert-valid-type card)))

(defn- metadata-provider-fetch?
  "Whether `card` was selected as one of the lib metadata-provider models (`:metadata/card`, `:metadata/metric`, ...)
  rather than as `:model/Card`. Those models `derive` from `:model/Card`, so this after-select runs for them too."
  [card]
  (= "metadata" (some-> (t2/model card) namespace)))

(defn- add-query-description-to-metric-card
  "Add `:query_description` key to returned card.

  Some users were missing description that was present in v1 metric API responses. This new key compensates for that.

  This function is used in `t2/define-after-select :model/Card`. Metadata provider caching should be considered when
  fetching multiple metric cards having common database, as done in eg. dashboard API context.

  Metadata-provider fetches must be skipped: nothing consumes `:query_description` on lib metadata, and computing it
  resolves the metric's own `:metric` refs through the metadata provider, whose card fetches re-enter this
  after-select — with a cycle in the metric reference graph the recursion is unbounded and overflows the stack
  (#74954).

  Column-restricted SELECTs are skipped too. `:query_description` is derived, not a column, so a caller that named
  its columns cannot have been asking for it — and building the Lib query to compute it is expensive. This matters
  because [[card-schema/schema-upgrade-triggers]] forces `:type` into every projection that reads a schema-governed column,
  which would otherwise opt all of them in to a field none of them read."
  [card]
  (if-not (and (map? card)
               (empty? (:columns t2.pipeline/*parsed-args*))
               (= :metric (:type card))
               (not (metadata-provider-fetch? card))
               (-> card :dataset_query not-empty)
               (-> card :database_id))
    card
    (m/assoc-some card :query_description (some-> (lib-be/application-database-metadata-provider
                                                   (:database_id card))
                                                  (lib/query (:dataset_query card))
                                                  lib/suggested-name))))

;; Schema upgrade: 20 to 21 ==========================================================================================
;; Originally this backfilled `:ident`s on all columns in `:result_metadata`.
;; However, that caused performance problems since it's often recursive, and the caching was ineffective.
;; Now this upgrade is a no-op.
(defmethod upgrade-card-schema-to 21 [card _schema-version]
  card)

;; Schema upgrade: 21 to 22 ==========================================================================================
;; Two bugs during development of the field refs overhaul resulted in bad `:ident`s being saved into
;; `:result_metadata` in certain cases.
;; - Early on, some old "field__Database__Schema__TableName__FieldName" idents got saved for models.
;; - A bug in #56244 computed bad idents given a fresh column (like an aggregation) while the source was a model.
;; To avoid both of these issues, the upgrade to 22 simply discards any old idents.
;;
;; NOTE: the idents project was ultimately abandoned and `:ident` and `:model/inner_ident` are no longer populated or
;; used.
(defmethod upgrade-card-schema-to 22
  [card _schema-version]
  (update card :result_metadata (fn [cols]
                                  (some->> cols (mapv #(dissoc % :ident :model/inner_ident))))))

;; Schema upgrade: 22 to 23 ==========================================================================================
;; #66199 shows a customer upgrading to 57 breaking certain cards
;; The cards in question have {} as their dataset_query.
;; This schema upgrade is to overwrite cards with dataset_query = "{}" with a converted legacy_query.
;; Discussion: https://metaboat.slack.com/archives/C05MPF0TM3L/p1764944945966649?thread_ts=1763990244.080579&cid=C05MPF0TM3L
(defmethod upgrade-card-schema-to 23
  [card _schema-version]
  ;; This fix was a failure. We have to keep the schema upgrade, but now it's
  ;; just a no-op.
  card)

;; Schema upgrade: 23 to 24 ==========================================================================================
;; Curated metric dimensions. New metrics seed their own-table columns only, with joined/FK
;; columns available to add on demand. But metrics created before curated dimensions shipped implicitly
;; exposed EVERY breakoutable column (own-table + implicitly-joined), and existing dashboard filters may
;; be mapped to those joined columns. This schema upgrade modernizes a pre-curation metric in one of two ways.
;;
;; `:dimensions` which were set before schema 24 do not have the correct `:default` set, and the representation differs
;; slightly from the current form. The `:default` is inferred from the single breakout on the metric's query, or left
;; unset if there's no breakout.
;;
;; When the metric's `:dimensions` have never been set, we backfill the complete implicitly-joined dimension set,
;; preserving the pre-curation behavior for those metrics.
;;
;; This runs on every read of an un-curated metric and persists nothing, so the dimension ids it hands out have to
;; be the same every time — hence the `:entity_id` seed and `:entity_id`'s place in
;; [[card-schema/schema-upgrade-triggers]]. See `metabase.lib-metric.dimension.jvm/dimension-id`.
(defmethod upgrade-card-schema-to 24
  [{:keys [dataset_query dimensions entity_id] :as card} _schema-version]
  (cond
    ;; The caller declared it does not read a metric's dimensions, so don't pay to backfill them.
    ;; See [[card-schema/*skip-dimension-backfill?*]].
    card-schema/*skip-dimension-backfill?*    card

    (not= :metric (keyword (:type card))) card   ; Ignore non-:metric cards
    (empty? dataset_query)                card   ; And those without real queries

    ;; Metric with `:dimensions` not populated at all, so generate them.
    ;; We generate the legacy, "full" dimensions, selecting all breakoutable columns as a dimension.
    ;; (In contrast, a newly created metric starts with only its *own* table's columns as dimensions.)
    (nil? dimensions)
    (let [{:keys [dimensions dimension-mappings]} (metrics/compute-full-dimension-set entity_id dataset_query)]
      (assoc card :dimensions dimensions :dimension_mappings dimension-mappings))

    ;; Metric with legacy `:dimensions` already set.
    ;; Update their (pre-curation) representation to the current form, then populate the `:default` flag based on
    ;; the breakout in the query.
    :else
    (update card :dimensions #(-> %
                                  metrics/modernize-pre-curation-dimensions
                                  (metrics/recover-pre-curation-default-dimension (:dimension_mappings card)
                                                                                  dataset_query)))))

(defn- schema-governed-select?
  "Whether `card` is a Card row SELECTed with any [[card-schema/schema-governed-columns]], and therefore holds a
  stored representation an upgrade could rewrite.

  A projection naming none of them — `[:id :name]`, `[:id :type :display]`, a `COUNT(*)` over `report_card` that
  happens to run through this same after-select hook — has nothing to upgrade, so it is left alone and may SELECT
  as narrow a set of columns as it likes. Anything that does name one must bring the rest of
  [[card-schema/schema-upgrade-triggers]] along.

  `:id` is required as well, and not as a formality: Card *revisions* are Card-shaped maps that go through this
  same after-select, and the `:model/Card` revision spec deliberately drops `:id`, `:dimensions`, and
  `:dimension_mappings` from the snapshot it stores. Those are historical records rather than live rows, so they
  are left alone here; upgrading one would mean recomputing a dimension set for a card as it looked in the past."
  [card]
  (boolean (and (:id card)
                (some #(contains? card %) card-schema/schema-governed-columns))))

(mu/defn- upgrade-card-schema-to-latest :- ::queries.schema/card
  "Run the schema upgrades over a Card row and normalize it."
  ([card :- ::queries.schema/card]
   (upgrade-card-schema-to-latest card *update-baseline-select?*))
  ([card                    :- ::queries.schema/card
    update-baseline-select? :- :boolean]
   (->> (b/cond
          ;; Nothing an upgrade could rewrite was SELECTed, so there is nothing to do and nothing to demand.
          ;; `after-select` checks this too, to keep odd `report_card` queries out of here entirely.
          (not (schema-governed-select? card))
          card

          ;; Fetching some of the "hot" parts of a card but not all of them - error!
          :let [missing (remove #(contains? card %) card-schema/schema-upgrade-triggers)]
          (seq missing)
          (throw (ex-info "Cannot SELECT a Card with card_schema columns without all columns needed for an upgrade"
                          {:card-id (:id card)
                           :missing missing}))

          ;; Skip the schema updates when the select is being done as the baseline for an UPDATE.
          update-baseline-select?
          card

          ;; All gates passed, so run the schema upgrades.
          :else
          (loop [card card]
            ;; Use >= to allow for downgrades.
            (if (>= (:card_schema card) current-card-schema-version)
              card
              (let [new-version (inc (:card_schema card))]
                (recur (assoc (upgrade-card-schema-to card new-version)
                              :card_schema new-version))))))
        (lib/normalize ::queries.schema/card))))

(defn- migrate-schema-governed-columns
  "Cards are upgraded to the current schema on read, in memory only.

  The vital invariant is that `:card_schema`, `:dataset_query`, `:dimensions`, and the other
  [[card-schema/schema-governed-columns]] are all upgraded together.

  The superset [[card-schema/schema-upgrade-triggers]] includes other fields which are *read* during schema upgrades, without
  themselves being updated in lockstep. If any of these change, then all the [[card-schema/schema-upgrade-triggers]] should be
  updated too. Of course any incoming writes to e.g. `:dataset_query` will win over upgrading the old value.

  Unrelated writes, e.g. to `:name` or `:collection_id`, don't cause the [[card-schema/schema-governed-columns]] to be updated."
  [card original changes]
  (let [stored-schema (:card_schema original)]
    (if-not (and stored-schema
                 ;; Use < to leave downgraded rows alone, matching [[upgrade-card-schema-to-latest]].
                 (< stored-schema current-card-schema-version)
                 (some #(contains? changes %) card-schema/schema-upgrade-triggers))
      card
      ;; Force the `update-baseline-select?` flag to false, since this runs inside the `t2/before-update` process.
      ;; The schema upgrades are suppressed during `t2/update!` so that when it reads the baseline it sees the
      ;; [[card-schema/schema-governed-columns]] as they are really stored, not post-upgrade. That's important for the `t2/update!`
      ;; diff process.
      ;; However, here we really do want to run the upgrades, so we can write back a card which is fully updated in
      ;; lockstep.
      (let [upgraded (upgrade-card-schema-to-latest
                      (merge original changes {:card_schema (:card_schema original)})
                      false)
            ;; Keep the `upgraded` version of any [[card-schema/schema-governed-columns]], but prefer those in `changes`.
            columns  (remove (set (keys changes)) card-schema/schema-governed-columns)
            relevant (when (seq columns)
                       (select-keys upgraded columns))]
        (-> (merge card relevant)
            (assoc :card_schema current-card-schema-version))))))

(defonce ^:private unique-cards-with-blank-dataset-query
  (atom #{}))

(defn- monitor-blank-dataset-query
  "Captures the IDs of all cards which get read and have `:dataset_query {}`. That happens when the MBQL 4->5
  conversion fails, and usually indicates a problem with the MBQL 4 normalization.

  This publishes a Prometheus metric with a count of the unique cards on this instance which have been read since
  startup. If this is nonzero then there are known to be bad cards present. This function logs a message in that
  case which will point out the bad cards and enable us to localize the problem.

  Always returns `card`."
  [card]
  (when (= (:dataset_query card) {})
    (log/infof "Card %d has a blank :dataset_query - this indicates a Metabase issue."
               (:id card))
    (let [uniques (swap! unique-cards-with-blank-dataset-query conj (:id card))]
      (analytics/set-gauge! :metabase-card/unique-cards-failed-conversion (count uniques))))
  ;; Always returns the original card.
  card)

(defn- mbql5-conversion-clean-callback [untransformed-card _pre-cleaning-query _post-cleaning-query]
  (analytics/inc! :metabase-card/conversions-requiring-cleaning)
  (log/infof "MBQL 4->5 conversion for Card %d had real 'clean' changes"
             (:id untransformed-card)))

;; Uses [[lib/with-card-clean-hook]] to bind a callback which logs the impact of the cleaning process during
;; `transform-out`, so that we can log whenever a card gets converted and [[lib.convert/clean]] makes material
;; changes, which likely indicates a bug.
(methodical/defmethod t2.pipeline/results-transform [:toucan.result-type/instances :model/Card]
  [query-type model]
  (let [xform     (next-method query-type model)
        baseline? (isa? query-type :toucan.query-type/select.instances.from-update)]
    (fn xform' [rf]
      (let [rf' (xform rf)]
        (fn rf''
          ([] (rf'))
          ([acc]
           (rf' acc))
          ([acc card]
           (binding [*update-baseline-select?* baseline?]
             (lib/with-card-clean-hook (partial mbql5-conversion-clean-callback card)
               (rf' acc card)))))))))

(t2/define-after-select :model/Card
  [card]
  ;; +===============================================================================================+
  ;; |   DO NOT EDIT THIS FUNCTION DIRECTLY!                                                         |
  ;; |   Future revisions to the shapes of cards should be handled via [[upgrade-card-schema-to]].   |
  ;; |   See [[current-card-schema-version]] for details on the schema versioning.                        |
  ;; +===============================================================================================+
  (-> card
      (dissoc :dataset_query_metrics_v2_migration_backup)
      (m/assoc-some :source_card_id (-> card :dataset_query source-card-id))
      public-sharing/remove-public-uuid-if-public-sharing-is-disabled
      add-query-description-to-metric-card
      ;; At this point, the card should be at schema version 20 or higher.
      (cond-> (schema-governed-select? card) upgrade-card-schema-to-latest)
      monitor-blank-dataset-query))

(defn- normalize-card
  "`card` normalized to `::queries.schema/card`, checked against that schema wherever `mu/defn`s are instrumented."
  [card]
  (cond->> (lib/normalize ::queries.schema/card card)
    (mu.fn/instrument-ns? *ns*) (mu.fn/validate-output {:fn-name `normalize-card} [:maybe ::queries.schema/card])))

(defn timeline-events-supported-display?
  "Whether `display`, a keyword or string, supports timeline events."
  [display]
  ;; Keep this aligned with the frontend's canDisplayTimelineEvents registry check.
  (contains? #{:line :bar :area :combo :scatter :waterfall} (keyword display)))

(defn- events-enabled? [visibility]
  (not (false? (:timeline_events.enabled visibility))))

(defn- setting-ids
  "The ids stored under `k` in `visibility`. Settings saved before these keys were validated can hold anything, so a
  malformed value counts as no ids rather than throwing — otherwise the card could never be repaired."
  [visibility k]
  (let [ids (get visibility k)]
    (if (sequential? ids) (into #{} (filter pos-int?) ids) #{})))

(defn- selected-timeline-ids [visibility]
  (setting-ids visibility :timeline.selected_timeline_ids))

(defn- excluded-event-ids [visibility]
  (setting-ids visibility :timeline.excluded_timeline_event_ids))

(defn- newly-revealed-timeline-ids
  [visibility previous-visibility reveals-all?]
  (let [selected-ids (selected-timeline-ids visibility)]
    (if reveals-all?
      selected-ids
      (let [added-ids    (set/difference selected-ids (selected-timeline-ids previous-visibility))
            hidden-ids   (excluded-event-ids visibility)
            unhidden-ids (into [] (remove hidden-ids) (excluded-event-ids previous-visibility))]
        (into added-ids
              (filter selected-ids)
              (models.db/timeline-ids-of-events unhidden-ids))))))

(def ^:private timeline-visibility-keys
  "The `visualization_settings` keys that select the timelines and timeline events a Card shows."
  [:timeline.selected_timeline_ids :timeline.excluded_timeline_event_ids :timeline_events.enabled])

(defn- check-id-setting
  "Throws a 400 with `message` unless the value under `k` in `visibility`, when there is one, is a sequence of
  positive integers."
  [visibility k message]
  (when-some [ids (get visibility k)]
    (api/check-400 (and (sequential? ids) (every? pos-int? ids)) message)))

(defn- check-timeline-settings
  "Throws a 400 unless the timeline ids in the `visualization_settings` of `card` are sequences of positive integers."
  [card]
  (let [visibility (select-keys (:visualization_settings card) timeline-visibility-keys)]
    (check-id-setting visibility :timeline.excluded_timeline_event_ids
                      (tru "Excluded timeline event IDs must be a sequence of positive integers."))
    (check-id-setting visibility :timeline.selected_timeline_ids
                      (tru "Selected timeline IDs must be a sequence of positive integers."))))

(defn- timeline-selection-readable?
  "Whether the current user can read every timeline `card` newly shows compared to `previous-card`, which is nil for a
  new Card."
  [card previous-card]
  (let [visibility          (select-keys (:visualization_settings card) timeline-visibility-keys)
        previous-visibility (select-keys (:visualization_settings previous-card) timeline-visibility-keys)
        draws-events?       (fn [visibility display]
                              (and (events-enabled? visibility) (timeline-events-supported-display? display)))
        reveals-all?        (and (draws-events? visibility (:display card))
                                 (not (draws-events? previous-visibility (:display previous-card))))]
    (or (not (or reveals-all? (not= visibility previous-visibility)))
        (every? mi/can-read?
                (t2/hydrate (queries.db/timelines
                             (newly-revealed-timeline-ids visibility previous-visibility reveals-all?))
                            :can_read)))))

(defn card-exposed-timeline-ids
  "The ids of the timelines whose events `card` shows on a dashboard."
  [{:keys [display] settings :visualization_settings}]
  ;; Archived cards count too: archiving is undone by a plain `archived: false`, which runs no timeline check.
  (when (and (timeline-events-supported-display? display)
             (events-enabled? settings))
    (selected-timeline-ids settings)))

(defn dashcard-hides-card-events?
  "Whether `dashcard` never shows its card's timeline events, whatever the card selects: a visualizer dashcard renders
  its own visualization, an action dashcard renders a button, and a virtual dashcard has no card of its own."
  [dashcard]
  (let [settings (:visualization_settings dashcard)]
    (or (contains? settings :visualization)
        (some? (:action_id dashcard))
        (some? (:virtual_card settings)))))

(defn- shared-dashboard-timelines-readable?
  "Whether the current user reads the timelines of `cards` that a public or embedded `dashboard` shows to anyone."
  [dashboard cards]
  (or (not (and api/*current-user-id*
                (or (:public_uuid dashboard) (:enable_embedding dashboard))))
      (every? mi/can-read?
              (t2/hydrate (queries.db/timelines (into #{} (mapcat card-exposed-timeline-ids) cards)) :can_read))))

(defn check-shared-dashboard-timeline-permissions!
  "Placing `cards` on `dashboard` shows their selected timeline events to anyone who opens it when the dashboard is
  publicly shared or embedded, so the current user needs read access to those timelines."
  [dashboard cards]
  (when (and api/*current-user-id*
             (or (:public_uuid dashboard) (:enable_embedding dashboard)))
    (let [timeline-ids (into #{} (mapcat card-exposed-timeline-ids) cards)]
      (doseq [timeline (t2/hydrate (queries.db/timelines timeline-ids) :can_read)]
        (api/read-check timeline)))))

(defn check-shared-dashboard-timeline-permissions-for-card-ids!
  "[[check-shared-dashboard-timeline-permissions!]] for the saved Cards with `card-ids`."
  [dashboard card-ids]
  (when (seq card-ids)
    (check-shared-dashboard-timeline-permissions! dashboard (queries.db/cards (set card-ids)))))

(defn check-newly-exposed-dashcards-timeline-permissions!
  "[[check-shared-dashboard-timeline-permissions!]] for the cards `new-dashcards` newly expose on `dashboard`. A card
  is grandfathered only when `existing-dashcards` already shows its events, so turning a dashcard that hides them
  into one that shows them is checked like any other placement."
  [dashboard existing-dashcards new-dashcards]
  (let [exposed-card-ids  (comp (remove dashcard-hides-card-events?) (keep :card_id))
        existing-card-ids (into #{} exposed-card-ids existing-dashcards)
        new-card-ids      (into #{} (comp exposed-card-ids (remove existing-card-ids)) new-dashcards)]
    (check-shared-dashboard-timeline-permissions-for-card-ids! dashboard new-card-ids)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *copy-source-card*
  "The Card a new Card is being copied from, if any, bound because the create check takes only the new Card, so that
  the timelines the source already selects need no read access."
  nil)

(defmacro with-copy-source-card
  "Runs `body`, treating a Card created within it as a copy of `source-card`, so that an inherited timeline selection
  does not require read access to those timelines, where `source-card` must be a Card the current user has already
  passed a read check on and `body` should perform only the create permission check and the single copy insert."
  [source-card & body]
  `(binding [*copy-source-card* ~source-card] ~@body))

(defenterprise sandboxes-allow-card-update?
  "Whether sandboxing lets the current user apply `changes`, the guarded columns of a Card that really change, to
  `card`, which OSS always does."
  metabase-enterprise.sandbox.models.sandbox
  [_card _changes]
  true)

(defenterprise sandboxes-allow-cards-update?
  "Whether sandboxing lets the current user change the guarded columns of every one of `cards`, which OSS always
  does."
  metabase-enterprise.sandbox.models.sandbox
  [_cards]
  true)

(defn- changed?
  "Return whether there were any changes in the objects. ONLY keys in `after` are compared. If any are missing from
  `before` an exception will be thrown.

  returns false, `description` has not changed:
  (changed? {:collection_id 1 :description \"foo\"}
            {:description \"foo\"})

  returns true, `description` has changed:
  (changed? {:collection_id 1 :description \"foo\"}
            {:description \"diff\"})

  throws an exception, `before` is missing keys from `after`:
  (changed? {:collection_id 1}
            {:collection_id 1 :description \"foobar\"})

  For keys that will be transformed before we insert them in the database, automatically runs
  `(out-transform (in-transform ...))` before comparing to make sure we are comparing the canonical form."
  [card-before updates]
  ;; normalize the query before comparison
  (let [transforms (t2/transforms :model/Card)
        after (->> updates
                   (map (fn [[k v]]
                          (let [tvi (get-in transforms [k :in] identity)
                                tvo (get-in transforms [k :out] identity)
                                tv (tvo (tvi v))]
                            [k tv])))
                   (into {}))
        before  (select-keys card-before (keys after))]
    (when-not (set/subset? (set (keys after))
                           (set (keys before)))
      (throw (ex-info "`before-card` card is missing keys from `updates`"
                      {:missing-keys (apply disj
                                            (set (keys after))
                                            (set (keys before)))})))
    (boolean (some (fn [k] (api/column-will-change? (get before k) (get after k))) (keys after)))))

(def ^:private sandbox-guarded-columns
  "The columns of a Card only an admin may change while a sandbox depends on the Card."
  [:dataset_query :archived :result_metadata])

(def ^:private embedding-columns
  "The columns that make a Card embedded, which only an admin may change."
  [:enable_embedding :embedding_type :embedding_params])

(def ^:private public-link-columns
  "The columns that make a Card publicly shared."
  #{:public_uuid :made_public_by_id})

(defn- changing-columns
  "The entries of `changes` for `columns` whose value differs from the one `card` has."
  [card changes columns]
  (into {} (filter (fn [[k v]] (changed? card {k v}))) (select-keys changes columns)))

(defn- changes-embedding?
  "Whether `changes` change the embedding of `card`."
  [card changes]
  (boolean (some #(api/column-will-change? (get card %) (get changes % ::api/not-provided)) embedding-columns)))

(defn- can-change-embedding?
  "Whether the current user may do what `changes` do to the embedding of `card`: only a superuser changes it."
  [card changes]
  (or (not (changes-embedding? card changes))
      (boolean (mi/superuser?))))

(defn- public-link-change
  "Whether `changes` set, `:set`, or clear, `:clear`, the public link of `card`, and nil when they leave it."
  [card changes]
  (when (some #(api/column-will-change? (get card %) (get changes % ::api/not-provided)) public-link-columns)
    (if (:public_uuid changes) :set :clear)))

(defn- can-change-public-link?
  "Whether the current user may do what `changes` do to the public link of `card`: a superuser sets it, and one with
  the application permission to change settings clears it."
  [card changes]
  (case (public-link-change card changes)
    :set   (boolean (mi/superuser?))
    :clear (boolean (or (mi/superuser?) (perms/current-user-has-application-permissions? :setting)))
    true))

(defn- changes-only-public-link?
  "Whether `changes` change the public link of `card` and nothing else, the one change that needs no write access to
  it: a settings manager may remove the link of a Card they cannot write."
  [card changes]
  (boolean (and (public-link-change card changes)
                (every? public-link-columns (keys changes)))))

(defmethod mi/can-create? :model/Card
  [_model {collection-id :collection_id :as card}]
  (and (collection/can-write-collection-or-root? collection-id {:root-namespace nil})
       (timeline-selection-readable? card *copy-source-card*)))

(defn- dashboard-move-permitted?
  "Whether the current user may do what `changes` do to the Dashboard of `card`: write the Dashboards it appears in,
  and read the timelines it shows on the Dashboard it moves into when that is shared."
  [card changes]
  (or (not (api/column-will-change? (:dashboard_id card) (get changes :dashboard_id ::api/not-provided)))
      (and (every? mi/can-write? (t2/hydrate (queries.db/card-dashboards card) :can_write))
           (or (nil? (:dashboard_id changes))
               (shared-dashboard-timelines-readable? (queries.db/dashboard (:dashboard_id changes))
                                                     [(merge card changes)])))))

(defn- summary-owner-writable
  "A function from one of `cards` to whether the current user writes the Exploration whose Summary holds it, or nil
  for a Card of no Summary, with the Documents and Explorations loaded once, and only when `changes` archive or
  restore one of `cards` alone."
  [cards changes]
  (let [doc->exploration (when-let [ids (and (some #(mi/changes-only-archived? % changes) cards)
                                             (seq (into [] (comp (keep :document_id) (distinct)) cards)))]
                           (into {} (keep (fn [{:keys [id exploration_id]}] (when exploration_id [id exploration_id])))
                                 (queries.db/documents-collection-and-exploration (vec ids))))
        writable         (when (seq doc->exploration)
                           (into #{} (comp (filter mi/can-write?) (map :id))
                                 (t2/hydrate (queries.db/explorations (vec (distinct (vals doc->exploration)))) :can_write)))]
    (fn [card]
      (when-let [exploration-id (get doc->exploration (:document_id card))]
        (contains? writable exploration-id)))))

(defn- can-update-apart-from-sandboxes?
  "Whether the current user may apply `changes` to `card` as far as every rule but sandboxing goes, where
  `summary-owner-writable` answers an archive or restore of a Summary Card, which no user writes, at its Exploration."
  [card changes summary-owner-writable]
  (and (let [owner-writable (when (mi/changes-only-archived? card changes) (summary-owner-writable card))]
         (if (some? owner-writable)
           owner-writable
           (or (changes-only-public-link? card changes) (mi/can-write? card))))
       (can-change-public-link? card changes)
       (collection/can-move? card changes)
       (dashboard-move-permitted? card changes)
       (can-change-embedding? card changes)
       (timeline-selection-readable? (merge card changes) card)))

(defmethod mi/can-update? :model/Card
  [card changes]
  (and (can-update-apart-from-sandboxes? card changes (summary-owner-writable [card] changes))
       (sandboxes-allow-card-update? card (changing-columns card changes sandbox-guarded-columns))))

(defmethod mi/can-update-all? :model/Card
  [_model cards changes]
  (and (let [owner-writable (summary-owner-writable cards changes)]
         (every? #(can-update-apart-from-sandboxes? % changes owner-writable) cards))
       (sandboxes-allow-cards-update? (filterv #(seq (changing-columns % changes sandbox-guarded-columns)) cards))))

(defn- data-app-card-error
  "A 400 error for a card in a data app's collection, with `message`."
  [message]
  (ex-info message {:status-code 400}))

(defn- check-data-app-card-query
  "Throws unless `dataset_query` is an MBQL query on a database of a single stage that reads a table, with no explicit
  joins or custom columns; the metrics, segments and measures it names may be any."
  [{:keys [dataset_query]}]
  (when-not (:database dataset_query)
    (throw (data-app-card-error (tru "A card in a data app''s collection must hold a query on a database."))))
  (let [query (lib-be/normalize-query dataset_query)]
    (when (lib/any-native-stage? query)
      (throw (data-app-card-error (tru "A card in a data app''s collection must be built with the query builder, not SQL."))))
    (when (not= 1 (lib/stage-count query))
      (throw (data-app-card-error (tru "A card in a data app''s collection must be a query of a single stage."))))
    (when (or (lib/primary-source-card-id query) (nil? (lib/primary-source-table-id query)))
      (throw (data-app-card-error (tru "A card in a data app''s collection must read a table, not a card."))))
    (when (seq (lib/joins query))
      (throw (data-app-card-error (tru "A card in a data app''s collection can''t join tables explicitly."))))
    (when (seq (lib/expressions query))
      (throw (data-app-card-error (tru "A card in a data app''s collection can''t have custom columns."))))))

(defn- check-data-app-card
  "Throws unless `card`, when it is in a data app's collection, is a question in no dashboard or document, not archived,
  public or embedded, with no parameters, whose query reads a table in a single stage; `parent` is its Collection, an
  id or the row `collection/content-parent` gives."
  [card parent]
  (when (and (some? parent)
             (perms/data-app-collection? parent))
    ;; a new card without a type is a question, the column's default
    (when (or (not= :question (keyword (or (:type card) :question)))
              (:dashboard_id card)
              (:document_id card)
              (:archived card)
              (:public_uuid card)
              (:enable_embedding card)
              (:embedding_params card)
              (:embedding_type card))
      (throw (data-app-card-error (tru "A card in a data app''s collection must be a question, in no dashboard or document, that is not archived, public or embedded."))))
    (when (seq (:parameters card))
      (throw (data-app-card-error (tru "A card in a data app''s collection can''t have parameters."))))
    (check-data-app-card-query card)))

(def ^:private data-app-card-columns
  "The columns [[check-data-app-card]] reads; an update that changes none of them leaves a card as it was checked."
  #{:collection_id :dashboard_id :document_id :type :archived :public_uuid :enable_embedding :embedding_params
    :embedding_type :dataset_query :parameters})

(defn- card-query
  "The query of `card` with the metadata provider of its Database."
  [{:keys [dataset_query]}]
  (lib/query (lib-be/application-database-metadata-provider (:database dataset_query)) dataset_query))

(defn- check-no-save-cycle
  "Throws a 400 when the query of `card` depends on `card` itself through the Cards it reads."
  [{:keys [id dataset_query] :as card}]
  (when (and id (seq dataset_query))
    (try
      (lib/check-card-overwrite id (card-query card))
      (catch clojure.lang.ExceptionInfo e
        (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400)))))))

(defn- derive-model-display
  "`card` with the `:table` display a model has, unless it is a `:list`."
  [card]
  (cond-> card
    (and (model? card) (not= :list (keyword (:display card)))) (assoc :display :table)))

(defn- parent-of
  "The Collection row with the id `collection-id` that `placement` holds, nil for the root; throws a 404 when it does
  not exist."
  [{:keys [collections]} collection-id]
  (when collection-id
    (or (get collections collection-id)
        (let [msg (tru "Collection does not exist.")]
          (throw (ex-info msg {:status-code 404, :errors {:collection_id msg}}))))))

(defn- load-placement
  "What the checks of where `cards` are put read, loaded for all of them at once: `:dashboards`, the Dashboards they
  are in by id, which are `dashboards`, `:archived-documents`, the ids of their Documents that are archived, and
  `:collections`, the Collections they are in, by id."
  [cards dashboards]
  {:dashboards         dashboards
   :archived-documents (queries.db/archived-document-ids (into #{} (keep :document_id) cards))
   :collections        (queries.db/collections-for-content-checks (into #{} (keep :collection_id) cards))})

(defn- check-not-in-archived-container
  "Throws a 400 when `card`, which is not archived, is in an archived Collection, `parent`, the row of its Collection
  that `placement` holds, Dashboard or Document."
  [{:keys [archived dashboard_id document_id]} parent {:keys [dashboards archived-documents]}]
  (collection/check-collection-not-archived archived parent)
  (when (and (not archived)
             (or (and dashboard_id (:archived (get dashboards dashboard_id)))
                 (and document_id (contains? archived-documents document_id))))
    (throw (ex-info (tru "You cannot put an unarchived Card in an archived Dashboard or Document.")
                    {:status-code 400}))))

(defn- archived-container-ids
  "The ids of the `cards` that are in an archived Collection, Dashboard or Document, loading those at once."
  [cards]
  (let [{:keys [dashboards archived-documents collections]}
        (load-placement cards (queries.db/dashboards-for-placement (into #{} (keep :dashboard_id) cards)))]
    (into #{}
          (comp (filter (fn [{:keys [collection_id dashboard_id document_id]}]
                          (or (and collection_id (:archived (get collections collection_id)))
                              (and dashboard_id (:archived (get dashboards dashboard_id)))
                              (and document_id (contains? archived-documents document_id)))))
                (map :id))
          cards)))

(t2/define-before-insert :model/Card
  [card]
  (check-timeline-settings card)
  (-> card
      (assoc :metabase_version config/mb-version-string
             :card_schema current-card-schema-version)
      normalize-card
      ;; Must have an entity_id before populating the metadata. TODO (Cam 7/11/25) -- actually, this is no
      ;; longer true, since we're removing `:ident`s; we can probably remove this now.
      (u/assoc-default :entity_id (u/generate-nano-id))
      (u/assoc-default :type :question)
      card.metadata/populate-result-metadata
      derive-model-display
      pre-insert
      populate-query-fields
      maybe-populate-initially-published-at
      public-sharing/add-public-uuid-prefix))

(mu/defn- populate-result-metadata :- [:map
                                       [:result_metadata {:optional true} [:maybe
                                                                           [:sequential
                                                                            ::lib.schema.metadata/lib-or-legacy-column]]]]
  "If we have fresh result_metadata, we don't have to populate it anew. When result_metadata doesn't
  change for a native query, populate-result-metadata removes it (set to nil) unless prevented by the
  verified-result-metadata? flag (see #37009)."
  [card                      :- ::queries.schema/card
   changes                   :- [:maybe ::queries.schema/card]
   verified-result-metadata? :- [:maybe :boolean]]
  (-> (cond-> card
        (or (empty? (:result_metadata card))
            (not verified-result-metadata?)
            (contains? (t2/changes card) :type))
        (card.metadata/populate-result-metadata changes))
      (m/update-existing :result_metadata #(some->> % (lib/normalize [:sequential ::lib.schema.metadata/lib-or-legacy-column])))))

(defn- clear-metabot-origin
  "A card edited after being saved from a Metabot conversation no longer materializes
  the chart it was saved from, so sever the link back to its origin — the conversation
  then stops showing that chart as saved. Only content edits count (query, display, viz
  settings); renames, moves, and archiving keep the link. The Metabot save paths stamp
  these columns with raw table updates, so stamping never re-enters this hook.

  Metabot's `run_query` tool also reads these columns, to tell SQL that Metabot saved from SQL
  a person has since edited. Changing what clears them changes which saved SQL it will run."
  [card changes]
  (if (and (some (partial contains? changes)
                 [:dataset_query :display :visualization_settings])
           (or (:metabot_conversation_id card) (:metabot_chart_id card)))
    (assoc card :metabot_conversation_id nil :metabot_chart_id nil)
    card))

(mi/define-update-in-transaction :model/Card)

(t2/define-before-update :model/Card
  [{:keys [verified-result-metadata?] :as card}]
  (let [changes  (some-> card t2/changes normalize-card)
        ;; Captured before `normalize-card` rebinds `card`, so the migration below never depends on
        ;; normalization preserving the instance's original.
        original (t2/original card)
        card     (normalize-card card)]
    (when (contains? changes :visualization_settings)
      (check-timeline-settings card))
    (-> card
        (cond-> (and (contains? changes :archived) (not (:archived card)) (not (contains? changes :archived_directly)))
          (assoc :archived_directly false))
        (dissoc :verified-result-metadata?)
        (migrate-schema-governed-columns original changes)
        (m/update-existing :dataset_query lib-be/normalize-query)
        (cond-> (contains? changes :type) derive-model-display)
        (cond-> (contains? changes :dataset_query) (doto check-no-save-cycle))
        (populate-result-metadata changes verified-result-metadata?)
        ;; populate-query-fields must run before pre-update in case source_card_id should be nilled.
        ;; Only allow it to nil out a stale table_id when the query itself is changing.
        (populate-query-fields (contains? changes :dataset_query))
        (clear-metabot-origin changes)
        (pre-update changes)
        maybe-populate-initially-published-at
        public-sharing/add-public-uuid-prefix-if-changed)))

(defn- directly-archived-card-ids
  "The ids of the Cards among `rows`, which an update that gives `changes` archived, that are archived on their own,
  as `{:all ids, :derived ids}`, `:derived` being those whose cause the update did not give: a Card whose cause is
  given as other than it was gets that cause, any other is archived on its own when it is not in an archived
  Collection, Dashboard or Document."
  [rows changes]
  (let [given?  (fn [row]
                  (and (contains? changes :archived_directly)
                       (not= (boolean (:archived_directly row)) (boolean (:archived_directly changes)))))
        grouped (group-by (comp boolean given?) rows)
        carried (when-let [derived (seq (get grouped false))]
                  (archived-container-ids (vec derived)))
        derived (into [] (comp (map :id) (remove (set carried))) (get grouped false))]
    {:all     (into (if (:archived_directly changes) (mapv :id (get grouped true)) []) derived)
     :derived derived}))

(defn- delete-notifications-of-cards!
  "Deletes the alerts of the Cards with `card-ids`, which are found before any is deleted."
  [card-ids]
  (when-let [notification-ids (seq (queries.db/card-notification-ids-for-cards card-ids))]
    (queries.db/delete-notifications! notification-ids)))

(defmethod mi/after-archived-change :model/Card
  [_model rows changes]
  (when (:archived changes)
    (let [ids                 (mapv :id rows)
          {:keys [all derived]} (directly-archived-card-ids rows changes)]
      (when (seq derived)
        (queries.db/update-cards! derived {:archived_directly true}))
      (when (seq all)
        (delete-notifications-of-cards! all))
      (queries.db/delete-actions-of-models! ids)
      (reset-values-sources! (queries.db/parameter-cards-for-cards ids)
                             (fn [param-cards _parameters] (set (map :parameter_id param-cards)))))))

(defenterprise delete-card-tests!
  "Delete the tests of the cards with `card-ids`. No-op in OSS."
  metabase-enterprise.data-testing.models.card-test
  [_card-ids]
  nil)

(defmethod mi/non-internal-filter-clause :model/Card
  [_model alias]
  [:not= (h2x/identifier :field alias :creator_id) config/internal-mb-user-id])

(defn sole-dashboard-id
  "Given a card, returns the dashboard_id of the *sole* dashboard it's in, or `nil` if it's not in exactly one dashboard."
  [card]
  (when-not (contains? card :in_dashboards)
    (throw (ex-info "`automovable?` must be called with a card hydrated with `:in_dashboards`"
                    {:card-id (:id card)})))
  (let [[dashboard :as dashboards] (:in_dashboards card)]
    (when (and (= 1 (count dashboards))
               (not (:archived dashboard))
               (not (:archived card)))
      (:id dashboard))))

(methodical/defmethod mi/to-json :model/Card
  [card json-generator]
  ;; we're doing update + dissoc instead of [[medley.core/dissoc-in]] because we don't want it to remove the
  ;; `:dataset_query` key entirely if it is empty, as it is in a lot of tests.
  (let [card (cond-> card
               (map? (:dataset_query card)) (update :dataset_query dissoc :lib/metadata))]
    (next-method card json-generator)))

;; A data app's resource collection holds the saved questions and metric copies the app runs.
(defmethod collection/allowed-namespaces :model/Card
  [_]
  (conj collection/default-allowed-namespaces collection/data-apps-ns))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(def ^:private metadata-async-timeout-ms
  "Duration in milliseconds to wait for the metadata before abandoning the asynchronous metadata saving. Default is 15
  minutes."
  (u/minutes->ms 15))

(mu/defn save-metadata-async!
  "Save metadata when (and if) it is ready. Takes a chan that will eventually return metadata. Waits up
  to [[metadata-async-timeout-ms]] for the metadata, and then saves it if the query of the card has not changed."
  [result-metadata-future :- ::card.metadata/future
   card                   :- ::queries.schema/card]
  (let [id (u/the-id card)]
    (future
      (try
        (let [metadata (deref result-metadata-future metadata-async-timeout-ms ::timed-out)]
          (cond
            (= metadata ::timed-out)
            (do
              (log/infof "Metadata not ready in %s, abandoning" (u/format-milliseconds metadata-async-timeout-ms))
              (future-cancel result-metadata-future))

            (= metadata ::card.metadata/recompute-failed)
            (log/infof "Not updating metadata asynchronously for card %s because the recompute failed" id)

            (not (seq metadata))
            (log/infof "Not updating metadata asynchronously for card %s because no metadata" (u/the-id card))

            :else
            (let [current-query (queries.db/card-dataset-query id)]
              (if (= (:dataset_query card) current-query)
                (do
                  (update-cards! [{:id id :result_metadata metadata}])
                  (log/infof "Metadata updated asynchronously for card %s" id))
                (log/infof "Not updating metadata asynchronously for card %s because query has changed" id)))))
        (catch Throwable e
          (log/errorf "Error updating metadata for Card %d asynchronously: %s" id (ex-message e)))))))

(defn backfill-untyped-model-metadata!
  "Re-infer the result metadata of each MBQL model on the Database with `database-id` whose stored metadata is
  [[card.metadata/untyped-metadata?]], keeping the model overrides. A model whose metadata still cannot be inferred
  stays as it is."
  [database-id]
  ;; A model deserialized before its fields were synced stores only its overrides, because inference failed then.
  (when-let [updates (not-empty
                      (into []
                            (keep (fn [card]
                                    (when (card.metadata/untyped-metadata? (:result_metadata card))
                                      (let [metadata (card.metadata/infer-metadata-with-model-overrides
                                                      (:dataset_query card) card)]
                                        (when (and metadata (not (card.metadata/untyped-metadata? metadata)))
                                          {:id (:id card) :result_metadata metadata})))))
                            (queries.db/mbql-model-cards database-id)))]
    (update-cards! updates)
    (log/infof "Inferred the untyped result metadata of model Cards %s" (pr-str (mapv :id updates)))))

(defn- dashboard-question-collection
  "`row`, a new Card in a Dashboard, with the Collection of the Dashboard, which `dashboards` holds, throwing when it
  names another."
  [row dashboards]
  (if-let [dashboard-id (:dashboard_id row)]
    (let [correct-collection-id (:collection_id (get dashboards dashboard-id))]
      (when (and (contains? row :collection_id)
                 (not= correct-collection-id (:collection_id row)))
        (throw (ex-info (tru "Invalid dashboard-internal card")
                        {:status-code 400
                         :card row})))
      (assoc row :collection_id correct-collection-id))
    row))

(defn- check-new-card-placement
  "Throws unless the new Card `row` can go where it is put, the Collection, Dashboard or Document `placement` holds."
  [row placement]
  (let [parent (parent-of placement (:collection_id row))]
    (collection/check-collection-namespace :model/Card parent)
    (collection/check-allowed-content (keyword (or (:type row) :question)) parent)
    (check-not-in-archived-container row parent placement)
    (check-data-app-card row parent)))

(defn- sync-field-values!
  "Syncs the values of the Fields with `field-ids` that are in on-demand Databases."
  [field-ids]
  (when (seq field-ids)
    (log/info "Card references Fields in params:" field-ids)
    (sync.field-values/update-field-values-for-on-demand-dbs! field-ids)))

(defn- insert-in-order!
  "Inserts `rows` with one statement for each set of columns they have, and returns the new Cards in the order of
  `rows`."
  [rows]
  (let [indexed (map-indexed vector rows)]
    (->> (vals (group-by (comp set keys second) indexed))
         (mapcat (fn [group]
                   (map vector (map first group) (queries.db/insert-cards! (mapv second group)))))
         (sort-by first)
         (mapv second))))

(defn- card-sourced-parameter-objects
  "`[id parameters]` of each of `cards` whose parameters take their values from a Card."
  [cards]
  (into []
        (keep (fn [{:keys [id parameters]}]
                (when (seq (parameter-card/values-source-card-ids parameters))
                  [id parameters])))
        cards))

(defn- create-cards*
  "[[create-cards!]] without checking `rows` against their schema, which the hooks of the model check."
  [rows]
  (if (empty? rows)
    []
    (events/with-batched-events
      (let [dashboards (queries.db/dashboards-for-placement (into #{} (keep :dashboard_id) rows))
            rows       (mapv #(dashboard-question-collection % dashboards) rows)
            placement  (load-placement rows dashboards)]
        (run! #(check-new-card-placement % placement) rows)
        (check-field-filter-fields-are-from-correct-database
         (into [] (keep #(when (:dataset_query %) {:dataset_query (lib-be/normalize-query (:dataset_query %))})) rows))
        (let [cards (insert-in-order! rows)]
          (sync-field-values! (into #{} (mapcat params/card->template-tag-field-ids) cards))
          (when-let [objects (seq (card-sourced-parameter-objects cards))]
            (parameter-card/sync-parameter-cards! "card" (vec objects)))
          cards)))))

(mu/defn create-cards!
  "Creates a Card from each of `rows` and returns the new Cards in order, after checking that each can go where it is
  put and that its Field filters are on Fields of its Database. Reads what it checks for all the Cards at once and
  inserts them with one statement for each set of columns they give, so the statements do not grow with their number."
  [rows :- [:sequential ::queries.schema/card.create]]
  (create-cards* rows))

(defn- changing-values
  "The entries of `update`, an `:id` and columns, that change `card`, with the values the Card stores them as. A
  column `card` does not have, such as `:verified-result-metadata?`, never counts."
  [card update]
  (let [transforms (t2/transforms :model/Card)]
    (into {}
          (keep (fn [[k v]]
                  (when (and (not= k :id) (not= v :updated_at) (contains? card k))
                    (let [stored (get card k)
                          v'     (let [tvi (get-in transforms [k :in] identity)
                                       tvo (get-in transforms [k :out] identity)]
                                   (tvo (tvi v)))]
                      (when (not= stored v')
                        [k v'])))))
          update)))

(defn- check-card-update-placement
  "Throws unless `card`, which `changes` change, can go where it is put, the Collection, Dashboard or Document
  `placement` holds."
  [card changes placement]
  (let [parent (parent-of placement (:collection_id card))]
    (when (contains? changes :collection_id)
      (collection/check-collection-namespace :model/Card parent))
    (when (or (contains? changes :collection_id) (contains? changes :type))
      (collection/check-allowed-content (:type card) parent))
    (when (some #(contains? changes %) [:collection_id :dashboard_id :document_id])
      (check-not-in-archived-container card parent placement))
    (when (some data-app-card-columns (keys changes))
      (check-data-app-card card parent))))

(defn- placement-needed?
  "Whether `changes` to a Card are checked against where the Card is put."
  [changes]
  (or (some #(contains? changes %) [:collection_id :type :dashboard_id :document_id])
      (some data-app-card-columns (keys changes))))

(defn- newly-referenced-field-ids
  "The ids of the Fields a native query in `changes` filters on that the Card `before` did not."
  [before changes]
  (when (some-> changes :dataset_query lib/native-only-query?)
    (let [old-ids (params/card->template-tag-field-ids before)
          new-ids (params/card->template-tag-field-ids changes)]
      (when (and (seq new-ids) (not= old-ids new-ids))
        (let [added (set/difference new-ids old-ids)]
          (log/info "Referenced Fields in Card params have changed. Was:" old-ids
                    "Is Now:" new-ids
                    "Newly Added:" added)
          added)))))

(defn- implicit-actions-lost?
  "Whether `changes` to the model `before` leave it with a query that supports no implicit Actions."
  [before changes]
  (and (:dataset_query changes)
       (= (:type before) :model)
       (not (query/supports-implicit-actions? (:dataset_query changes)))))

(defn- turned-into-question?
  "Whether `changes` turn the model `before` into a question."
  [before changes]
  (and (= (:type changes) :question)
       (= (:type before) :model)))

(defn- delete-model-actions!
  "Deletes the Actions of the Cards whose models `before` and `changes` say lose them: the implicit Actions of those
  whose query supports none now, all of those turned into questions."
  [updates]
  (let [implicit (into [] (keep (fn [{:keys [before changes]}]
                                  (when (and (implicit-actions-lost? before changes)
                                             (not (turned-into-question? before changes)))
                                    (:id before))))
                       updates)
        all      (into [] (keep (fn [{:keys [before changes]}]
                                  (when (turned-into-question? before changes) (:id before))))
                       updates)]
    (when-let [action-ids (seq (queries.db/implicit-action-ids-for-models implicit))]
      (queries.db/delete-actions! (set action-ids)))
    (when (seq all)
      (queries.db/delete-actions-of-models! all))))

(defn- delete-alerts-of-changed-cards!
  "Deletes the alerts of the Cards among `updates` that their change from `before` to `after` invalidates."
  [updates after]
  (let [ids (into []
                  (keep (fn [{:keys [before changes]}]
                          (when (and (some #(contains? changes %) [:display :visualization_settings :dataset_query])
                                     (pulse/card-change-invalidates-alerts? before (get after (:id before))))
                            (:id before))))
                  updates)]
    (when (seq ids)
      (delete-notifications-of-cards! ids))))

(defn- move-actions-of-cards!
  "Moves the Actions of the models among `updates` whose Collection changed to the Collection of the model, with one
  statement for each Collection."
  [updates after]
  (doseq [[collection-id ids] (group-by #(:collection_id (get after %))
                                        (into [] (comp (filter #(contains? (:changes %) :collection_id))
                                                       (map (comp :id :before)))
                                              updates))]
    (queries.db/move-actions-of-models! ids collection-id)))

(defn- group-in-order
  "The entries of `xs`, which `f` gives the key of, as `[key entries]` in the order the keys first appear."
  [f xs]
  (let [order   (distinct (map f xs))
        grouped (group-by f xs)]
    (mapv (fn [k] [k (get grouped k)]) order)))

(defn- update-cards*
  "[[update-cards!]] without checking `updates` against their schema, which the hooks of the model check."
  [updates]
  (let [updates (vec updates)]
    (if (empty? updates)
      []
      (events/with-batched-events
        (let [before         (u/index-by :id (queries.db/cards (into #{} (map :id) updates)))
              updates        (filterv #(contains? before (:id %)) updates)
              question-dash  (queries.db/dashboards-for-placement
                              (into #{}
                                    (keep #(when-let [dashboard-id (:dashboard_id %)]
                                             (when (not= dashboard-id (:dashboard_id (get before (:id %))))
                                               dashboard-id)))
                                    updates))
              updates        (mapv (fn [{:keys [id dashboard_id] :as update}]
                                     (cond-> update
                                       (and dashboard_id (not= dashboard_id (:dashboard_id (get before id))))
                                       (assoc :collection_id (:collection_id (get question-dash dashboard_id)))))
                                   updates)
              entries        (mapv (fn [{:keys [id] :as update}]
                                     (let [card (get before id)]
                                       {:update  update
                                        :before  card
                                        :changes (changing-values card update)}))
                                   updates)
              checked        (filterv (comp placement-needed? :changes) entries)
              placement      (when (seq checked)
                               (load-placement
                                (mapv #(merge (:before %) (:changes %)) checked)
                                (queries.db/dashboards-for-placement
                                 (into #{} (keep #(:dashboard_id (merge (:before %) (:changes %)))) checked))))]
          (doseq [{:keys [before changes]} checked]
            (check-card-update-placement (merge before changes) changes placement))
          (check-field-filter-fields-are-from-correct-database
           (into [] (keep #(when-let [query (:dataset_query (:changes %))] {:dataset_query query})) entries))
          (doseq [{:keys [before changes]} entries
                  :when                    (contains? changes :result_metadata)]
            (pre-update-check-sandbox-constraints (merge before changes) changes))
          (let [field-ids (into #{} (mapcat #(newly-referenced-field-ids (:before %) (:changes %))) entries)]
            (delete-model-actions! entries)
            (doseq [[changes group] (group-in-order #(dissoc (:update %) :id) entries)
                    :when           (seq changes)]
              (queries.db/update-cards! (mapv (comp :id :update) group) changes))
            (sync-field-values! field-ids))
          (let [after (when (some (fn [{:keys [changes]}]
                                    (some #(contains? changes %) [:display :visualization_settings :dataset_query
                                                                  :collection_id]))
                                  entries)
                        (u/index-by :id (queries.db/cards (mapv (comp :id :before) entries))))]
            (delete-alerts-of-changed-cards! entries after)
            (move-actions-of-cards! entries after)
            (when-let [objects (seq (into []
                                          (keep (fn [{:keys [before changes]}]
                                                  (when (some? (:parameters changes))
                                                    [(:id before) (:parameters changes)])))
                                          entries))]
              (parameter-card/sync-parameter-cards! "card" (vec objects)))
            (reset-values-sources-of-changed-cards!
             (into []
                   (keep (fn [{:keys [before changes]}]
                           (when (contains? changes :result_metadata)
                             [(or (get after (:id before)) before) changes])))
                   entries))))
        updates))))

(mu/defn update-cards! :- [:sequential [:map [:id ::lib.schema.id/card]]]
  "Updates each of the Cards `updates` names by its `:id` with the columns it gives, after checking that each can go
  where it is put, and returns `updates` without those of Cards that do not exist. Keeps the rows that depend on a Card
  in step with its change, and writes the Cards that get the same changes with one statement, so the statements do not
  grow with their number."
  [updates :- [:sequential [:merge ::queries.schema/card.update [:map {:closed true} [:id ::lib.schema.id/card]]]]]
  (update-cards* updates))

(mu/defn delete-cards!
  "Deletes the Cards with `card-ids` after the rows that depend on them, one statement for each kind of row, so the
  statements do not grow with their number."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (let [card-ids (vec (distinct card-ids))]
    (when (seq card-ids)
      (events/with-batched-events
        (delete-card-tests! card-ids)
        (queries.db/delete-actions-of-models! card-ids)
        (parameter-card/delete-parameter-cards-for-objects! "card" card-ids card-ids)
        (queries.db/delete-card-moderation-reviews-of-cards! card-ids)
        (revision/delete-revisions-for-entities! "Card" card-ids)
        (cache-config/delete-target-configs! "question" card-ids)
        (delete-notifications-of-cards! card-ids)
        (queries.db/delete-cards! card-ids)))
    nil))

(defn- autoplace-dashcard-for-card! [dashboard-id maybe-dashboard-tab-id card size]
  (let [dashboard (t2/hydrate (queries.db/dashboard dashboard-id) :dashcards [:tabs :tab-cards])
        {:keys [dashcards tabs]} dashboard
        tabs (remove #(when maybe-dashboard-tab-id (not= maybe-dashboard-tab-id (:id %))) tabs)
        already-on-dashboard? (seq (filter #(= (:id card) (:card_id %)) dashcards))]
    (when-not already-on-dashboard?
      (let [first-tab (first tabs)
            cards-on-first-tab (or (when first-tab
                                     (:cards first-tab))
                                   dashcards)
            new-spot (if-let [{:keys [size_x size_y]} size]
                       (autoplace/get-position-for-new-dashcard
                        cards-on-first-tab size_x size_y autoplace/default-grid-width)
                       (autoplace/get-position-for-new-dashcard
                        cards-on-first-tab (:display card)))]
        (queries.db/insert-dashcard! (assoc new-spot
                                            :dashboard_tab_id (some-> first-tab :id)
                                            :card_id (:id card)
                                            :dashboard_id dashboard-id))))))

(defn- autoremove-dashcard-for-card!
  [card-id dashboard-id]
  (queries.db/delete-dashcards-for-card-on-dashboard! card-id dashboard-id)
  (when-let [dashcard-ids (seq (map :id (queries.db/dashcard-series-for-card-on-dashboard card-id dashboard-id)))]
    (queries.db/delete-dashcard-series! (set dashcard-ids))))

(defn- autoplace-or-remove-dashcards-for-card!
  "When moving around dashboard questions (cards that are internal to a dashboard), we need to remove or autoplace new
  DashboardQuestions."
  [{:as card-before-update
    card-id :id
    old-archived :archived
    old-dashboard-id :dashboard_id}
   {:as card-updates
    dashboard-id-update :dashboard_id
    dashboard-tab-id :dashboard_tab_id
    archived-update :archived}
   delete-old-dashcards?]
  (let [dashboard-changes? (api/column-will-change? old-dashboard-id (get card-updates :dashboard_id ::api/not-provided))
        new-dashboard-id (if-not dashboard-changes?
                           old-dashboard-id
                           dashboard-id-update)
        on-dashboard-before? (boolean old-dashboard-id)
        on-dashboard-after? (boolean new-dashboard-id)
        archived-changes? (api/column-will-change? old-archived (get card-updates :archived ::api/not-provided))
        new-archived (if-not archived-changes?
                       old-archived
                       archived-update)
        archived-after? (boolean new-archived)]
    ;; you can't specify the dashboard_tab_id if not on a dashboard
    (api/check-400
     (not (and dashboard-tab-id
               (not new-dashboard-id))))
    ;; we'll end up unarchived and a dashboard card => make sure we autoplace
    (when (and on-dashboard-after? (not archived-after?))
      (autoplace-dashcard-for-card! new-dashboard-id dashboard-tab-id card-before-update nil))
    (when (and
           ;; we start out as a DQ, and
           on-dashboard-before?
           (or
            ;; we're moving to a *different* dashboard,
            (and on-dashboard-after?
                 dashboard-changes?)
            ;; we're archiving the DQ, or
            (and archived-after?
                 on-dashboard-after?)
            ;; we're moving the DQ to a collection, AND the user has told us to delete
            (and (not on-dashboard-after?)
                 delete-old-dashcards?)))
      (autoremove-dashcard-for-card! card-id old-dashboard-id))
    ;; we're moving from a collection to a dashboard, and the user has told us to remove the dashcards for other
    ;; dashboards
    (when (and on-dashboard-after?
               (not on-dashboard-before?)
               delete-old-dashcards?)
      ;; TODO: should we publish events here? might be expensive, and it might not be right to show "card X was
      ;; removed from the dashboard" since you can't restore to the previous state...
      (queries.db/delete-dashcards-for-card-off-dashboard! card-id new-dashboard-id)
      (when-let [ids (seq (map :id (queries.db/dashcard-series-for-card-off-dashboard card-id new-dashboard-id)))]
        (queries.db/delete-dashcard-series! ids)))))

(defn create-card!
  "Create a new Card. Metadata will be fetched off thread. If the metadata takes longer than [[metadata-sync-wait-ms]]
  the card will be saved without metadata and it will be saved to the card in the future when it is ready.

  The Card events are published by the write of the row."
  ([card creator] (create-card! card creator true))
  ([{:keys [result_metadata parameters parameter_mappings type] :as input-card-data} creator autoplace-dashboard-questions?]
   ;; you can't specify the dashboard_tab_id and not a dashboard_id
   (api/check-400 (not (and (:dashboard_tab_id input-card-data)
                            (not (:dashboard_id input-card-data)))))
   ;; Gated here, not in `check-allowed-to-create-card!`: the copy endpoints skip that stack but still autoplace.
   (when-let [dashboard-id (and autoplace-dashboard-questions? (:dashboard_id input-card-data))]
     (check-shared-dashboard-timeline-permissions! (queries.db/dashboard dashboard-id) [input-card-data]))
   (let [data-keys                          [:dataset_query :description :display :name :visualization_settings
                                             :parameters :parameter_mappings :collection_id :collection_position
                                             :cache_ttl :type :dashboard_id :document_id]
         position-info                      {:collection_id (:collection_id input-card-data)
                                             :collection_position (:collection_position input-card-data)}
         card-data                          (-> (select-keys input-card-data data-keys)
                                                (assoc
                                                 :creator_id (:id creator)
                                                 :parameters (or parameters [])
                                                 :parameter_mappings (or parameter_mappings [])
                                                 :entity_id (u/generate-nano-id))
                                                (cond-> (nil? type)
                                                  (assoc :type :question))
                                                ;; Strict so a malformed query throws here instead of being silently
                                                ;; coerced to `{}`. See #74615.
                                                (m/update-existing :dataset_query #(lib-be/normalize-query nil % {:strict? true})))
         {:keys [metadata metadata-future]} (card.metadata/maybe-async-result-metadata
                                             {:query     (:dataset_query card-data)
                                              :metadata  result_metadata
                                              :entity-id (:entity_id card-data)
                                              :model?    (model? card-data)})
         card                               (t2/with-transaction [_conn]
                                              ;; Adding a new card at `collection_position` could cause other cards in
                                              ;; this collection to change position, check that and fix it if needed
                                              (api/maybe-reconcile-collection-position! position-info)
                                              (first
                                               (create-cards!
                                                [(lib/normalize ::queries.schema/card.update
                                                                (cond-> card-data
                                                                  metadata
                                                                  (assoc :result_metadata metadata)))])))]
     (let [{:keys [dashboard_id]} card]
       (when (and dashboard_id autoplace-dashboard-questions?)
         (autoplace-dashcard-for-card! dashboard_id (:dashboard_tab_id input-card-data) card (:size input-card-data))))
     (when metadata-future
       (log/info "Metadata not available soon enough. Saving new card and asynchronously updating metadata")
       (save-metadata-async! metadata-future card))
     ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has with
     ;; returned one -- See #4283
     card)))

;;; ------------------------------------------------- Updating Cards -------------------------------------------------

(defn- card-is-verified?
  "Return true if card is verified, false otherwise. Assumes that moderation reviews are ordered so that the most recent
  is the first. This is the case from the hydration function for moderation_reviews."
  [card]
  (-> card :moderation_reviews first :status #{"verified"} boolean))

(def ^:private card-compare-keys
  "When comparing a card to possibly unverify, only consider these keys as changing something 'important' about the
  query."
  #{:table_id
    :database_id
    :query_type ;; these first three may not even be changeable
    :dataset_query})

(defn maybe-unverify!
  "Remove `card`'s verification review when `updates` change something important about its query."
  [card updates actor]
  (when (and (card-is-verified? card)
             (changed? card (select-keys updates card-compare-keys)))
    ;; this is an enterprise feature but we don't care if enterprise is enabled here. If there is a review we need
    ;; to remove it regardless if enterprise edition is present at the moment.
    (moderation-review/create-moderation-review! {:moderated_item_id   (:id card)
                                                  :moderated_item_type "card"
                                                  :moderator_id        (:id actor)
                                                  :status              nil
                                                  :text                (tru "Unverified due to edit")})))

(defn- before-revert
  "The `snapshot` of a Card revision to write to the card `card-id` for the user `user-id`, after the checks that a
  revert needs, with the `:dataset` that revisions of fewer than 50 cards recorded made the `:type`."
  [card-id user-id snapshot]
  (let [snapshot (cond-> snapshot
                   (contains? snapshot :dataset) (-> (dissoc :dataset)
                                                     (assoc :type (if (:dataset snapshot) :model :question))))]
    (parameter-card/check-new-parameter-source-card-permissions "card" card-id (:parameters snapshot))
    (maybe-unverify! (t2/hydrate (queries.db/card card-id) [:moderation_reviews :moderator_details])
                     snapshot
                     {:id user-id})
    snapshot))

(mu/defn- mbql-clause->identifier-for-parameter-updates
  "Get the unique key used to power the parameter mapping update stuff added in #49308. Key is an MBQL-5-style clause
  but with an empty options clause."
  [mbql-clause :- vector?]
  ;; this can currently get called with either MBQL 5 (from query breakouts) or with legacy refs (in `parameter_mappings`)
  (if (map? (second mbql-clause))
    (into [(first mbql-clause)] (drop 2) mbql-clause)
    (subvec mbql-clause 0 2)))

(defn- breakout->identifier->refs
  "Generate mapping of of _ref identifier_ -> #{_ref..._}.

  _ref identifier_ is a vector of first 2 elements of ref, eg. [:expression \"xix\"] or [:field 10]"
  [breakouts]
  (-> (group-by mbql-clause->identifier-for-parameter-updates breakouts)
      (update-vals set)))

(defn- action-for-identifier+refs
  "Generate _action_ for combination of args.

  _Action_ is to be performed on _parameter mapping_ of a _dashcard_. For more info see
  the [[update-associated-parameters!]]'s docstring.

  _Action_ has a form of [<action> & args]."
  [after-identifier->refs identifier before-refs]
  (let [after-refs (get after-identifier->refs identifier #{})]
    (when (and (= 1 (count before-refs) (count after-refs))
               (not= (lib/remove-lib-uuids before-refs) (lib/remove-lib-uuids after-refs)))
      [:update (first after-refs)])))

(defn- breakouts->identifier->action
  "Generate mapping of _identifier_ -> _action_.

  _identifier_ is is a vector of first 2 elements of ref, eg. [:expression \"xix\"] or [:field 10]. Action is generated
  in [[action-for-identifier+refs]] and performed later in [[update-mapping]]."
  [breakout-before-update breakout-after-update]
  (let [before-identifier->refs (breakout->identifier->refs breakout-before-update)
        after-identifier->refs  (breakout->identifier->refs breakout-after-update)]
    ;; Remove no-ops to avoid redundant db calls in [[update-associated-parameters!]].
    (->> before-identifier->refs
         (m/map-kv-vals #(action-for-identifier+refs after-identifier->refs %1 %2))
         (m/filter-vals some?)
         not-empty)))

(defn- eligible-mapping?
  "Decide whether parameter mapping has structure so it can be updated presumably using [[update-mapping]]."
  [{[dim [ref-kind]] :target :as _mapping}]
  (and (= dim :dimension)
       (#{:field :expression} ref-kind)))

(defn- update-mapping
  "Return modified mapping according to action."
  [identifier->action {[_dim field-ref] :target :as mapping}]
  (let [identifier   (mbql-clause->identifier-for-parameter-updates field-ref)
        [action arg] (get identifier->action identifier)]
    (case action
      ;; allowed for now since parameter mappings still use Legacy MBQL fields refs (for now)
      :update (assoc-in mapping [:target 1] (lib/->legacy-MBQL-ref arg))
      mapping)))

(defn- updates-for-dashcards
  [identifier->action dashcards]
  (not-empty (for [{:keys [id parameter_mappings]} dashcards
                   :let [updated (into [] (map #(if (eligible-mapping? %)
                                                  (update-mapping identifier->action %)
                                                  %))
                                       parameter_mappings)]
                   :when (not= parameter_mappings updated)]
               [id {:parameter_mappings updated}])))

(mu/defn- update-associated-parameters!
  "Update _parameter mappings_ of _dashcards_ that target modified _card_, to reflect the modification.

  This function handles only modifications to breakout.

  Context. Card can have multiple multiple breakout elements referencing same field or expression, having different
  _temporal unit_. Those refs can be targeted by dashboard _temporal unit parameter_. If refs change, and card is saved,
  _parameter mappings_ have to be updated to target new, modified refs. This function takes care of that.

  First mappings of _identifier_ -> _action_ are generated. _identifier_ is described
  eg. in [[breakouts->identifier->action]] docstring. Then, dashcards are fetched and updates are generated
  by [[updates-for-dashcards]]. Updates are then executed."
  [card-before :- ::queries.schema/card
   card-after  :- ::queries.schema/card]
  (let [card->breakouts  #(some-> % :dataset_query not-empty lib/breakouts)
        breakouts-before (card->breakouts card-before)
        breakouts-after  (card->breakouts card-after)]
    (when-some [identifier->action (breakouts->identifier->action breakouts-before breakouts-after)]
      (let [dashcards (queries.db/dashcards-for-card (some :id [card-after card-before]))
            updates   (updates-for-dashcards identifier->action dashcards)]
        ;; Beware. This can have negative impact on card update performance as queries are fired in sequence. I'm not
        ;; aware of more reasonable way.
        (when (seq updates)
          (t2/with-transaction [_conn]
            (doseq [[id update] updates]
              (queries.db/update-dashcard! id update))))))))

(deftype SourceCardDependentsGraph []
  graph/Graph
  (children-of [_this key-seq]
    (if (empty? key-seq)
      {}
      (let [deps (queries.db/source-card-dependents key-seq)]
        (u/group-by :source_card_id :id conj #{} deps)))))

(defn- dependent-cards-to-update
  "Return cards to rewrite when `root-card-id` moves off `old-db-id`, with sources before their dependents.
  A card's `database_id` comes from its source card, so updating a dependent first preserves the old ID."
  [root-card-id old-db-id]
  (when-let [all-dep-ids (seq (graph/transitive (->SourceCardDependentsGraph) [root-card-id]))]
    (let [id->card (m/index-by :id (queries.db/cards-queries-info all-dep-ids))]
      (into []
            (comp (map id->card)
                  (filter #(= (get-in % [:dataset_query :database]) old-db-id)))
            all-dep-ids))))

(defn- cascade-database-change-to-dependents!
  "When a card's `database_id` changes, update all cards that use it as a `:source-card` (transitively) so their
  `dataset_query` `:database` key stays in sync. Without this dependent cards would fail with 'Card does not exist'
   because the metadata provider filters cards by database (#74561)."
  [card-before-update card-updates]
  (let [card-id   (:id card-before-update)
        old-db-id (-> card-before-update :dataset_query :database)
        new-db-id (-> card-updates :dataset_query :database)]
    (when (and old-db-id new-db-id (not= old-db-id new-db-id))
      (when-let [cards-to-update (seq (dependent-cards-to-update card-id old-db-id))]
        (update-cards! (mapv (fn [{dep-id :id, dep-query :dataset_query}]
                               {:id            dep-id
                                :dataset_query (assoc dep-query :database new-db-id)})
                             cards-to-update))))))

(defn- update-card-in-db!
  "Write `card-updates` to the Card and the rows that depend on it, in one transaction."
  [card-before-update card-updates actor delete-old-dashcards?]
  ;; don't block our precious core.async thread, run the actual DB updates on a separate thread
  (t2/with-transaction [_conn]
    (api/maybe-reconcile-collection-position! (select-keys card-before-update [:collection_id :collection_position]) (select-keys card-updates [:collection_id :collection_position]))
    (autoplace-or-remove-dashcards-for-card! card-before-update card-updates delete-old-dashcards?)
    (let [updated-fields (u/select-keys-when card-updates
                                             ;; `collection_id` and `description` can be `nil` (in order to unset them).
                                             ;; Other values should only be modified if they're passed in as non-nil
                                             :present #{:collection_id :collection_position :description :cache_ttl :dashboard_id :document_id :embedding_type}
                                             :non-nil #{:dataset_query :display :name :visualization_settings :archived
                                                        :enable_embedding :type :parameters :parameter_mappings :embedding_params
                                                        :result_metadata :verified-result-metadata?})]
      (assert-is-valid-dashboard-internal-update card-updates card-before-update)
      (maybe-unverify! card-before-update updated-fields actor)
      (update-cards! [(-> updated-fields
                          (m/update-existing :dataset_query #(lib/normalize ::queries.schema/card.dataset-query.write %))
                          (assoc :id (:id card-before-update)))])
      (cache-config/invalidate! {:questions [(:id card-before-update)]
                                 :with-overrides? true}))
    ;; Update all transitively dependent cards if the database was changed (#74561)
    (cascade-database-change-to-dependents! card-before-update card-updates)
    ;; ok, now update dependent dashcard parameters
    (try
      (update-associated-parameters! card-before-update card-updates)
      (catch Throwable e
        (log/errorf "Update of dependent card parameters failed!: %s" (ex-message e))))
    (queries.db/card (:id card-before-update))))

(defn update-card!
  "Update a Card. Metadata is fetched asynchronously. If it is ready before [[metadata-sync-wait-ms]] elapses it will be
  included, otherwise the metadata will be saved to the database asynchronously."
  [{:keys [card-before-update card-updates actor delete-old-dashcards?]}]
  (let [notifications (pulse/alerts-of-card-being-changed card-before-update card-updates)]
    (events/with-batched-events
      (update-card-in-db! card-before-update card-updates actor delete-old-dashcards?))
    ;; Fetch the updated Card from the DB
    (let [card (queries.db/card (:id card-before-update))]
      ;;; TODO -- this should be triggered indirectly by `:event/card-update`
      (pulse/notify-alerts-deleted! :old-card card-before-update, :new-card card, :actor actor
                                    :notifications notifications)
      card)))

(defn- revert-card!
  "Returns the Card `card-id` to the tracked columns of `snapshot`, the Card a revision recorded, as an update, which
  is not checked against the schema of what a caller gives, as a stored Card may not meet it."
  [card-id _user-id snapshot]
  (update-cards* [(assoc (select-keys snapshot (revisions/tracked-columns :model/Card)) :id card-id)]))

(defn- update-replaced-card!
  "Apply `changes`, a write of a source replacement, to the Card `card-id`, as any other update of it."
  [card-id changes]
  (update-cards! [(assoc changes :id card-id)]))

(defn- create-imported-cards!
  "Creates the Cards of an import from `rows`, with the model metadata of their entities, which the import has checked
  against the schema of an exported Card."
  [rows]
  (create-cards* (mapv queries.serialization/new-card-row rows)))

(defn- update-imported-cards!
  "Updates the Cards of an import with `rows`, each its `:id` and the columns to change, with the model metadata of
  their entities, and returns all of `rows`."
  [rows]
  (let [locals  (u/index-by :id (queries.db/cards (mapv :id rows)))
        updates (into [] (keep (fn [{:keys [id] :as row}]
                                 (let [update (queries.serialization/updated-card-row row (get locals id))]
                                   (when (seq (dissoc update :id))
                                     update))))
                      rows)]
    (update-cards* updates)
    rows))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/Card
  [_model]
  {:create :event/card-create
   :update :event/card-update
   :delete :event/card-delete})

(defmethod app-db-copy/spec :model/Card [_model]
  {:skip? false})

(defmethod change-log/spec :model/Card [_model]
  {:track [:name :description :display :dataset_query :visualization_settings :creator_id :database_id :table_id
           :query_type :archived :collection_id :public_uuid :made_public_by_id :enable_embedding :embedding_params
           :cache_ttl :result_metadata :collection_position :entity_id :parameters :parameter_mappings
           :metabase_version :type :initially_published_at :archived_directly
           :dataset_query_metrics_v2_migration_backup :source_card_id :dashboard_id :card_schema :document_id
           :legacy_query :embedding_type :public_uuid_prefix :dimensions :dimension_mappings :metabot_conversation_id
           :metabot_chart_id]
   :skip  [:last_used_at :view_count :cache_invalidated_at]})

(defmethod serialization/spec :model/Card [_]
  {:schema              ::queries.schema/external-card
   :copy                [:archived :archived_directly :collection_position :description :display
                         :embedding_params :enable_embedding :embedding_type :entity_id :public_uuid :type :name
                         :card_schema]
   :skip                [:metabase_version :cache_invalidated_at :view_count :last_used_at :initially_published_at
                         :dataset_query_metrics_v2_migration_backup :cache_ttl :legacy_query :query_type :table_id
                         :source_card_id :metabot_conversation_id :metabot_chart_id :public_uuid_prefix]
   :transform           {:database_id            queries.serialization/database-id-transform
                         :collection_id          (serialization/fk-transform :model/Collection)
                         :dashboard_id           (serialization/fk-transform :model/Dashboard)
                         :document_id            (serialization/fk-transform :model/Document)
                         :creator_id             serialization/user-transform
                         :made_public_by_id      serialization/user-transform
                         :dataset_query          serialization/mbql-transform
                         :parameters             serialization/parameters-transform
                         :parameter_mappings     serialization/parameter-mappings-transform
                         :visualization_settings serialization/visualization-settings-transform
                         :result_metadata        queries.serialization/result-metadata-transform
                         :dimensions             queries.serialization/dimensions-transform
                         :dimension_mappings     queries.serialization/dimension-mappings-transform}
   :defaults            {:archived          false
                         :archived_directly false
                         :enable_embedding  false}
   :storage-paths       queries.serialization/storage-paths
   :import-dependencies queries.serialization/import-dependencies
   :export-dependencies queries.serialization/export-dependencies
   :insert!             create-imported-cards!
   :update!             update-imported-cards!
   :delete!             delete-cards!})

(defmethod remote-sync/spec :model/Card
  [_model]
  {:synced-items         queries.db/synced-card-items
   :synced-filter-clause queries.db/synced-cards-clause})

(defmethod revisions/spec :model/Card [_model]
  {:track         [:name :description :display :type :dataset_query :visualization_settings :parameters
                   :parameter_mappings :cache_ttl :result_metadata :card_schema :collection_id :dashboard_id
                   :database_id :table_id :query_type :source_card_id :archived :archived_directly
                   :dataset_query_metrics_v2_migration_backup]
   :skip          [:cache_invalidated_at :collection_position :creator_id :dimension_mappings :dimensions
                   :document_id :embedding_params :embedding_type :enable_embedding :entity_id
                   :initially_published_at :last_used_at :legacy_query :made_public_by_id :metabase_version
                   :metabot_chart_id :metabot_conversation_id :public_uuid :public_uuid_prefix :view_count]
   :same?         {:card_schema     queries.revisions/always-same?
                   :result_metadata queries.revisions/same-result-metadata?}
   :snapshot      queries.revisions/snapshot-metadata
   :defaults      {:card_schema starting-card-schema-version}
   :before-revert before-revert
   :revert!       revert-card!})

(defmethod audit/spec :model/Card [_model]
  {:track          [:name :description :database_id :table_id]
   :track-redacted [:archived :archived_directly :cache_ttl :card_schema :collection_id :creator_id :dashboard_id
                    :dataset_query :dataset_query_metrics_v2_migration_backup :dimension_mappings :dimensions :display
                    :document_id :embedding_params :embedding_type :enable_embedding :initially_published_at
                    :legacy_query :made_public_by_id :metabase_version :metabot_chart_id :metabot_conversation_id
                    :parameter_mappings :parameters :public_uuid :public_uuid_prefix :query_type :result_metadata
                    :source_card_id :type :visualization_settings]
   :skip           [:cache_invalidated_at :collection_position :entity_id :last_used_at :view_count]
   :details        queries.audit/details
   :same?          {:result_metadata queries.revisions/same-result-metadata?}
   :topics         {:create :card-create
                    :update queries.audit/update-topic
                    :delete :card-delete}
   :moments        [{:topic :card-public-link-created, :when queries.audit/public-link-created?}
                    {:topic :card-public-link-deleted, :when queries.audit/public-link-deleted?}]})

(defmethod search/spec :model/Card
  [_model]
  {"card"    (queries.search/card-search-spec "question")
   "dataset" (queries.search/card-search-spec "model")
   "metric"  (queries.search/card-search-spec "metric")})

(defmethod dependencies/spec :model/Card [_model]
  {:type  :card
   :items queries.db/dependency-card-items

   :hydrate      queries.dependencies/hydrate
   :dependencies queries.dependencies/dependencies
   :analysis     queries.dependencies/analysis

   :dependency-columns #{:type :dataset_query :dimension_mappings :parameters}
   :analysis-columns   #{:type :dataset_query}
   :output-columns     #{:type :result_metadata}})

(defmethod replacement/spec :model/Card [_model]
  {:source-database-id :database_id
   :hydrate            queries.replacement/hydrate
   :upgrade-field-refs queries.replacement/upgrade-field-refs
   :swap-source        queries.replacement/swap-source
   :update!            update-replaced-card!})

(defmethod collection-items/spec :model/Card [_model]
  {"card"    {:rank    5
              :items   queries.db/collection-question-items
              :hydrate queries.collection-items/hydrate}
   "dataset" {:rank    3
              :items   queries.db/collection-model-items
              :hydrate queries.collection-items/hydrate-models}
   "metric"  {:rank    4
              :items   queries.db/collection-metric-items
              :hydrate queries.collection-items/hydrate}})

(defmethod recent-views/spec :model/Card [_model]
  {"card"    {:load   queries.db/recent-view-cards
              :render queries.recent-views/render-card
              :type   "question"}
   "dataset" {:load   queries.db/recent-view-cards
              :render queries.recent-views/render-model
              :type   "model"}
   "metric"  {:load   queries.db/recent-view-cards
              :render queries.recent-views/render-metric
              :type   "metric"}})

(defmethod staleness/spec :model/Card [_model]
  {:candidates queries.db/stale-card-candidates
   :load       queries.staleness/load-items
   :render     queries.staleness/render})

(defmethod eid-translation/spec :model/Card [_model]
  {:names [:card :dataset :metric]})

(defmethod xrays/spec :model/Card [_model]
  {:related    queries.xrays/related
   :definition queries.xrays/definition})
