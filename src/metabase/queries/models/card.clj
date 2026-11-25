(ns metabase.queries.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require
   [better-cond.core :as b]
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.actions.models :as actions.models]
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
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
   [metabase.metrics.core :as metrics]
   [metabase.models.db :as models.db]
   [metabase.models.interface :as mi]
   [metabase.notification.models :as notification.models]
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
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.card-writes :as qp.card-writes]
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
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.models.database :as database]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.realize :as t2.realize]
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
    (update-cards! [{:id metric-id :dimensions         dimensions
                     :dimension_mappings dimension-mappings}])))

(defmethod metrics/dimensions-initialized? :metadata/metric
  [metric]
  (some? (:dimensions (queries.db/raw-card-dimensions (:id metric)))))

(defmethod metrics/initialized-dimension-ids :metadata/metric
  [_metadata-type metrics]
  (queries.db/card-ids-with-raw-dimensions (into [] (keep :id) metrics)))

(defmethod metrics/save-all-dimensions! :metadata/metric
  [_metadata-type changes]
  (update-cards! (into []
                       (keep (fn [[metric dimensions dimension-mappings]]
                               (when-let [metric-id (:id metric)]
                                 {:id metric-id :dimensions dimensions :dimension_mappings dimension-mappings})))
                       changes)))

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
  (derive :hook/entity-id))

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
                                   (mi/can-read? document))))))))))))

(methodical/defmethod t2/batched-hydrate [:model/Card :can_query]
  "Whether the current user may run the query of each of `cards`: they read it, and the query permission check allows
  its `dataset_query`."
  [_model k cards]
  (query-perms/assoc-can-query cards k :dataset_query))

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

(mu/defn- source-card-id :- [:maybe ::lib.schema.id/card]
  [query :- [:maybe [:or ::lib.schema/query ::lib-be.schema/empty-query]]]
  (some-> query not-empty lib/primary-source-card-id))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn populate-query-fields
  "`card` with the `database_id`, `table_id`, `query_type` and `source_card_id` its query gives, read without the app
  DB. A query on a Card keeps the `table_id` given, and one on the virtual saved-questions database leaves
  `database_id` as it is, which [[assoc-source-card-tables]] fills; `clear-stale-table-id?` false keeps a `table_id`
  the query no longer names."
  ([card]
   (populate-query-fields card true))
  ([{query :dataset_query, :as card} clear-stale-table-id?]
   (if-let [stage (lib-be/query-first-stage query)]
     (let [source-card-id (:source-card stage)
           table-id       (:source-table stage)]
       (merge card
              {:source_card_id source-card-id
               :query_type     (if (= :mbql.stage/native (:lib/type stage)) :native :query)}
              (when (and (:database query) (not= (:database query) lib.schema.id/saved-questions-virtual-database-id))
                {:database_id (:database query)})
              (when (and (nil? source-card-id) (or table-id clear-stale-table-id?))
                {:table_id table-id})))
     card)))

(defn- assoc-source-card-tables
  "`rows`, each with the `table_id` of the Card its query is built on, and its `database_id` when the query names the
  virtual saved-questions database, reading those Cards at once."
  [rows]
  (let [source-card-id (comp :source-card lib-be/query-first-stage :dataset_query)
        source-ids     (into #{} (keep source-card-id) rows)
        sources        (when (seq source-ids)
                         (u/index-by :id (queries.db/cards-table-ids source-ids)))]
    (mapv (fn [row]
            (if-let [id (source-card-id row)]
              (let [source (get sources id)]
                (cond-> (assoc row :table_id (:table_id source))
                  (and (= lib.schema.id/saved-questions-virtual-database-id (:database (:dataset_query row)))
                       (:database_id source))
                  (assoc :database_id (:database_id source))))
              row))
          rows)))

(defn populate-cards-query-fields
  "`cards` with the query-derived columns of each filled in, including the `table_id` and, on the virtual
  saved-questions database, the `database_id` of the Card a query is built on, reading those Cards at once."
  [cards]
  (assoc-source-card-tables (mapv populate-query-fields cards)))

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

(defn native-audit-db-query?
  "Whether `query`, in MBQL 5 or legacy form, is a native query on the audit database."
  [query]
  (boolean (and (map? query)
                (= audit/audit-db-id (:database query))
                (= :mbql.stage/native (:lib/type (lib-be/query-first-stage query))))))

(defn- check-not-native-audit-db-query
  "Throws a 400 when the query of `card` is a native query on the audit database, for every writer."
  [{query :dataset_query}]
  (when (native-audit-db-query? query)
    (throw (ex-info (tru "You cannot save a native query that targets the audit database.")
                    {:status-code 400}))))

(defn- check-model-query
  "Throws a 400 when `card` is a model whose native query has a variable or a field filter."
  [{query :dataset_query, :as card}]
  (when (model? card)
    (let [stage (lib-be/query-first-stage query)
          tags  (:template-tags stage)]
      (when (and (= :mbql.stage/native (:lib/type stage))
                 (some #(not (contains? #{:card :snippet} (keyword (:type %)))) (if (map? tags) (vals tags) tags)))
        (throw (ex-info (tru "A model made from a native SQL question cannot have a variable or field filter.")
                        {:status-code 400}))))))

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

(defn- moves-into-dashboard?
  "Whether `changes` move `card` into a Dashboard it is not in."
  [card changes]
  (boolean (and (api/column-will-change? (:dashboard_id card) (get changes :dashboard_id ::api/not-provided))
                (:dashboard_id changes))))

(defn- assert-is-valid-dashboard-internal-update [changes card]
  ;; Clients re-send the current `dashboard_id` on every save, so only a genuine move into a dashboard is checked
  ;; (#82237).
  (when (moves-into-dashboard? card changes)
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

(defenterprise pre-update-check-sandboxes-constraints
  "Throws when a change of the result metadata of a Card of `card-changes`, `[stored-card changes]` pairs, stops it
  matching the Tables of its sandboxes, which OSS never does."
  metabase-enterprise.sandbox.models.sandbox
  [_])

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

(defmulti create-followers!
  "Create the `rows` of `model` that a write of Cards adds, such as the DashboardCard of a dashboard question, which a
  model whose namespace requires this one implements with its own write function."
  {:arglists '([model rows])}
  (fn [model _rows] model))

(defmulti update-followers!
  "Apply `rows`, each the `:id` of a row of `model` and the columns to change, that a write of Cards changes, which a
  model whose namespace requires this one implements with its own write function."
  {:arglists '([model rows])}
  (fn [model _rows] model))

(defmulti delete-followers!
  "Delete the rows of `model` with `ids` that a write of Cards removes, which a model whose namespace requires this one
  implements with its own write function."
  {:arglists '([model ids])}
  (fn [model _ids] model))

(defn- write-followers!
  "Call `multi` with `model`, after loading it, and `rows-or-ids`."
  [multi model rows-or-ids]
  (t2/resolve-model model)
  (multi model rows-or-ids))

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
      (update-cards! card-updates)
      (when-let [dashboard-updates (not-empty
                                    (into []
                                          (keep (fn [id]
                                                  (let [parameters     (get dash-params id)
                                                        new-parameters (new-params parameters (get by-object [:dashboard id]))]
                                                    (when (not= parameters new-parameters)
                                                      {:id id :parameters new-parameters}))))
                                          dashboard-ids))]
        (write-followers! update-followers! :model/Dashboard dashboard-updates)))))

(defn- reset-values-sources-of-changed-cards!
  "Resets to the default source the parameters of any Dashboard or Card that take their values from a field of one of
  the `cards` that its new `result_metadata` in its changes, `[card changes]` pairs, no longer has;
  [[update-cards!]] resets those of archived cards."
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

(defn- update-baseline-select?
  "Whether the select in progress is the one Toucan runs before an update to read the stored rows, which must stay as
  stored: an upgraded baseline would already read as current, and the update would drop the upgrade from its changes."
  []
  (contains? t2.pipeline/*parsed-args* :changes))

(mu/defn- upgrade-card-schema-to-latest :- ::queries.schema/card
  "Run the schema upgrades over a Card row and normalize it."
  [card :- ::queries.schema/card]
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

         (update-baseline-select?)
         card

         :else
         (loop [card card]
           ;; Use >= to allow for downgrades.
           (if (>= (:card_schema card) current-card-schema-version)
             card
             (let [new-version (inc (:card_schema card))]
               (recur (assoc (upgrade-card-schema-to card new-version)
                             :card_schema new-version))))))
       (lib/normalize ::queries.schema/card)))

(defn- add-schema-governed-columns
  "`updates` of Cards, `before` the Cards read through after-select and so upgraded to the current schema, by id, each
  with the upgraded [[card-schema/schema-governed-columns]] it does not give and the current `:card_schema` when it
  changes one of the [[card-schema/schema-upgrade-triggers]] of a Card stored at an older schema, so that those columns
  are written in lockstep."
  [updates before]
  (let [triggering? (fn [update] (some #(contains? update %) card-schema/schema-upgrade-triggers))
        stored      (when (some triggering? updates)
                      (queries.db/card-schema-versions (into [] (comp (filter triggering?) (map :id)) updates)))]
    (mapv (fn [{:keys [id] :as update}]
            (let [stored-schema (get stored id)]
              (if (and stored-schema (< stored-schema current-card-schema-version) (triggering? update))
                (merge (select-keys (get before id) card-schema/schema-governed-columns)
                       {:card_schema current-card-schema-version}
                       update)
                update)))
          updates)))

(defn- assoc-inferred-result-metadata
  "`row`, a new Card or an update of the Card `stored`, with the result metadata inferred from its query when it gives
  a query and no metadata."
  [row stored]
  (if (and (seq (:dataset_query row))
           (if stored
             (not (contains? row :result_metadata))
             (nil? (:result_metadata row))))
    (let [row' (update row :dataset_query lib-be/normalize-query)]
      (assoc row :result_metadata (:result_metadata (card.metadata/populate-result-metadata (merge stored row')
                                                                                            (when stored row')))))
    row))

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

(defn- revealed-timeline-ids
  "The ids of the timelines `card` newly shows compared to `previous-card`, which is nil for a new Card."
  [card previous-card]
  (let [visibility          (select-keys (:visualization_settings card) timeline-visibility-keys)
        previous-visibility (select-keys (:visualization_settings previous-card) timeline-visibility-keys)
        draws-events?       (fn [visibility display]
                              (and (events-enabled? visibility) (timeline-events-supported-display? display)))
        reveals-all?        (and (draws-events? visibility (:display card))
                                 (not (draws-events? previous-visibility (:display previous-card))))]
    (if (or reveals-all? (not= visibility previous-visibility))
      (newly-revealed-timeline-ids visibility previous-visibility reveals-all?)
      #{})))

(defn- timelines-readable?
  "Whether the current user can read every Timeline of `timeline-ids`, from one read."
  [timeline-ids]
  (or (empty? timeline-ids)
      (every? mi/can-read? (t2/hydrate (queries.db/timelines (set timeline-ids)) :can_read))))

(defn- timeline-selection-readable?
  "Whether the current user can read every timeline `card` newly shows compared to `previous-card`, which is nil for a
  new Card."
  [card previous-card]
  (timelines-readable? (revealed-timeline-ids card previous-card)))

(defn can-create-all?
  "Whether the current user can create each of `entries`, `[card copy-source]` pairs, as [[mi/can-create?]] answers
  for one Card, from one read of their Collections and one of the timelines they newly show, false when one cannot or
  a Collection does not exist, which asking one by one answers with its error."
  [entries]
  (and (collection/can-write-all-collections-or-root? (map (comp :collection_id first) entries) {:root-namespace nil})
       (timelines-readable? (into #{} (mapcat (fn [[card copy-source]] (revealed-timeline-ids card copy-source))) entries))))

(defn readable-cards-by-id
  "A map of id to the Card, hydrated with `:can_read`, for the Cards with `card-ids`, from one read, or nil when one does
  not exist or may not be read by the current user, as [[metabase.api.common/read-check]] would refuse."
  [card-ids]
  (let [cards (t2/hydrate (queries.db/cards (set card-ids)) :can_read)]
    (when (and (= (count cards) (count (set card-ids)))
               (every? mi/can-read? cards))
      (u/index-by :id cards))))

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

(defn- shared-dashboards-timelines-readable?
  "Whether the current user reads the timelines that the public or embedded Dashboards of `dashboard-cards`,
  `[dashboard cards]` pairs, show to anyone for their `cards`, with the timelines read together."
  [dashboard-cards]
  (or (not api/*current-user-id*)
      (timelines-readable? (into #{}
                                 (comp (filter (fn [[dashboard _]] (or (:public_uuid dashboard) (:enable_embedding dashboard))))
                                       (mapcat second)
                                       (mapcat card-exposed-timeline-ids))
                                 dashboard-cards))))

(defn check-shared-dashboard-timeline-permissions!
  "Placing `cards` on `dashboard` shows their selected timeline events to anyone who opens it when the dashboard is
  publicly shared or embedded, so the current user needs read access to those timelines."
  [dashboard cards]
  (when (and api/*current-user-id*
             (or (:public_uuid dashboard) (:enable_embedding dashboard)))
    (let [timeline-ids (into #{} (mapcat card-exposed-timeline-ids) cards)]
      (doseq [timeline (t2/hydrate (queries.db/timelines timeline-ids) :can_read)]
        (api/read-check timeline)))))

(defn check-new-dashboard-questions-timeline-permissions
  "Throws, for the first Dashboard in order, what [[check-shared-dashboard-timeline-permissions!]] throws when `rows`, the
  Cards about to be created, put dashboard questions on a publicly shared or embedded Dashboard showing timelines that the
  current user may not read, from one read of the Dashboards and one of the timelines whatever their number."
  [rows]
  (let [rows       (into [] (comp (filter :dashboard_id) (map (fn [row] (update row :display #(some-> % keyword))))) rows)
        dashboards (when (seq rows) (u/index-by :id (queries.db/dashboards (into #{} (map :dashboard_id) rows))))
        groups     (group-by :dashboard_id rows)
        shared     (filter (fn [[dashboard-id _]]
                             (let [dashboard (get dashboards dashboard-id)]
                               (and api/*current-user-id* (or (:public_uuid dashboard) (:enable_embedding dashboard)))))
                           groups)]
    (when-not (timelines-readable? (into #{} (comp (mapcat val) (mapcat card-exposed-timeline-ids)) shared))
      (doseq [[dashboard-id group] groups]
        (check-shared-dashboard-timeline-permissions! (get dashboards dashboard-id) group)))))

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

(defn- dashboards-move-permitted?
  "Whether the current user may do what the changes of each of `card-changes`, `[card changes]` pairs, do to the
  Dashboard of the Card: write the Dashboards it appears in, and read the timelines it shows on the Dashboard it moves
  into when that is shared, with the Dashboards each way and the timelines read together."
  [card-changes]
  (let [moving (filterv (fn [[card changes]]
                          (api/column-will-change? (:dashboard_id card) (get changes :dashboard_id ::api/not-provided)))
                        card-changes)]
    (or (empty? moving)
        (let [in-dashboards (t2/hydrate (mapv first moving) :in_dashboards)
              targets       (u/index-by :id (queries.db/dashboards (into #{} (keep (comp :dashboard_id second)) moving)))]
          (and (every? mi/can-write? (t2/hydrate (vec (vals (u/index-by :id (mapcat :in_dashboards in-dashboards)))) :can_write))
               (shared-dashboards-timelines-readable?
                (mapv (fn [[card changes]]
                        [(get targets (:dashboard_id changes)) [(merge card changes)]])
                      moving)))))))

(defn- summary-owner-writable
  "A function from one of the cards of `card-changes`, `[card changes]` pairs, to whether the current user writes the
  Exploration whose Summary holds it, or nil for a Card of no Summary, with the Documents and Explorations loaded once,
  and only when the changes archive or restore one of them alone."
  [card-changes]
  (let [doc->exploration (when-let [ids (and (some (fn [[card changes]] (mi/changes-only-archived? card changes)) card-changes)
                                             (seq (into [] (comp (map first) (keep :document_id) (distinct)) card-changes)))]
                           (into {} (comp (mapcat #(queries.db/documents-collection-and-exploration (vec %)))
                                          (keep (fn [{:keys [id exploration_id]}] (when exploration_id [id exploration_id]))))
                                 (partition-all mdb/update-partition-size ids)))
        writable         (when (seq doc->exploration)
                           (into #{} (comp (mapcat #(t2/hydrate (queries.db/explorations (vec %)) :can_write))
                                           (filter mi/can-write?)
                                           (map :id))
                                 (partition-all mdb/update-partition-size (distinct (vals doc->exploration)))))]
    (fn [card]
      (when-let [exploration-id (get doc->exploration (:document_id card))]
        (contains? writable exploration-id)))))

(defn- can-update-apart-from-collection-and-sandboxes?
  "Whether the current user may apply `changes` to `card` as far as every rule but where its Collection changes and
  sandboxing go, where `summary-owner-writable` answers an archive or restore of a Summary Card, which no user writes,
  at its Exploration, and `dashboard-move-permitted` is whether they may do what `changes` do to its Dashboard."
  [card changes summary-owner-writable dashboard-move-permitted]
  (and (let [owner-writable (when (mi/changes-only-archived? card changes) (summary-owner-writable card))]
         (if (some? owner-writable)
           owner-writable
           (or (changes-only-public-link? card changes) (mi/can-write? card))))
       (can-change-public-link? card changes)
       dashboard-move-permitted
       (can-change-embedding? card changes)
       (timeline-selection-readable? (merge card changes) card)))

(defmethod mi/can-update? :model/Card
  [card changes]
  (and (can-update-apart-from-collection-and-sandboxes? card changes
                                                        (summary-owner-writable [[card changes]])
                                                        (dashboards-move-permitted? [[card changes]]))
       (collection/can-move? card changes)
       (sandboxes-allow-card-update? card (changing-columns card changes sandbox-guarded-columns))))

(defn can-update-cards?
  "Whether the current user may apply to each Card of `card-changes`, `[card changes]` pairs of Cards hydrated with
  `:can_write`, its own changes, as [[mi/can-update?]] answers for one, with what the Cards depend on read together."
  [card-changes]
  (and (let [owner-writable        (summary-owner-writable card-changes)
             dashboard-move-permitted (dashboards-move-permitted? card-changes)]
         (every? (fn [[card changes]]
                   (can-update-apart-from-collection-and-sandboxes? card changes owner-writable dashboard-move-permitted))
                 card-changes))
       (every? (fn [[_ group]] (collection/can-move-all? (mapv first group) (second (first group))))
               (group-by (comp #(select-keys % [:collection_id]) second) card-changes))
       (sandboxes-allow-cards-update? (into []
                                            (comp (filter (fn [[card changes]] (seq (changing-columns card changes sandbox-guarded-columns))))
                                                  (map first))
                                            card-changes))))

(defn first-update-refused
  "The first of `card-changes`, `[card changes]` pairs of Cards hydrated with `:can_write`, that [[mi/can-update?]]
  refuses, throwing the 404 it throws for a Collection that does not exist, nil when it refuses none, with the
  Collections read together and the other rules asked pair by pair up to the first refusal."
  [card-changes]
  (some (fn [[[card changes :as pair] move]]
          (cond
            (not (can-update-apart-from-collection-and-sandboxes? card changes
                                                                  (summary-owner-writable [pair])
                                                                  (dashboards-move-permitted? [pair])))
            pair

            (= :not-found move) (api/check-404 nil)
            (not move)          pair

            (not (sandboxes-allow-card-update? card (changing-columns card changes sandbox-guarded-columns)))
            pair))
        (map vector card-changes (collection/move-answers card-changes))))

(defmethod mi/can-update-all? :model/Card
  [_model cards changes]
  (can-update-cards? (mapv #(vector % changes) cards)))

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
  "The Collection row with the id `collection-id` that `placement` holds, nil for the root or for a Collection that does
  not exist, which the foreign key of `collection_id` refuses when the Card is written."
  [{:keys [collections]} collection-id]
  (when collection-id
    (get collections collection-id)))

(defn- load-placement
  "What the checks of where `cards` are put read, loaded for all of them at once: `:dashboards`, the Dashboards they
  are in by id, which are `dashboards`, `:archived-documents`, the ids of their Documents that are archived, and
  `:collections`, the Collections they are in, by id."
  [cards dashboards]
  {:dashboards         dashboards
   :archived-documents (queries.db/archived-document-ids (into #{} (keep :document_id) cards))
   :collections        (collection/collections-for-content-checks (into #{} (keep :collection_id) cards))})

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
  (let [card (-> (merge {:parameters [] :parameter_mappings []} card)
                 (assoc :metabase_version config/mb-version-string
                        :card_schema      current-card-schema-version)
                 (u/assoc-default :entity_id (u/generate-nano-id))
                 (u/assoc-default :type :question))]
    (check-model-query card)
    (check-not-native-audit-db-query card)
    (-> card
        derive-model-display
        maybe-check-dashboard-internal-card
        populate-query-fields
        maybe-populate-initially-published-at
        public-sharing/add-public-uuid-prefix)))

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

(t2/define-before-update :model/Card
  [card]
  (let [changes (t2/changes card)
        card    (dissoc card :verified-result-metadata?)]
    (when (some #(contains? changes %) [:type :dataset_query])
      (check-model-query card))
    (when (some #(contains? changes %) [:dataset_query :database_id])
      (check-not-native-audit-db-query card))
    (-> card
        (cond-> (contains? changes :type) derive-model-display)
        (populate-query-fields (contains? changes :dataset_query))
        (clear-metabot-origin changes)
        mi/add-initially-published-at
        public-sharing/add-public-uuid-prefix-if-changed)))

(defmethod mi/non-timestamped-fields :model/Card
  [_]
  #{:initially_published_at})

(defn- delete-notifications-of-cards!
  "Deletes the alerts of the Cards with `card-ids`, which are found before any is deleted."
  [card-ids]
  (when-let [notification-ids (seq (queries.db/card-notification-ids-for-cards card-ids))]
    (notification.models/delete-notifications! (vec notification-ids))))

(defenterprise delete-card-tests-for-cards!
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

;;; --------------------------------------------------- Hydration ----------------------------------------------------

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

(methodical/defmethod t2/batched-hydrate [:model/Card :can_manage_db]
  "Hydrate can_manage_db onto cards. Indicates whether the current user has access to the database admin page for the
  database powering this card."
  [_model _k cards]
  (let [values (perms/database-permissions-for-user (perms/user-info api/*current-user-id*)
                                                    :perms/manage-database
                                                    (into [] (comp (keep :database_id) (distinct)) cards))]
    (map
     (fn [card]
       (assoc card
              :can_manage_db
              (boolean (when-let [db-id (:database_id card)]
                         (perms/at-least-as-permissive? :perms/manage-database (get values db-id) :yes)))))
     cards)))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(def ^:private metadata-async-timeout-ms
  "Duration in milliseconds to wait for the metadata before abandoning the asynchronous metadata saving. Default is 15
  minutes."
  (u/minutes->ms 15))

(mu/defn save-metadata-async!
  "Saves the result metadata of each of `pending`, entries of a Card and the future of its metadata, with one update
  from one background thread that starts after the surrounding transaction commits, waits up to
  [[metadata-async-timeout-ms]] for all of them and skips the Cards whose query changed meanwhile."
  [pending :- [:sequential [:map {:closed true}
                            [:future ::card.metadata/future]
                            [:card   ::queries.schema/card]]]]
  (when (seq pending)
    (mdb/do-after-commit
     #(future
        (try
          (let [deadline (+ (System/currentTimeMillis) metadata-async-timeout-ms)
                ready    (into []
                               (keep (fn [{metadata-future :future, card :card}]
                                       (let [id       (u/the-id card)
                                             metadata (deref metadata-future
                                                             (max 0 (- deadline (System/currentTimeMillis)))
                                                             ::timed-out)]
                                         (cond
                                           (= metadata ::timed-out)
                                           (do
                                             (log/infof "Metadata not ready in %s, abandoning"
                                                        (u/format-milliseconds metadata-async-timeout-ms))
                                             (future-cancel metadata-future)
                                             nil)

                                           (= metadata ::card.metadata/recompute-failed)
                                           (log/infof "Not updating metadata asynchronously for card %s because the recompute failed" id)

                                           (not (seq metadata))
                                           (log/infof "Not updating metadata asynchronously for card %s because no metadata" id)

                                           :else
                                           {:card card :metadata metadata}))))
                               pending)
                current  (u/index-by :id (queries.db/cards-queries-info (mapv (comp u/the-id :card) ready)))
                updates  (into []
                               (keep (fn [{:keys [card metadata]}]
                                       (let [id (u/the-id card)]
                                         (if (= (:dataset_query card) (:dataset_query (get current id)))
                                           {:id id :result_metadata metadata}
                                           (log/infof "Not updating metadata asynchronously for card %s because query has changed" id)))))
                               ready)]
            (when (seq updates)
              (update-cards! updates {:writer :sync})
              (log/infof "Metadata updated asynchronously for cards %s" (pr-str (mapv :id updates)))))
          (catch Throwable e
            (log/errorf "Error updating metadata for Cards %s asynchronously: %s"
                        (pr-str (mapv (comp u/the-id :card) pending)) (ex-message e))))))))

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
    (update-cards! updates {:writer :sync})
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

(defn- card-sourced-parameter-objects
  "`[id parameters]` of each of `cards` whose parameters take their values from a Card."
  [cards]
  (into []
        (keep (fn [{:keys [id parameters]}]
                (when (seq (parameter-card/values-source-card-ids parameters))
                  [id parameters])))
        cards))

(defn- new-row-with-defaults
  "The new Card `row` with the `:type`, `:parameters` and `:parameter_mappings` a Card has by default and its query
  normalized strictly, so that a malformed query throws instead of being coerced to `{}` (#74615)."
  [row]
  (cond-> (assoc row
                 :parameters         (or (:parameters row) [])
                 :parameter_mappings (or (:parameter_mappings row) []))
    (nil? (:type row))   (assoc :type :question)
    (:dataset_query row) (update :dataset_query #(lib-be/normalize-query nil % {:strict? true}))))

(defn- result-metadata-once
  "[[card.metadata/maybe-async-result-metadata]] of `options`, computed once for the options `cache`, a volatile, holds
  the answer of, which `:entity-id` does not change, so that Cards with the same query take one computation."
  [cache options]
  (let [k (dissoc options :entity-id)]
    (or (get @cache k)
        (u/prog1 (card.metadata/maybe-async-result-metadata options)
          (vswap! cache assoc k <>)))))

(defn- assoc-new-result-metadata
  "`[rows futures]`: the new Card `rows`, each with the result metadata of its query when that is ready within the
  time a write waits for it, and the futures of the metadata that is not, by the index of the row, rows with the same
  query and metadata sharing one computation."
  [rows]
  (reduce (let [cache (volatile! {})]
            (fn [[rows futures] [i row]]
              (let [{:keys [metadata metadata-future]} (result-metadata-once
                                                        cache
                                                        {:query     (:dataset_query row)
                                                         :metadata  (:result_metadata row)
                                                         :entity-id (:entity_id row)
                                                         :model?    (model? row)})]
                [(conj rows (cond-> row metadata (assoc :result_metadata metadata)))
                 (cond-> futures metadata-future (assoc i metadata-future))])))
          [[] {}]
          (map-indexed vector rows)))

(defn- derive-new-card-rows
  "`rows`, the new Cards of one batch, with the columns that their queries, their metadata and their Dashboards give
  each, and the `dashboards` they go in by id."
  [rows dashboards]
  (->> (assoc-source-card-tables rows)
       (mapv #(assoc-inferred-result-metadata % nil))
       (mapv #(dashboard-question-collection % dashboards))))

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

(defn- check-new-cards
  "Throw unless every one of `rows`, the new Cards of one batch, with the `placement` they read, satisfies these rules:

  - it can go where it is put
  - its timeline ids are sequences of positive integers
  - its parameters and parameter mappings are well formed
  - a native query that filters on Fields filters on Fields of its Database"
  [rows placement]
  (run! #(check-new-card-placement % placement) rows)
  (doseq [row rows]
    (check-timeline-settings row)
    (params/assert-valid-parameters row)
    (params/assert-valid-parameter-mappings row))
  (check-field-filter-fields-are-from-correct-database
   (into [] (keep #(when (:dataset_query %) {:dataset_query (lib-be/normalize-query (:dataset_query %))})) rows)))

(defn- insert-cards!
  "Inserts `rows`, the checked new Cards of one batch, and what depends on them, and returns the new Cards."
  [rows]
  (let [cards (queries.db/insert-cards! rows)]
    (sync-field-values! (into #{} (mapcat params/card->template-tag-field-ids) cards))
    (when-let [objects (seq (card-sourced-parameter-objects cards))]
      (parameter-card/sync-parameter-cards! "card" (vec objects)))
    cards))

(defn- create-card-batch!
  "Checks and inserts the Cards of `batch`, up to one partition of the call, and returns the new Cards."
  [batch importing?]
  (let [rows       (cond->> batch importing? (mapv queries.serialization/new-card-row))
        dashboards (queries.db/dashboards-for-placement (into #{} (keep :dashboard_id) rows))
        rows       (derive-new-card-rows rows dashboards)
        placement  (load-placement rows dashboards)]
    (check-new-cards rows placement)
    (insert-cards! rows)))

(mu/defn create-cards! :- [:sequential :map]
  "Create a Card from each of `rows` and return the new Cards in order, after checking that each can go where it is
  put and that its Field filters are on Fields of its Database, a user's write computing the result metadata of each
  query first and saving what is not ready soon enough afterwards on one background thread, and publishing the
  creation of the Cards as the last step."
  ([rows :- [:sequential ::queries.schema/card.create]]
   (create-cards! rows nil))
  ([rows :- [:sequential ::queries.schema/card.create]
    opts :- :metabase.events.schema/write-opts]
   (let [importing?     (= :import (:writer opts))
         rows           (cond->> rows
                          (not importing?) (mapv new-row-with-defaults))
         [rows futures] (if (nil? (:writer opts))
                          (assoc-new-result-metadata rows)
                          [(vec rows) {}])
         cards          (t2/with-transaction [_conn]
                          (let [cards (into [] (mapcat #(create-card-batch! % importing?))
                                            (partition-all mdb/create-partition-size rows))]
                            (when (seq cards)
                              (events/publish-event! :event/card-create (events/create-event cards opts)))
                            cards))]
     (when (seq futures)
       (log/info "Metadata not available soon enough. Saving new cards and asynchronously updating metadata")
       (save-metadata-async! (mapv (fn [[i metadata-future]] {:future metadata-future :card (nth cards i)}) futures)))
     cards)))

(defn- changing-values
  "The entries of `update`, an `:id` and columns, that change `card`, with the values the Card stores them as, a
  column `card` does not have, such as `:verified-result-metadata?`, never counting."
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

(defn- columns-to-write
  "The `:id` and columns of the update of `entry` that its Card needs written: the ones that change it, the ones kept in
  lockstep with the schema, and the ones the Card does not have, so that Cards that change the same columns get the
  same statement whatever they stored before."
  [{:keys [update before changes]}]
  (into {}
        (filter (fn [[k v]]
                  (or (= k :id)
                      (= v :updated_at)
                      (contains? changes k)
                      (not (contains? before k))
                      (= k :card_schema)
                      (contains? card-schema/schema-governed-columns k))))
        update))

(defn- check-card-update-placement
  "Throws unless `card`, which `changes` change, can go where it is put, the Collection, Dashboard or Document
  `placement` holds."
  [card changes placement]
  (let [parent (parent-of placement (:collection_id card))]
    (when (contains? changes :collection_id)
      (collection/check-collection-namespace :model/Card parent))
    (when (or (contains? changes :collection_id) (contains? changes :type))
      (collection/check-allowed-content (:type card) parent))
    (cond
      (some #(contains? changes %) [:collection_id :dashboard_id :document_id])
      (check-not-in-archived-container card parent placement)

      (false? (:archived changes))
      (collection/check-collection-not-archived false parent))
    (when (some data-app-card-columns (keys changes))
      (check-data-app-card card parent))))

(defn- placement-needed?
  "Whether `changes` to a Card are checked against where the Card is put."
  [changes]
  (or (some #(contains? changes %) [:collection_id :type :dashboard_id :document_id])
      (false? (:archived changes))
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
    (when (seq implicit)
      (when-let [action-ids (seq (queries.db/implicit-action-ids-for-models implicit))]
        (actions.models/delete-actions! (vec action-ids))))
    (when (seq all)
      (actions.models/delete-actions! (actions.models/action-ids-of-models all)))))

(def ^:private alert-content-columns
  "The columns of a Card whose change can invalidate the alerts of the Card."
  [:display :visualization_settings :dataset_query])

(defn- change-invalidates-alerts?
  "Whether `changes` to the Card `before` touch what its alerts depend on and invalidate them, `after` holding the Cards
  by id as they are after their writes."
  [before changes after]
  (and (some #(contains? changes %) alert-content-columns)
       (pulse/card-change-invalidates-alerts? before (get after (:id before)))))

(defn- delete-alerts-of-changed-cards!
  "Deletes the alerts of the Cards among `updates` that their change from `before` to `after` invalidates."
  [updates after]
  (let [ids (into []
                  (keep (fn [{:keys [before changes]}]
                          (when (change-invalidates-alerts? before changes after)
                            (:id before))))
                  updates)]
    (when (seq ids)
      (delete-notifications-of-cards! ids))))

(defn- move-actions-of-cards!
  "Moves the Actions of the models among `updates` whose Collection changed to the Collection of the model, with one
  read and one statement for each Collection."
  [updates after]
  (actions.models/update-actions-for-models!
   (into {}
         (comp (filter #(contains? (:changes %) :collection_id))
               (map (fn [{:keys [before]}] [(:id before) (:collection_id (get after (:id before)))])))
         updates)))

(defn- add-archived-directly
  "`entries`, update entries, with the `archived_directly` that a change of `archived` gives each unless the update gives
  one: true when the Card is archived on its own, which is when its Collection, Dashboard and Document are not archived,
  and false for a restore."
  [entries]
  (let [changing (filterv #(and (contains? (:changes %) :archived) (not (contains? (:changes %) :archived_directly))) entries)
        carried  (when-let [archiving (not-empty (into [] (comp (filter #(:archived (:changes %)))
                                                                (map #(merge (:before %) (:changes %))))
                                                       changing))]
                   (archived-container-ids archiving))
        derived  (into {}
                       (map (fn [{:keys [before changes]}]
                              [(:id before) (boolean (and (:archived changes) (not (contains? carried (:id before)))))]))
                       changing)]
    (mapv (fn [{:keys [before] :as entry}]
            (let [directly (get derived (:id before))]
              (if (and (some? directly) (not= directly (boolean (:archived_directly before))))
                (-> entry
                    (assoc-in [:update :archived_directly] directly)
                    (assoc-in [:changes :archived_directly] directly))
                entry)))
          entries)))

(defn- archived-entries
  "The entries of `entries`, update entries, that archive their Card."
  [entries]
  (filterv #(and (contains? (:changes %) :archived) (:archived (:changes %))) entries))

(defn- archive-effects!
  "Deletes the Actions of the Cards that the update `entries` archive, the alerts of those archived on their own, and
  resets the parameters that take their values from them."
  [entries]
  (when-let [archiving (not-empty (archived-entries entries))]
    (let [ids      (mapv (comp :id :before) archiving)
          directly (into [] (comp (filter #(boolean (get-in % [:changes :archived_directly] (:archived_directly (:before %)))))
                                  (map (comp :id :before)))
                         archiving)]
      (when (seq directly)
        (delete-notifications-of-cards! directly))
      (actions.models/delete-actions! (actions.models/action-ids-of-models ids))
      (reset-values-sources! (queries.db/parameter-cards-for-cards ids)
                             (fn [param-cards _parameters] (set (map :parameter_id param-cards)))))))

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

(deftype SourceCardDependentsGraph []
  graph/Graph
  (children-of [_this key-seq]
    (if (empty? key-seq)
      {}
      (let [deps (queries.db/source-card-dependents key-seq)]
        (u/group-by :source_card_id :id conj #{} deps)))))

(defn- dependent-cards-to-update
  "Return cards to rewrite when `root-card-ids` move off `old-db-id`, with sources before their dependents.
  A card's `database_id` comes from its source card, so updating a dependent first preserves the old ID."
  [root-card-ids old-db-id]
  (when-let [all-dep-ids (seq (graph/transitive (->SourceCardDependentsGraph) root-card-ids))]
    (let [id->card (m/index-by :id (queries.db/cards-queries-info all-dep-ids))]
      (into []
            (comp (map id->card)
                  (filter #(= (get-in % [:dataset_query :database]) old-db-id)))
            all-dep-ids))))

(def ^:private alert-affecting-columns
  "The columns of a Card whose change can delete its alerts: archiving, and the columns that can invalidate them."
  (conj alert-content-columns :archived))

(defn- assoc-updated-result-metadata
  "`[updates futures]`: the `updates`, each of a Card that gives a query with the result metadata of the query when
  that is ready within the time a write waits for it, and the futures of the metadata that is not, by the id of the
  Card."
  [updates]
  (let [cache   (volatile! {})
        queried (filterv :dataset_query updates)
        before  (if (seq queried)
                  (u/index-by :id (queries.db/cards (into #{} (map :id) queried)))
                  {})]
    (reduce (fn [[updates futures] {:keys [id] :as update}]
              (if-let [card (and (:dataset_query update) (get before id))]
                (let [{:keys [metadata metadata-future]} (result-metadata-once
                                                          cache
                                                          {:original-query    (:dataset_query card)
                                                           :query             (:dataset_query update)
                                                           :metadata          (:result_metadata update)
                                                           :original-metadata (:result_metadata card)
                                                           :model?            (model? (if (nil? (:type update)) card update))
                                                           :entity-id         (or (:entity_id update) (:entity_id card))})]
                  [(conj updates (cond-> update
                                   metadata (assoc :result_metadata metadata :verified-result-metadata? true)))
                   (cond-> futures metadata-future (assoc id metadata-future))])
                [(conj updates update) futures]))
            [[] {}]
            updates)))

(defn- unverify-changed-cards!
  "Removes the verification review of each Card among `entries` whose change touches its query."
  [entries actor]
  (when-let [changing (and (:id actor)
                           (not-empty (filterv (fn [{:keys [changes]}] (some #(contains? changes %) card-compare-keys))
                                               entries)))]
    (when-let [verified (not-empty (filterv card-is-verified? (t2/hydrate (mapv :before changing) :moderation_reviews)))]
      (moderation-review/create-moderation-reviews!
       (mapv (fn [card]
               {:moderated_item_id   (:id card)
                :moderated_item_type "card"
                :moderator_id        (:id actor)
                :status              nil
                :text                (tru "Unverified due to edit")})
             verified)))))

(defn- invalidate-cached-results-of-changed-cards!
  "Invalidates the cached results of each Card among `entries` that its change changes."
  [entries]
  (when-let [ids (not-empty (into []
                                  (comp (filter (comp seq :changes))
                                        (map (comp :id :before)))
                                  entries))]
    (cache-config/invalidate! {:questions ids :with-overrides? true})))

(defn- notifications-of-changing-cards
  "The notifications of the alerts of the Cards among `entries` that a change of `alert-affecting-columns` may delete,
  by the id of the Card, read before the change so that their recipients can be told after it."
  [entries]
  (when-let [ids (not-empty (into []
                                  (comp (filter (fn [{:keys [changes]}] (some #(contains? changes %) alert-affecting-columns)))
                                        (map (comp :id :before)))
                                  entries))]
    (notification.models/notifications-for-cards ids)))

(defn- notify-stopped-alerts!
  "Tells the recipients of `notifications`, those of the alerts of the Cards among `entries` read before the change,
  once the change commits, that the alerts were deleted by the Cards being archived on their own or changed in a way
  that invalidates them."
  [entries after notifications actor]
  (mdb/do-after-commit
   #(pulse/notify-alerts-deleted!
     actor
     (for [{:keys [before changes]} entries
           :let                     [id (:id before)]
           :when                    (seq (get notifications id))
           :when                    (or (change-invalidates-alerts? before changes after)
                                        (and (:archived changes)
                                             (get changes :archived_directly (:archived_directly before))))]
       [before (or (get after id) (merge before changes)) (get notifications id)]))))

(defn- cascade-database-changes!
  "Updates the Cards that use a Card among `entries` whose Database changes as a source, transitively, so that the
  `:database` of their queries stays in sync (#74561), with one read and one write for each pair of the old and the new
  Database."
  [entries]
  (doseq [[[old-db-id new-db-id] group] (group-by (juxt :old-db-id :new-db-id)
                                                  (into []
                                                        (keep (fn [{:keys [before changes]}]
                                                                (let [old-db-id (-> before :dataset_query :database)
                                                                      new-db-id (-> changes :dataset_query :database)]
                                                                  (when (and old-db-id new-db-id (not= old-db-id new-db-id))
                                                                    {:id (:id before) :old-db-id old-db-id :new-db-id new-db-id}))))
                                                        entries))
          :let                     [dependents (seq (dependent-cards-to-update (mapv :id group) old-db-id))]
          :when                    dependents]
    (update-cards! (mapv (fn [{dep-id :id, dep-query :dataset_query}]
                           {:id dep-id :dataset_query (assoc dep-query :database new-db-id)})
                         dependents)
                   {:writer :cascade})))

(defn- update-associated-parameters!
  "Updates the parameter mappings of the DashboardCards of the Cards among `entries` whose query changes, to follow
  the change of its breakouts, with one read and one write."
  [entries]
  (let [breakouts (fn [card] (some-> card :dataset_query not-empty lib/breakouts))
        actions   (into {}
                        (keep (fn [{:keys [before changes update]}]
                                (when (:dataset_query changes)
                                  (when-some [action (breakouts->identifier->action (breakouts before) (breakouts update))]
                                    [(:id before) action]))))
                        entries)]
    (when (seq actions)
      (let [updates (into []
                          (mapcat (fn [dashcard]
                                    (updates-for-dashcards (get actions (:card_id dashcard)) [dashcard])))
                          (queries.db/dashcards-for-cards (keys actions)))]
        (when (seq updates)
          (write-followers! update-followers! :model/DashboardCard (mapv (fn [[id update]] (assoc update :id id)) updates)))))))

(def ^:private derived-from-columns
  "The columns of a Card whose change makes the hooks of the model derive other columns, so that the row an update leaves
  is read again: the query gives the Database, Table, source Card and query type, the type the display, the metadata
  and the settings the origin in a Metabot conversation, embedding the first publication, the Collection what the
  Actions of a model follow."
  #{:display :visualization_settings :dataset_query :collection_id :type :result_metadata :enable_embedding :public_uuid})

(defn- assoc-dashboard-collections
  "`updates`, with the Collection of the Dashboard that each moves its Card into, which `id->stored`, the Cards by id, do not
  have it in."
  [updates id->stored]
  (let [dashboards (queries.db/dashboards-for-placement
                    (into #{}
                          (keep #(when-let [dashboard-id (:dashboard_id %)]
                                   (when (not= dashboard-id (:dashboard_id (get id->stored (:id %))))
                                     dashboard-id)))
                          updates))]
    (mapv (fn [{:keys [id dashboard_id] :as update}]
            (cond-> update
              (and dashboard_id (not= dashboard_id (:dashboard_id (get id->stored id))))
              (assoc :collection_id (:collection_id (get dashboards dashboard_id)))))
          updates)))

(defn- check-update-queries
  "Throw a 400 unless every one of `updates` that gives a query satisfies these rules:

  - its query does not depend on its own Card through the Cards it reads"
  [updates]
  (doseq [{:keys [id dataset_query]} updates
          :when                    (seq dataset_query)]
    (check-no-save-cycle {:id id :dataset_query dataset_query})))

(defn- derive-update-columns
  "`updates`, with the columns that its query, its metadata and the schema of its stored Card give each, `id->stored` being
  the Cards by id."
  [updates id->stored]
  (-> (mapv #(assoc-inferred-result-metadata % (get id->stored (:id %)))
            (assoc-source-card-tables updates))
      (add-schema-governed-columns id->stored)))

(defn- update-entries
  "The entries of `updates`, each with its `:update`, its Card `:before` and the `:changes` it makes, `id->stored` being the
  Cards by id."
  [updates id->stored]
  (add-archived-directly
   (mapv (fn [{:keys [id] :as update}]
           (let [card (get id->stored id)]
             {:update  update
              :before  card
              :changes (changing-values card update)}))
         updates)))

(defn- card-entries
  "The entries of `updates` that name a Card of `id->stored`, the Cards by id, after the checks of their queries."
  [updates id->stored]
  (let [updates (assoc-dashboard-collections (filterv #(contains? id->stored (:id %)) updates) id->stored)]
    (check-update-queries updates)
    (update-entries (derive-update-columns updates id->stored) id->stored)))

(defn- load-update-placement
  "What the placement checks of `entries` read, nil when none of them changes where its Card is."
  [entries]
  (let [checked (filterv (comp placement-needed? :changes) entries)]
    (when (seq checked)
      (load-placement
       (mapv #(merge (:before %) (:changes %)) checked)
       (queries.db/dashboards-for-placement
        (into #{} (keep #(:dashboard_id (merge (:before %) (:changes %)))) checked))))))

(defn- check-card-updates
  "Throw unless every one of `entries`, with the `placement` it reads, satisfies these rules:

  - a Card that moves, changes type or goes in a Dashboard or Document can go where it is put
  - a Card that is restored is not in an archived Collection
  - a change of the visualization settings keeps the timeline ids sequences of positive integers
  - a change of the parameters or parameter mappings keeps them well formed
  - a native query that filters on Fields filters on Fields of its Database
  - a change of the result metadata is allowed by the sandboxes"
  [entries placement]
  (doseq [{:keys [before changes]} (filterv (comp placement-needed? :changes) entries)]
    (check-card-update-placement (merge before changes) changes placement))
  (doseq [{:keys [changes]} entries]
    (when (contains? changes :visualization_settings)
      (check-timeline-settings changes))
    (when (contains? changes :parameters)
      (params/assert-valid-parameters changes))
    (when (contains? changes :parameter_mappings)
      (params/assert-valid-parameter-mappings changes)))
  (check-field-filter-fields-are-from-correct-database
   (into [] (keep #(when-let [query (:dataset_query (:changes %))] {:dataset_query query})) entries))
  (pre-update-check-sandboxes-constraints
   (into [] (keep (fn [{:keys [before changes]}] (when (contains? changes :result_metadata) [before changes]))) entries)))

(defn- write-card-changes!
  "Writes the changes of `entries`, after what a Card that `writer` changes needs: the verification of the Cards whose
  query changes, the cached results and the Actions that follow."
  [entries writer actor following?]
  (let [field-ids (into #{} (mapcat #(newly-referenced-field-ids (:before %) (:changes %))) entries)]
    (when (contains? #{nil :revert} writer)
      (unverify-changed-cards! entries actor))
    (when following?
      (invalidate-cached-results-of-changed-cards! entries))
    (delete-model-actions! entries)
    (queries.db/update-cards! (mapv columns-to-write entries))
    (sync-field-values! field-ids)))

(defn- cards-after
  "The Cards of `entries` as they are after their writes, by id, nil when no change of theirs makes the hooks derive
  another column."
  [entries]
  (when (some (fn [{:keys [changes]}]
                (some #(contains? changes %) derived-from-columns))
              entries)
    (queries.db/cards-by-ids (mapv (comp :id :before) entries))))

(defn- keep-dependents-in-step!
  "Updates what depends on the Cards of `entries`, which `after` holds as they are after their writes: their Actions and
  alerts, the parameters that take their values from them and the values sources that their metadata invalidates."
  [entries after stopping writer actor]
  (delete-alerts-of-changed-cards! entries after)
  (move-actions-of-cards! entries after)
  (archive-effects! entries)
  (when (not= :import writer)
    (notify-stopped-alerts! entries after stopping actor))
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
         entries)))

(defn- updated-card-objects
  "The Cards of the entries `changed` as they are after their writes, by id, for the update event: those `after` holds
  when the hooks derived a column, the others merged with their changes when their timestamp is set by the write."
  [changed after]
  (into {}
        (keep (fn [{:keys [before changes update]}]
                (let [id (:id before)]
                  (cond
                    (some #(contains? changes %) derived-from-columns)
                    [id (get after id)]

                    (= :updated_at (:updated_at update))
                    [id (t2/instance :model/Card (merge before changes))]))))
        changed))

(defn- cascade-card-changes!
  "Updates the Cards that use the Cards of `entries` and the parameter mappings of their DashboardCards, as far as a
  writer that follows changes does, a failure of the parameters being logged."
  [entries]
  (cascade-database-changes! entries)
  (try
    (update-associated-parameters! entries)
    (catch Throwable e
      (log/errorf "Update of dependent card parameters failed!: %s" (ex-message e)))))

(defn- import-updates
  "`updates`, the rows of an import, each with only the columns that change the Card of `id->stored`, the Cards by id, as
  the import writes them, and without those that change nothing."
  [id->stored updates]
  (into []
        (keep (fn [{:keys [id] :as row}]
                (when-let [card (get id->stored id)]
                  (let [changes (dissoc (queries.serialization/updated-card-row row card) :id)]
                    (when (seq changes)
                      (assoc changes :id id))))))
        updates))

(defn- write-card-updates!
  "Writes `entries`, the updates of one batch with the Cards they change, after what a Card that `opts` says changes needs,
  and returns the Cards by id as they are after the writes, for the update event."
  [entries opts]
  (let [writer     (:writer opts)
        following? (not (contains? #{:import :cascade :sync} writer))
        actor      @api/*current-user*
        stopping   (when (not= :import writer) (notifications-of-changing-cards entries))]
    (write-card-changes! entries writer actor following?)
    (let [after (cards-after entries)]
      (keep-dependents-in-step! entries after stopping writer actor)
      (when following?
        (cascade-card-changes! entries))
      (updated-card-objects (filterv (comp seq :changes) entries) after))))

(defn- update-card-batch!
  "Check and write `updates`, one batch of a call, and return the rows written with the Cards by id as stored before and
  as they are after."
  [updates opts]
  (let [id->stored  (queries.db/cards-by-ids (mapv :id updates))
        entries     (card-entries (cond->> updates (= :import (:writer opts)) (import-updates id->stored)) id->stored)
        placement   (load-update-placement entries)
        _           (check-card-updates entries placement)
        id->updated (write-card-updates! entries opts)]
    {:updates     (into []
                        (keep (fn [{:keys [before changes]}] (when (seq changes) (assoc changes :id (:id before)))))
                        entries)
     :id->stored  id->stored
     :id->updated id->updated}))

(defn- save-pending-metadata!
  "Saves, once their futures are ready, the result metadata of the Cards by id of `futures` that was not ready in time."
  [futures]
  (when (seq futures)
    (log/info "Metadata not available soon enough. Saving cards and asynchronously updating metadata")
    (save-metadata-async! (mapv (fn [card] {:future (get futures (:id card)) :card card})
                                (queries.db/cards (keys futures))))))

(mu/defn update-cards! :- :nil
  "Apply `updates`, each the `:id` of a Card with the columns to give it, which may differ from one to the next, after
  checking that each can go where it is put, in one pass that reads the Cards, what their changes need to know and
  the rows that depend on them together and writes the Cards that get the same changes with one statement, publishing
  the event of the writes as the last step with the `:context` of `opts`, such as
  `{:archived-with [:model/Dashboard 1]}` for the Cards that the archive of Dashboard 1 carries."
  ([updates :- [:sequential ::queries.schema/card.update]]
   (update-cards! updates nil))
  ([updates :- [:sequential ::queries.schema/card.update]
    opts    :- :metabase.events.schema/write-opts]
   (when (seq updates)
     (let [[updates futures] (if (nil? (:writer opts))
                               (assoc-updated-result-metadata updates)
                               [updates {}])]
       (t2/with-transaction [_conn]
         (let [batches (mapv #(update-card-batch! (vec %) opts) (partition-all mdb/update-partition-size updates))]
           (when (seq (mapcat :updates batches))
             (events/publish-event! :event/card-update
                                    (events/update-event (into {} (map :id->stored) batches)
                                                         (into [] (mapcat :updates) batches)
                                                         (assoc opts :objects (into {} (map :id->updated) batches)))))))
       (save-pending-metadata! futures)
       nil))))

(defn- delete-card-dependents!
  "Deletes the rows that depend on the Cards with `card-ids`, one batch of a call."
  [card-ids]
  (delete-card-tests-for-cards! card-ids)
  (actions.models/delete-actions! (actions.models/action-ids-of-models card-ids))
  (parameter-card/delete-parameter-cards-for-objects! "card" card-ids card-ids)
  (moderation-review/delete-moderation-reviews! (moderation-review/moderation-review-ids-of-cards card-ids))
  (revision/delete-revisions-for-entities! "Card" card-ids)
  (cache-config/delete-cache-configs! (cache-config/cache-config-ids-for-targets "question" card-ids))
  (delete-notifications-of-cards! card-ids))

(defn- publish-and-delete-card-dependents!
  "Publish the delete event of the Cards `cards` with `opts`, then delete the rows that depend on them."
  [cards opts]
  (events/publish-event! :event/card-delete (events/delete-event cards opts))
  (run! delete-card-dependents! (map vec (partition-all mdb/delete-partition-size (map :id cards)))))

(mu/defn delete-cards! :- :nil
  "Deletes the Cards with `card-ids` after the rows that depend on them, in one transaction, publishing their delete
  event right before the first statement."
  ([card-ids :- [:sequential ::lib.schema.id/card]]
   (delete-cards! card-ids nil))
  ([card-ids :- [:sequential ::lib.schema.id/card]
    opts     :- :metabase.events.schema/write-opts]
   (mdb/delete-batched! :model/Card (distinct card-ids)
                        {:before-delete #(publish-and-delete-card-dependents! % opts)})))

(def ^:private tombstone-chunk-size
  "Card ids per [[metabase.search.core/after-commit!]] step when tombstoning a deleted database's cards."
  1000)

(mu/defn delete-cards-for-databases! :- :nil
  "Delete the Cards of the Databases with `database-ids` in bounded statements, as those Databases are deleted, with
  their search documents and cache configs."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  ;; Cards are deleted by id in bounded statements, bypassing their row-level delete hook and delete capture, so
  ;; their search documents are enumerated first.
  ;; The database cascade then removes rows that hang off those cards, such as their remaining actions and model
  ;; indexes, which Toucan never sees.
  (let [{:keys [gone cascading]}
        (reduce (fn [{:keys [gone cascading]} batch]
                  (let [ids    (mapv :id batch)
                        ;; A search error must not fail the database delete; those documents are left to the reindex.
                        merged (try
                                 (search/add-cascading-documents cascading (mapv #(t2/instance :model/Card %) batch))
                                 (catch Exception e
                                   (log/errorf e "Skipping search cascade enumeration for databases %s" database-ids)
                                   cascading))]
                    ;; A card that moved to another database since the scan survives, and keeps its documents.
                    ;; Only a short count says one did, so a full batch skips the check.
                    {:gone      (if (= (count ids) (queries.db/delete-cards-for-databases! database-ids ids))
                                  (into gone ids)
                                  (into gone (remove (queries.db/existing-card-ids ids)) ids))
                     :cascading merged}))
                {:gone [], :cascading nil}
                (eduction
                 (map t2.realize/realize)
                 (partition-all 1000)
                 (queries.db/card-ids-for-databases-reducible database-ids)))]
    (doseq [card-ids (partition-all tombstone-chunk-size gone)]
      (cache-config/delete-cache-configs! (cache-config/cache-config-ids-for-targets "question" (vec card-ids))))
    ;; Index mutations must see committed state. The shared ingestion queue serializes these tombstones after any
    ;; older re-index that may already have read a soon-to-be-deleted card.
    (when (or (seq gone) (seq cascading))
      (apply search/after-commit! "database delete"
             ;; Each chunk is its own step, and after-commit! catches each step's failure separately.
             ;; Without an ingestion worker a step deletes at once, so a failed chunk costs only its own ids.
             ;; With a worker the steps only queue tombstones, and the worker applies adjacent ones as one run.
             (concat (for [chunk (partition-all tombstone-chunk-size gone)]
                       (fn [] (search/delete! :model/Card chunk)))
                     [(fn [] (search/reconcile-cascading-documents! cascading))]))))
  nil)

(mu/defn touch-last-used! :- :nil
  "Move `last_used_at` of each Card in `card-id->timestamp` forward to its timestamp, without touching `updated_at`,
  in one plain statement that publishes no event: a usage stat no rule reads."
  [card-id->timestamp :- [:map-of ::lib.schema.id/card [:fn #(instance? java.time.temporal.Temporal %)]]]
  (when (seq card-id->timestamp)
    (queries.db/update-cards-last-used-at! card-id->timestamp))
  nil)

(mu/defn increment-view-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Cards with `ids`, in one
  plain statement that publishes no event for a usage stat no rule reads, and return the number updated."
  [count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (mdb/increment-counts! :model/Card :view_count count->ids))

(mu/defn set-last-used-at! :- :int
  "Set `last_used_at` of the Card with `id`, through the model, which the testing API uses to backdate it, and return
  the number updated."
  [id   :- ::lib.schema.id/card
   time :- ms/TemporalInstant]
  (queries.db/set-card-last-used-at! id time))

(defmethod collection/shift-positions-in-collection! :model/Card
  [_model collection-id positions direction]
  (t2/with-transaction [_conn]
    (let [previous (vec (queries.db/cards-at-positions collection-id positions))]
      (u/prog1 (queries.db/shift-card-positions! collection-id positions direction)
        (events/publish-event! :event/card-update
                               (events/update-event (u/index-by :id previous)
                                                    (mapv (fn [card]
                                                            {:id                  (:id card)
                                                             :collection_position (({:+ inc :- dec} direction)
                                                                                   (:collection_position card))})
                                                          previous)))))))

(defmethod collection/positioned-rows-in-collections :model/Card
  [_model collection-ids]
  (queries.db/positioned-cards-in-collections (vec collection-ids)))

(defmethod collection/update-positions! :model/Card
  [_model id->position]
  (update-cards! (mapv (fn [[id position]] {:id id :collection_position position}) id->position)))

(mu/defn invalidate-cached-results! :- :int
  "Set `cache_invalidated_at` of the Cards with `card-ids` to `invalidated-at`, in one statement through the model, so
  that the cached results stored before it are not served, publishing their updates; returns the number updated."
  [card-ids       :- [:sequential ::lib.schema.id/card]
   invalidated-at :- ms/TemporalInstant]
  (t2/with-transaction [_conn]
    (let [card-ids (vec card-ids)
          previous (if (seq card-ids) (vec (queries.db/cards card-ids)) [])]
      (u/prog1 (queries.db/set-cards-cache-invalidated-at! card-ids invalidated-at)
        (events/publish-event! :event/card-update
                               (events/update-event (u/index-by :id previous)
                                                    (mapv (fn [card] {:id (:id card) :cache_invalidated_at invalidated-at})
                                                          previous)))))))

(defmethod cache-config/invalidate-cached-results! :model/Card
  [_model card-ids invalidated-at]
  (invalidate-cached-results! card-ids invalidated-at))

(mu/defn link-to-metabot-conversation! :- :int
  "Record that the Card with `card-id` was saved from the MetabotConversation with `conversation-id` as `chart-id`, in
  the change log and in one statement that publishes no event, returning the number updated."
  [card-id         :- ::lib.schema.id/card
   conversation-id :- :string
   chart-id        :- :string]
  (t2/with-transaction [_conn]
    (change-log/log-rows! :model/Card :update :id card-id)
    (queries.db/set-card-metabot-chart! card-id conversation-id chart-id)))

(defmethod qp.card-writes/touch-last-used! :model/Card
  [_model card-id->timestamp]
  (touch-last-used! card-id->timestamp))

(defmethod qp.card-writes/save-result-metadata! :model/Card
  [_model card-id metadata]
  (update-cards! [{:id card-id :result_metadata metadata :updated_at :updated_at}] {:writer :sync}))

(defmethod database/delete-for-databases! :model/Card
  [_model databases]
  (delete-cards-for-databases! (mapv :id databases)))

(defn- hydrated-dashboards
  "A map of id to the Dashboard, with its dashcards and tabs, for the Dashboards with `dashboard-ids`, read together."
  [dashboard-ids]
  (u/index-by :id (t2/hydrate (queries.db/dashboards (set dashboard-ids)) :dashcards [:tabs :tab-cards])))

(defn- autoplace-dashcards-for-cards!
  "Puts each of `entries`, `{:dashboard-id :dashboard-tab-id :card :size}`, on its Dashboard in the order of `entries`,
  each in the first tab of its Dashboard that the entry names, or in the first of all, below those placed before it, unless
  its Card is on the Dashboard, with the Dashboards `dashboards`, as [[hydrated-dashboards]] gives them, and one write."
  [dashboards entries]
  (let [[_ rows] (reduce
                  (fn [[state rows] {:keys [dashboard-id dashboard-tab-id card size]}]
                    (let [{:keys [dashcards tabs]} (get state dashboard-id)
                          candidates               (remove #(when dashboard-tab-id (not= dashboard-tab-id (:id %))) tabs)]
                      (if (some #(= (:id card) (:card_id %)) dashcards)
                        [state rows]
                        (let [first-tab          (first candidates)
                              cards-on-first-tab (or (when first-tab (:cards first-tab)) dashcards)
                              new-spot           (if-let [{:keys [size_x size_y]} size]
                                                   (autoplace/get-position-for-new-dashcard
                                                    cards-on-first-tab size_x size_y autoplace/default-grid-width)
                                                   (autoplace/get-position-for-new-dashcard
                                                    cards-on-first-tab (:display card)))
                              row                (assoc new-spot
                                                        :dashboard_tab_id (some-> first-tab :id)
                                                        :card_id (:id card)
                                                        :dashboard_id dashboard-id)]
                          [(cond-> (update-in state [dashboard-id :dashcards] (fnil conj []) row)
                             first-tab (update-in [dashboard-id :tabs]
                                                  (fn [tabs]
                                                    (mapv #(if (= (:id %) (:id first-tab)) (update % :cards (fnil conj []) row) %)
                                                          tabs))))
                           (conj rows row)]))))
                  [dashboards []]
                  entries)]
    (when (seq rows)
      (write-followers! create-followers! :model/DashboardCard rows))))

(defn- delete-dashcards!
  "Deletes the DashboardCards with `dashcard-ids` through their model, whose namespace requires this one."
  [dashcard-ids]
  (when (seq dashcard-ids)
    (write-followers! delete-followers! :model/DashboardCard (vec dashcard-ids))))

(defn- remove-dashcards!
  "Deletes the DashboardCards and DashboardCardSeries that show a Card of `leaving`, `[card-id dashboard-id]` pairs,
  on that Dashboard, and a Card of `leaving-others`, such pairs too, on any other Dashboard, each read together."
  [leaving leaving-others]
  (when (or (seq leaving) (seq leaving-others))
    (let [card-ids   (vec (into #{} (map first) (concat leaving leaving-others)))
          leaving    (set leaving)
          keep-only  (into {} leaving-others)
          removed?   (fn [{:keys [card_id dashboard_id]}]
                       (or (contains? leaving [card_id dashboard_id])
                           (when-let [dashboard-id (get keep-only card_id)]
                             (not= dashboard-id dashboard_id))))]
      (delete-dashcards! (into [] (comp (filter removed?) (map :id)) (queries.db/dashcards-for-cards card-ids)))
      (when-let [series-ids (seq (into [] (comp (filter removed?) (map :id)) (queries.db/dashcard-series-for-cards card-ids)))]
        (write-followers! delete-followers! :model/DashboardCardSeries (vec series-ids))))))

(defn- dashboard-placement
  "What the update `card-updates` of `card-before-update` does to its DashboardCards, a map of `:place`, the entry for
  [[autoplace-dashcards-for-cards!]] that puts it on its Dashboard, `:leave`, the Dashboard it leaves, and
  `:leave-others`, the Dashboard it moves into when `delete-old-dashcards?` takes it off all the others, each nil when
  the update does not."
  [{:as card-before-update
    old-dashboard-id :dashboard_id
    old-archived :archived}
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
    {;; we'll end up unarchived and a dashboard card => make sure we autoplace
     :place (when (and on-dashboard-after? (not archived-after?))
              {:dashboard-id new-dashboard-id :dashboard-tab-id dashboard-tab-id :card card-before-update :size nil})
     :leave (when (and
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
              old-dashboard-id)
     ;; we're moving from a collection to a dashboard, and the user has told us to remove the dashcards for other
     ;; dashboards
     ;; TODO: should we publish events here? might be expensive, and it might not be right to show "card X was
     ;; removed from the dashboard" since you can't restore to the previous state...
     :leave-others (when (and on-dashboard-after?
                              (not on-dashboard-before?)
                              delete-old-dashcards?)
                     new-dashboard-id)}))

(defn new-card-row
  "The row for [[create-cards!]] that a new Card of `creator-id` takes from `card`: the columns of `card` a user sets
  when creating a Card, normalized."
  [card creator-id]
  (->> (-> (select-keys card [:dataset_query :description :display :name :visualization_settings :parameters
                              :parameter_mappings :collection_id :collection_position :cache_ttl :type :dashboard_id
                              :document_id :result_metadata])
           (assoc :creator_id creator-id))
       (lib/normalize ::queries.schema/card.create)))

(defn place-new-dashboard-questions!
  "Put each of `cards`, the new Cards that `rows` created in order, on its Dashboard when it is a dashboard question,
  in the tab and with the size its row names, throwing a 400 for a tab of a row with no Dashboard, with one read of
  the Dashboards and one write, what the user may do being the caller's to check with
  [[check-new-dashboard-questions-timeline-permissions]]."
  [cards rows]
  (run! #(api/check-400 (not (and (:dashboard_tab_id %) (not (:dashboard_id %))))) rows)
  (let [placed (filterv (comp :dashboard_id first) (map vector cards rows))]
    (when (seq placed)
      (autoplace-dashcards-for-cards! (hydrated-dashboards (map (comp :dashboard_id first) placed))
                                      (mapv (fn [[card row]]
                                              {:dashboard-id (:dashboard_id card) :dashboard-tab-id (:dashboard_tab_id row)
                                               :card card :size (:size row)})
                                            placed)))))

(defn place-updated-dashboard-questions!
  "Puts each Card `before` of `card-updates`, `[before updates]` pairs of a Card and the columns of an update with its
  `:dashboard_tab_id`, on the Dashboard that its `updates` move it to and takes its DashboardCards off the Dashboard
  it leaves, or all the others when `delete-old-dashcards?`, throwing a 400 for a tab with no Dashboard, for a Card on
  other Dashboards moved into one, and for a change a dashboard question does not allow, with the Dashboards read
  together and each kind of row written with one call."
  [card-updates delete-old-dashcards?]
  (let [placements (mapv (fn [[before updates]] (dashboard-placement before updates delete-old-dashcards?)) card-updates)
        entries    (into [] (keep :place) placements)]
    (when (seq entries)
      (autoplace-dashcards-for-cards! (hydrated-dashboards (map :dashboard-id entries)) entries))
    (remove-dashcards! (into [] (keep (fn [[[before _] {:keys [leave]}]] (when leave [(:id before) leave])))
                             (map vector card-updates placements))
                       (into [] (keep (fn [[[before _] {:keys [leave-others]}]] (when leave-others [(:id before) leave-others])))
                             (map vector card-updates placements)))
    (let [moving   (filterv (fn [[before updates]] (moves-into-dashboard? before updates)) card-updates)
          id->card (zipmap (map (comp :id first) moving)
                           (t2/hydrate (mapv (comp #(dissoc % :in_dashboards) first) moving) :in_dashboards))]
      (run! (fn [[before updates]] (assert-is-valid-dashboard-internal-update updates (get id->card (:id before) before)))
            card-updates))))

(defn place-updated-dashboard-question!
  "Puts the Card `before` on the Dashboard that `updates`, the columns of an update and its `:dashboard_tab_id`, move
  it to, as [[place-updated-dashboard-questions!]] does for one Card, and returns `updates`."
  [before updates delete-old-dashcards?]
  (place-updated-dashboard-questions! [[before updates]] delete-old-dashcards?)
  updates)

(defn card-changes
  "The changes for [[update-cards!]] that the request `changes` make: the columns of `changes` that an update writes,
  `:collection_id` and a few others even when nil and the rest only when not nil."
  [changes]
  (u/select-keys-when changes
                      :present #{:collection_id :collection_position :description :cache_ttl :dashboard_id :document_id :embedding_type}
                      :non-nil #{:dataset_query :display :name :visualization_settings :archived
                                 :enable_embedding :type :parameters :parameter_mappings :embedding_params
                                 :result_metadata :verified-result-metadata?}))

(defn- revert-card!
  "Returns the Card `card-id` to the `snapshot` of a Card that a revision recorded, as an update."
  [card-id _user-id snapshot]
  (update-cards! [(assoc (dissoc snapshot :id) :id card-id)] {:writer :revert}))

(defmethod collection/archive-in-collections! :model/Card
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-archive model collection-ids))]
    (update-cards! (mapv (fn [id] {:id id :archived true}) ids) opts)))

(defmethod collection/restore-in-collections! :model/Card
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-restore model collection-ids))]
    (update-cards! (mapv (fn [id] {:id id :archived false}) ids) opts)))

(defmethod collection/delete-in-collections! :model/Card
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-in-collections model collection-ids))]
    (delete-cards! ids opts)))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- before-revert
  "The `snapshot` of a Card revision to write to the card `card-id`, after the permission check that a revert needs."
  [card-id _user-id snapshot]
  (parameter-card/check-new-parameter-source-card-permissions "card" card-id (:parameters snapshot))
  snapshot)

(defmethod public-sharing/shown-card-ids :model/Card
  [_model card-ids]
  (zipmap card-ids (map hash-set card-ids)))

(defmethod public-sharing/value-list-sources :model/Card
  [_model card-ids]
  ;; A question's anonymous reach includes the questions its filters draw value lists from.
  (->> (queries.db/card-parameters-for-cards card-ids)
       (map (fn [{:keys [id parameters]}]
              [id (vec (for [parameter parameters
                             :let  [card-id (parameter-card/values-source-card-id parameter)]
                             :when card-id]
                         {:parameter parameter, :card-id card-id}))]))
       (into {})))

(defmethod public-sharing/embedding-params :model/Card
  [_model card-ids]
  (into {} (map (juxt :id :embedding_params)) (queries.db/card-parameters-for-cards card-ids)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

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
   :insert!             #(create-cards! % {:writer :import})
   :update!             #(do (update-cards! % {:writer :import}) %)
   :delete!             #(delete-cards! % {:writer :import})})

(defmethod remote-sync/spec :model/Card
  [_model]
  {:synced-items         queries.db/synced-card-items
   :synced-filter-clause queries.db/synced-cards-clause})

(defmethod revisions/spec :model/Card [_model]
  {:track         [:name :description :display :type :dataset_query :visualization_settings :parameters
                   :parameter_mappings :cache_ttl :result_metadata :card_schema :collection_id :dashboard_id
                   :database_id :table_id :query_type :source_card_id :archived :archived_directly
                   :dataset_query_metrics_v2_migration_backup]
   :schema        ::queries.schema/card.revision
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
   :update!            #(update-cards! % {:writer :replacement})})

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
