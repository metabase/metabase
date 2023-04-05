(ns metabase.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.audit_log :as audit-log]
   [metabase.models.collection :as collection]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.parameter-card
    :as parameter-card
    :refer [ParameterCard]]
   [metabase.models.params :as params]
   [metabase.models.permissions :as perms]
   [metabase.models.query :as query]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.moderation :as moderation]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(def Card
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all the Card symbol in our codebase."
  :model/Card)

(methodical/defmethod t2/table-name :model/Card [_model] :report_card)

(methodical/defmethod t2.hydrate/model-for-automagic-hydration [#_model :default #_k :card]
  [_original-model _k]
  :model/Card)

(t2/deftransforms :model/Card
  {:dataset_query          mi/transform-metabase-query
   :display                mi/transform-keyword
   :embedding_params       mi/transform-json
   :query_type             mi/transform-keyword
   :result_metadata        mi/transform-result-metadata
   :visualization_settings mi/transform-visualization-settings
   :parameters             mi/transform-parameters-list
   :parameter_mappings     mi/transform-parameters-list})

(doto :model/Card
  (derive :metabase/model)
  ;; You can read/write a Card if you can read/write its parent Collection
  (derive ::perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))


;;; -------------------------------------------------- Hydration --------------------------------------------------

(mi/define-simple-hydration-method dashboard-count
  :dashboard_count
  "Return the number of Dashboards this Card is in."
  [{:keys [id]}]
  (t2/count 'DashboardCard, :card_id id))

(mi/define-simple-hydration-method parameter-usage-count
  :parameter_usage_count
  "Return the number of dashboard/card filters and other widgets that use this card to populate their available
  values (via ParameterCards)"
  [{:keys [id]}]
  (t2/count ParameterCard, :card_id id))

(mi/define-simple-hydration-method average-query-time
  :average_query_time
  "Average query time of card, taken by query executions which didn't hit cache. If it's nil we don't have any query
  executions on file."
  [{:keys [id]}]
  (-> (mdb.query/query {:select [:%avg.running_time]
                        :from [:query_execution]
                        :where [:and
                                [:not= :running_time nil]
                                [:not= :cache_hit true]
                                [:= :card_id id]]})
      first vals first))

(mi/define-simple-hydration-method last-query-start
  :last_query_start
  "Timestamp for start of last query of this card."
  [{:keys [id]}]
  (-> (mdb.query/query {:select [:%max.started_at]
                        :from [:query_execution]
                        :where [:and
                                [:not= :running_time nil]
                                [:not= :cache_hit true]
                                [:= :card_id id]]})
      first vals first))

;; There's more hydration in the shared metabase.moderation namespace, but it needs to be required:
(comment moderation/keep-me)


;;; --------------------------------------------------- Revisions ----------------------------------------------------

(def ^:private excluded-columns-for-card-revision
  [:id :created_at :updated_at :entity_id :creator_id])

(defmethod revision/serialize-instance :model/Card
  ([instance]
   (revision/serialize-instance Card nil instance))
  ([_model _id instance]
   (cond-> (apply dissoc instance excluded-columns-for-card-revision)
     ;; datasets should preserve edits to metadata
     (not (:dataset instance))
     (dissoc :result_metadata))))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn populate-query-fields
  "Lift `database_id`, `table_id`, and `query_type` from query definition when inserting/updating a Card."
  [{{query-type :type, :as outer-query} :dataset_query, :as card}]
  (cond->> card
    ;; mega HACK FIXME -- don't update this stuff when doing deserialization because it might differ from what's in the
    ;; YAML file and break tests like [[metabase-enterprise.serialization.v2.e2e.yaml-test/e2e-storage-ingestion-test]].
    ;; The root cause of this issue is that we're generating Cards that have a different Database ID or Table ID from
    ;; what's actually in their query -- we need to fix [[metabase.test.generate]], but I'm not sure how to do that
    (not mi/*deserializing?*)
    (merge (when-let [{:keys [database-id table-id]} (and query-type
                                                          (query/query->database-and-table-ids outer-query))]
             {:database_id database-id
              :table_id    table-id
              :query_type  (keyword query-type)}))))

(defn- populate-result-metadata
  "When inserting/updating a Card, populate the result metadata column if not already populated by inferring the
  metadata from the query."
  [{query :dataset_query, metadata :result_metadata, existing-card-id :id, :as card}]
  (cond
    ;; not updating the query => no-op
    (not query)
    (do
      (log/debug "Not inferring result metadata for Card: query was not updated")
      card)

    ;; passing in metadata => no-op
    metadata
    (do
      (log/debug "Not inferring result metadata for Card: metadata was passed in to insert!/update!")
      card)

    ;; this is an update, and dataset_query hasn't changed => no-op
    (and existing-card-id
         (= query (t2/select-one-fn :dataset_query Card :id existing-card-id)))
    (do
      (log/debugf "Not inferring result metadata for Card %s: query has not changed" existing-card-id)
      card)

    ;; query has changed (or new Card) and this is a native query => set metadata to nil
    ;;
    ;; we can't infer the metadata for a native query without running it, so it's better to have no metadata than
    ;; possibly incorrect metadata.
    (= (:type query) :native)
    (do
      (log/debug "Can't infer result metadata for Card: query is a native query. Setting result metadata to nil")
      (assoc card :result_metadata nil))

    ;; otherwise, attempt to infer the metadata. If the query can't be run for one reason or another, set metadata to
    ;; nil.
    :else
    (do
      (log/debug "Attempting to infer result metadata for Card")
      (let [inferred-metadata (not-empty (mw.session/with-current-user nil
                                           (classloader/require 'metabase.query-processor)
                                           (u/ignore-exceptions
                                             ((resolve 'metabase.query-processor/query->expected-cols) query))))]
        (assoc card :result_metadata inferred-metadata)))))

(defn- check-for-circular-source-query-references
  "Check that a `card`, if it is using another Card as its source, does not have circular references between source
  Cards. (e.g. Card A cannot use itself as a source, or if A uses Card B as a source, Card B cannot use Card A, and so
  forth.)"
  [{query :dataset_query, id :id}]      ; don't use `u/the-id` here so that we can use this with `pre-insert` too
  (loop [query query, ids-already-seen #{id}]
    (let [source-card-id (qp.util/query->source-card-id query)]
      (cond
        (not source-card-id)
        :ok

        (ids-already-seen source-card-id)
        (throw
         (ex-info (tru "Cannot save Question: source query has circular references.")
                  {:status-code 400}))

        :else
        (recur (or (t2/select-one-fn :dataset_query Card :id source-card-id)
                   (throw (ex-info (tru "Card {0} does not exist." source-card-id)
                                   {:status-code 404})))
               (conj ids-already-seen source-card-id))))))

(defn- maybe-normalize-query [card]
  (cond-> card
    (seq (:dataset_query card)) (update :dataset_query mbql.normalize/normalize)))

(defn template-tag-parameters
  "Transforms native query's `template-tags` into `parameters`.
  An older style was to not include `:template-tags` onto cards as parameters. I think this is a mistake and they should always be there. Apparently lots of e2e tests are sloppy about this so this is included as a convenience."
  [card]
  ;; NOTE: this should mirror `getTemplateTagParameters` in frontend/src/metabase/parameters/utils/cards.js
  (for [[_ {tag-type :type, widget-type :widget-type, :as tag}] (get-in card [:dataset_query :native :template-tags])
        :when                         (and tag-type
                                           (or (and widget-type (not= widget-type :none))
                                               (not= tag-type :dimension)))]
    {:id      (:id tag)
     :type    (or widget-type (cond (= tag-type :date)   :date/single
                                    (= tag-type :string) :string/=
                                    (= tag-type :number) :number/=
                                    :else                :category))
     :target  (if (= tag-type :dimension)
                [:dimension [:template-tag (:name tag)]]
                [:variable  [:template-tag (:name tag)]])
     :name    (:display-name tag)
     :slug    (:name tag)
     :default (:default tag)}))

(defn- check-field-filter-fields-are-from-correct-database
  "Check that all native query Field filter parameters reference Fields belonging to the Database the query points
  against. This is done when saving a Card. The goal here is to prevent people from saving Cards with invalid queries
  -- it's better to error now then to error down the road in Query Processor land.

  The usual way a user gets into the situation of having a mismatch between the Database and Field Filters is by
  creating a native query in the Query Builder UI, adding parameters, and *then* changing the Database that the query
  targets. See https://github.com/metabase/metabase/issues/14145 for more details."
  [{{query-db-id :database, :as query} :dataset_query, :as card}]
  ;; for updates if `query` isn't being updated we don't need to validate anything.
  (when query
    (when-let [field-ids (not-empty (params/card->template-tag-field-ids card))]
      (doseq [{:keys [field-id field-name table-name field-db-id]} (mdb.query/query
                                                                    {:select    [[:field.id :field-id]
                                                                                 [:field.name :field-name]
                                                                                 [:table.name :table-name]
                                                                                 [:table.db_id :field-db-id]]
                                                                     :from      [[:metabase_field :field]]
                                                                     :left-join [[:metabase_table :table]
                                                                                 [:= :field.table_id :table.id]]
                                                                     :where     [:in :field.id (set field-ids)]})]
        (when-not (= field-db-id query-db-id)
          (throw (ex-info (letfn [(describe-database [db-id]
                                    (format "%d %s" db-id (pr-str (t2/select-one-fn :name 'Database :id db-id))))]
                            (tru "Invalid Field Filter: Field {0} belongs to Database {1}, but the query is against Database {2}"
                                 (format "%d %s.%s" field-id (pr-str table-name) (pr-str field-name))
                                 (describe-database field-db-id)
                                 (describe-database query-db-id)))
                          {:status-code           400
                           :query-database        query-db-id
                           :field-filter-database field-db-id})))))))

(defn- assert-valid-model
  "Check that the card is a valid model if being saved as one. Throw an exception if not."
  [{:keys [dataset dataset_query]}]
  (when dataset
    (let [template-tag-types (->> (vals (get-in dataset_query [:native :template-tags]))
                                  (map (comp keyword :type)))]
      (when (some (complement #{:card :snippet}) template-tag-types)
        (throw (ex-info (tru "A model made from a native SQL question cannot have a variable or field filter.")
                        {:status-code 400}))))))

;; TODO -- consider whether we should validate the Card query when you save/update it??
(defn- pre-insert [card]
  (let [defaults {:parameters         []
                  :parameter_mappings []}
        card     (merge defaults card)]
    (u/prog1 card
      ;; make sure this Card doesn't have circular source query references
      (check-for-circular-source-query-references card)
      (check-field-filter-fields-are-from-correct-database card)
      ;; TODO: add a check to see if all id in :parameter_mappings are in :parameters
      (assert-valid-model card)
      (params/assert-valid-parameters card)
      (params/assert-valid-parameter-mappings card)
      (collection/check-collection-namespace Card (:collection_id card)))))

(defenterprise pre-update-check-sandbox-constraints
 "Checks additional sandboxing constraints for Metabase Enterprise Edition. The OSS implementation is a no-op."
  metabase-enterprise.sandbox.models.group-table-access-policy
  [_])

(defn- update-parameters-using-card-as-values-source
  "Update the config of parameter on any Dashboard/Card use this `card` as values source .

  Remove parameter.values_source_type and set parameter.values_source_type to nil ( the default type ) when:
  - card is archived
  - card.result_metadata changes and the parameter values source field can't be found anymore"
  [{id :id, :as changes}]
  (let [parameter-cards   (t2/select ParameterCard :card_id id)]
    (doseq [[[po-type po-id] param-cards]
            (group-by (juxt :parameterized_object_type :parameterized_object_id) parameter-cards)]
      (let [model                  (case po-type :card 'Card :dashboard 'Dashboard)
            {:keys [parameters]}   (t2/select-one [model :parameters] :id po-id)
            affected-param-ids-set (cond
                                     ;; update all parameters that use this card as source
                                     (:archived changes)
                                     (set (map :parameter_id param-cards))

                                     ;; update only parameters that have value_field no longer in this card
                                     (:result_metadata changes)
                                     (let [param-id->parameter (m/index-by :id parameters)]
                                       (->> param-cards
                                            (filter (fn [param-card]
                                                      ;; if cant find the value-field in result_metadata, then we should remove it
                                                      (nil? (qp.util/field->field-info
                                                              (get-in (param-id->parameter (:parameter_id param-card)) [:values_source_config :value_field])
                                                              (:result_metadata changes)))))
                                            (map :parameter_id)
                                            set))

                                     :else #{})
            new-parameters (map (fn [parameter]
                                  (if (affected-param-ids-set (:id parameter))
                                    (-> parameter
                                        (assoc :values_source_type nil)
                                        (dissoc :values_source_config))
                                    parameter))
                                parameters)]
        (when-not (= parameters new-parameters)
          (t2/update! model po-id {:parameters new-parameters}))))))

(defn model-supports-implicit-actions?
  "A model with implicit action supported iff they are a raw table,
  meaning there are no clauses such as filter, limit, breakout...

  The list of clauses should match with FE, which is defined in the
  method `hasAnyClauses` of `metabase-lib/queries/StructuredQuery` class"
  [{dataset-query :dataset_query :as _card}]
  (and (= :query (:type dataset-query))
       (every? #(nil? (get-in dataset-query [:query %]))
               [:expressions :filter :limit :breakout :aggregation :joins :order-by :fields])))

(defn- disable-implicit-action-for-model!
  "Delete all implicit actions of a model if exists."
  [model-id]
  (when-let [action-ids (t2/select-pks-set  'Action {:select [:action.id]
                                                     :from   [:action]
                                                     :join   [:implicit_action
                                                              [:= :action.id :implicit_action.action_id]]
                                                     :where  [:= :action.model_id model-id]})]
    (t2/delete! 'Action :id [:in action-ids])))

(defn- pre-update [{archived? :archived, id :id, :as changes}]
  ;; TODO - don't we need to be doing the same permissions check we do in `pre-insert` if the query gets changed? Or
  ;; does that happen in the `PUT` endpoint?
  (u/prog1 changes
    (let [;; Fetch old card data if necessary, and share the data between multiple checks.
          old-card-info (when (or (contains? changes :dataset)
                                  (:dataset_query changes)
                                  (get-in changes [:dataset_query :native]))
                          (t2/select-one [:model/Card :dataset_query :dataset] :id id))]
      ;; if the Card is archived, then remove it from any Dashboards
      (when archived?
        (t2/delete! 'DashboardCard :card_id id))
      ;; if the template tag params for this Card have changed in any way we need to update the FieldValues for
      ;; On-Demand DB Fields
      (when (get-in changes [:dataset_query :native])
        (let [old-param-field-ids (params/card->template-tag-field-ids old-card-info)
              new-param-field-ids (params/card->template-tag-field-ids changes)]
          (when (and (seq new-param-field-ids)
                     (not= old-param-field-ids new-param-field-ids))
            (let [newly-added-param-field-ids (set/difference new-param-field-ids old-param-field-ids)]
              (log/info "Referenced Fields in Card params have changed. Was:" old-param-field-ids
                        "Is Now:" new-param-field-ids
                        "Newly Added:" newly-added-param-field-ids)
              ;; Now update the FieldValues for the Fields referenced by this Card.
              (field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids)))))
      ;; make sure this Card doesn't have circular source query references if we're updating the query
      (when (:dataset_query changes)
        (check-for-circular-source-query-references changes))
      ;; updating a model dataset query to not support implicit actions will disable implicit actions if they exist
      (when (and (:dataset_query changes)
                 (:dataset old-card-info)
                 (not (model-supports-implicit-actions? changes)))
        (disable-implicit-action-for-model! id))
      ;; Archive associated actions
      (when (and (false? (:dataset changes))
                 (:dataset old-card-info))
        (t2/update! 'Action {:model_id id :type [:not= :implicit]} {:archived true})
        (t2/delete! 'Action :model_id id, :type :implicit))
      ;; Make sure any native query template tags match the DB in the query.
      (check-field-filter-fields-are-from-correct-database changes)
      ;; Make sure the Collection is in the default Collection namespace (e.g. as opposed to the Snippets Collection namespace)
      (collection/check-collection-namespace Card (:collection_id changes))
      (params/assert-valid-parameters changes)
      (params/assert-valid-parameter-mappings changes)
      (update-parameters-using-card-as-values-source changes)
      (parameter-card/upsert-or-delete-from-parameters! "card" id (:parameters changes))
      ;; additional checks (Enterprise Edition only)
      (pre-update-check-sandbox-constraints changes)
      (assert-valid-model (merge old-card-info changes)))))

(t2/define-after-select :model/Card
  [card]
  (public-settings/remove-public-uuid-if-public-sharing-is-disabled card))

(t2/define-before-insert :model/Card
  [card]
  (-> card
      maybe-normalize-query
      populate-result-metadata
      pre-insert
      populate-query-fields))

(t2/define-after-insert :model/Card
  [card]
  (u/prog1 card
    (when-let [field-ids (seq (params/card->template-tag-field-ids card))]
      (log/info "Card references Fields in params:" field-ids)
      (field-values/update-field-values-for-on-demand-dbs! field-ids))
    (parameter-card/upsert-or-delete-from-parameters! "card" (:id card) (:parameters card))))

(t2/define-before-update :model/Card
  [card]
  (-> (merge (t2/instance :model/Card {:id (:id card)})
             (t2/changes card))
      maybe-normalize-query
      populate-result-metadata
      pre-update
      populate-query-fields))

;; Cards don't normally get deleted (they get archived instead) so this mostly affects tests
(t2/define-before-delete :model/Card
  [{:keys [id] :as _card}]
  ;; delete any ParameterCard that the parameters on this card linked to
  (parameter-card/delete-all-for-parameterized-object! "card" id)
  ;; delete any ParameterCard linked to this card
  (t2/delete! ParameterCard :card_id id)
  (t2/delete! 'ModerationReview :moderated_item_type "card", :moderated_item_id id)
  (t2/delete! 'Revision :model "Card", :model_id id))

(defmethod serdes/hash-fields :model/Card
  [_card]
  [:name (serdes/hydrated-hash :collection) :created_at])


;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/extract-query "Card" [_ opts]
  (serdes/extract-query-collections Card opts))

(defn- export-result-metadata [card metadata]
  (when (and (:dataset card) metadata)
    (for [m metadata]
      (-> m
          (m/update-existing :table_id  serdes/*export-table-fk*)
          (m/update-existing :id        serdes/*export-field-fk*)
          (m/update-existing :field_ref serdes/export-mbql)))))

(defn- import-result-metadata [metadata]
  (when metadata
    (for [m metadata]
      (-> m
          (m/update-existing :table_id  serdes/*import-table-fk*)
          (m/update-existing :id        serdes/*import-field-fk*)
          (m/update-existing :field_ref serdes/import-mbql)))))

(defn- result-metadata-deps [metadata]
  (when (seq metadata)
    (reduce set/union (for [m (seq metadata)]
                        (reduce set/union (serdes/mbql-deps (:field_ref m))
                                [(when (:table_id m) #{(serdes/table->path (:table_id m))})
                                 (when (:id m)       #{(serdes/field->path (:id m))})])))))

(defmethod serdes/extract-one "Card"
  [_model-name _opts card]
  ;; Cards have :table_id, :database_id, :collection_id, :creator_id that need conversion.
  ;; :table_id and :database_id are extracted as just :table_id [database_name schema table_name].
  ;; :collection_id is extracted as its entity_id or identity-hash.
  ;; :creator_id as the user's email.
  (try
    (-> (serdes/extract-one-basics "Card" card)
        (update :database_id            serdes/*export-fk-keyed* 'Database :name)
        (update :table_id               serdes/*export-table-fk*)
        (update :collection_id          serdes/*export-fk* 'Collection)
        (update :creator_id             serdes/*export-user*)
        (update :made_public_by_id      serdes/*export-user*)
        (update :dataset_query          serdes/export-mbql)
        (update :parameters             serdes/export-parameters)
        (update :parameter_mappings     serdes/export-parameter-mappings)
        (update :visualization_settings serdes/export-visualization-settings)
        (update :result_metadata        (partial export-result-metadata card)))
    (catch Exception e
      (throw (ex-info "Failed to export Card" {:card card} e)))))

(defmethod serdes/load-xform "Card"
  [card]
  (-> card
      serdes/load-xform-basics
      (update :database_id            serdes/*import-fk-keyed* 'Database :name)
      (update :table_id               serdes/*import-table-fk*)
      (update :creator_id             serdes/*import-user*)
      (update :made_public_by_id      serdes/*import-user*)
      (update :collection_id          serdes/*import-fk* 'Collection)
      (update :dataset_query          serdes/import-mbql)
      (update :parameters             serdes/import-parameters)
      (update :parameter_mappings     serdes/import-parameter-mappings)
      (update :visualization_settings serdes/import-visualization-settings)
      (update :result_metadata        import-result-metadata)))

(defmethod serdes/dependencies "Card"
  [{:keys [collection_id database_id dataset_query parameters parameter_mappings
           result_metadata table_id visualization_settings]}]
  (->> (map serdes/mbql-deps parameter_mappings)
       (reduce set/union)
       (set/union (serdes/parameters-deps parameters))
       (set/union #{[{:model "Database" :id database_id}]})
       ; table_id and collection_id are nullable.
       (set/union (when table_id #{(serdes/table->path table_id)}))
       (set/union (when collection_id #{[{:model "Collection" :id collection_id}]}))
       (set/union (result-metadata-deps result_metadata))
       (set/union (serdes/mbql-deps dataset_query))
       (set/union (serdes/visualization-settings-deps visualization_settings))
       vec))

(defmethod serdes/descendants "Card" [_model-name id]
  (let [card               (t2/select-one Card :id id)
        source-table       (some->  card :dataset_query :query :source-table)
        template-tags      (some->> card :dataset_query :native :template-tags vals (keep :card-id))
        parameters-card-id (some->> card :parameters (keep (comp :card_id :values_source_config)))
        snippets           (some->> card :dataset_query :native :template-tags vals (keep :snippet-id))]
    (set/union
      (when (and (string? source-table)
                 (str/starts-with? source-table "card__"))
        #{["Card" (Integer/parseInt (.substring ^String source-table 6))]})
      (when (seq template-tags)
        (set (for [card-id template-tags]
               ["Card" card-id])))
      (when (seq parameters-card-id)
        (set (for [card-id parameters-card-id]
               ["Card" card-id])))
      (when (seq snippets)
        (set (for [snippet-id snippets]
               ["NativeQuerySnippet" snippet-id]))))))


;;; -------------------------------------------------- Audit Log -------------------------------------------------------

(defmethod audit-log/model-details Card
  [_model {query :dataset_query, dataset? :dataset :as card} _event-type]
  (let [query (when (seq query)
                (try (qp/preprocess query)
                     (catch Throwable e
                       (log/error e (tru "Error preprocessing query:")))))
        database-id (some-> query :database u/the-id)
        table-id    (mbql.u/query->source-table-id query)]
    (merge (select-keys card [:name :description])
           {:database_id database-id
            :table_id    table-id
            ;; Use `model` instead of `dataset` to mirror in-product terminology
            :model dataset?})))
