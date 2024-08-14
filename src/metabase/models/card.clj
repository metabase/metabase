(ns metabase.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require
   [clojure.core.async :as a]
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.analyze.query-results :as qr]
   [metabase.api.common :as api]
   [metabase.audit :as audit]
   [metabase.config :as config]
   [metabase.db.query :as mdb.query]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util :as lib.util]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.collection :as collection]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.models.parameter-card
    :as parameter-card
    :refer [ParameterCard]]
   [metabase.models.params :as params]
   [metabase.models.permissions :as perms]
   [metabase.models.pulse :as pulse]
   [metabase.models.query :as query]
   [metabase.models.query-field :as query-field]
   [metabase.models.query.permissions :as query-perms]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.moderation :as moderation]
   [metabase.native-query-analyzer :as query-analyzer]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.query-processor.async :as qp.async]
   [metabase.query-processor.util :as qp.util]
   [metabase.server.middleware.session :as mw.session]
   [metabase.shared.util.i18n :refer [trs]]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)))

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
   :parameter_mappings     mi/transform-parameters-list
   :type                   mi/transform-keyword})

(doto :model/Card
  (derive :metabase/model)
  ;; You can read/write a Card if you can read/write its parent Collection
  (derive ::perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-write? Card
  ([instance]
   ;; Cards in audit collection should not be writable.
   (if (and
        ;; We want to make sure there's an existing audit collection before doing the equality check below.
        ;; If there is no audit collection, this will be nil:
        (some? (:id (audit/default-audit-collection)))
        ;; Is a direct descendant of audit collection
        (= (:collection_id instance) (:id (audit/default-audit-collection))))
     false
     (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection instance :write))))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/Card :id pk))))

(defmethod mi/can-read? Card
  ([instance]
   (perms/can-read-audit-helper :model/Card instance))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Card :id pk))))

(def card-types
  "All acceptable card types.

  Previously (< 49), we only had 2 card types: question and model, which were differentiated using the boolean
  `dataset` column. Soon we'll have more card types (e.g: metric) and we will longer be able to use a boolean column
  to differentiate between all types. So we've added a new `type` column for this purpose.

  Migrating all the code to use `report_card.type` will be quite an effort, we decided that we'll migrate it
  gradually."
  #{:model :question :metric})

(mr/def ::type
  (into [:enum] card-types))

(defn model?
  "Returns true if `card` is a model."
  [card]
  (= (keyword (:type card)) :model))

;;; -------------------------------------------------- Hydration --------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Card :dashboard_count]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(->> (t2/query {:select    [[:%count.* :count] :card_id]
                    :from      [:report_dashboardcard]
                    :where     [:in :card_id (map :id cards)]
                    :group-by  [:card_id]})
         (map (juxt :card_id :count))
         (into {}))
   :id
   {:default 0}))

(defn- source-card-id
  [query]
  (let [query-type (lib/normalized-query-type query)]
    (case query-type
      :query      (-> query mbql.normalize/normalize qp.util/query->source-card-id)
      :mbql/query (-> query lib/normalize lib.util/source-card-id)
      nil)))

(defn- card->integer-table-ids
  "Return integer source table ids for card's :dataset_query."
  [card]
  (when-some [query (-> card :dataset_query :query)]
    (not-empty (filter pos-int? (lib.util/collect-source-tables query)))))

(defn- prefetch-tables-for-cards!
  "Collect tables from `dataset-cards` and prefetch metadata. Should be used only with metdata provider caching
  enabled, as per https://github.com/metabase/metabase/pull/45050. Returns `nil`."
  [dataset-cards]
  (let [db-id->table-ids (-> (group-by :database_id dataset-cards)
                             (update-vals (partial into #{} (comp (mapcat card->integer-table-ids)
                                                                  (remove nil?)))))]
    (doseq [[db-id table-ids] db-id->table-ids
            :let  [mp (lib.metadata.jvm/application-database-metadata-provider db-id)]
            :when (seq table-ids)]
      (lib.metadata.protocols/metadatas mp :metadata/table table-ids))))

(defn with-can-run-adhoc-query
  "Adds can_run_adhoc_query to each card."
  [cards]
  (let [dataset-cards (filter (comp seq :dataset_query) cards)
        source-card-ids (into #{}
                              (keep (comp source-card-id :dataset_query))
                              dataset-cards)]
    ;; Prefetching code should not propagate any exceptions.
    (when lib.metadata.jvm/*metadata-provider-cache*
      (try
        (prefetch-tables-for-cards! dataset-cards)
        (catch Throwable t
          (log/errorf t "Failed prefething cards `%s`." (pr-str (map :id dataset-cards))))))
    (binding [query-perms/*card-instances*
              (when (seq source-card-ids)
                (t2/select-fn->fn :id identity [Card :id :collection_id] :id [:in source-card-ids]))]
      (mi/instances-with-hydrated-data
       cards :can_run_adhoc_query
       (fn []
         (into {}
               (map
                (fn [{card-id :id :keys [dataset_query]}]
                  [card-id (query-perms/can-run-query? dataset_query)]))
               dataset-cards))
       :id
       {:default false}))))

(mi/define-batched-hydration-method add-can-run-adhoc-query
  :can_run_adhoc_query
  "Hydrate can_run_adhoc_query onto cards"
  [cards]
  (with-can-run-adhoc-query cards))

(methodical/defmethod t2/batched-hydrate [:model/Card :parameter_usage_count]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(->> (t2/query {:select    [[:%count.* :count] :card_id]
                    :from      [:parameter_card]
                    :where     [:in :card_id (map :id cards)]
                    :group-by  [:card_id]})
         (map (juxt :card_id :count))
         (into {}))
   :id
   {:default 0}))

(methodical/defmethod t2/batched-hydrate [:model/Card :average_query_time]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(->> (t2/query {:select [[:%avg.running_time :running_time] :card_id]
                    :from   [:query_execution]
                    :where  [:and
                             [:not= :running_time nil]
                             [:not= :cache_hit true]
                             [:in :card_id (map :id cards)]]
                    :group-by [:card_id]})
         (map (juxt :card_id :running_time))
         (into {}))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/Card :last_query_start]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(->> (t2/query {:select [[:%max.started_at :started_at] :card_id]
                    :from   [:query_execution]
                    :where  [:and
                             [:not= :running_time nil]
                             [:not= :cache_hit true]
                             [:in :card_id (map :id cards)]]
                    :group-by [:card_id]})
         (map (juxt :card_id :started_at))
         (into {}))
   :id))

;; There's more hydration in the shared metabase.moderation namespace, but it needs to be required:
(comment moderation/keep-me)

;;; --------------------------------------------------- Revisions ----------------------------------------------------

(def ^:private excluded-columns-for-card-revision
  [:id :created_at :updated_at :last_used_at :entity_id :creator_id :public_uuid :made_public_by_id :metabase_version
   :initially_published_at :cache_invalidated_at :view_count])

(defmethod revision/revert-to-revision! :model/Card
  [model id user-id serialized-card]
  ;; make sure we handle < 50 cards that had `:dataset` instead of `:type`
  (let [serialized-card (cond-> serialized-card
                          (contains? serialized-card :dataset) (-> (dissoc :dataset)
                                                                   (assoc :type (if (:dataset serialized-card) :model :question))))]
    ((get-method revision/revert-to-revision! :default) model id user-id serialized-card)))

(defmethod revision/serialize-instance :model/Card
  ([instance]
   (revision/serialize-instance Card nil instance))
  ([_model _id instance]
   (cond-> (apply dissoc instance excluded-columns-for-card-revision)
     ;; datasets should preserve edits to metadata
     ;; the type check only needed in tests because most test object does not include `type` key
     (and (some? (:type instance)) (not (model? instance)))
     (dissoc :result_metadata))))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn populate-query-fields
  "Lift `database_id`, `table_id`, and `query_type` from query definition when inserting/updating a Card."
  [{query :dataset_query, :as card}]
  (merge
   card
   ;; mega HACK FIXME -- don't update this stuff when doing deserialization because it might differ from what's in the
   ;; YAML file and break tests like [[metabase-enterprise.serialization.v2.e2e.yaml-test/e2e-storage-ingestion-test]].
   ;; The root cause of this issue is that we're generating Cards that have a different Database ID or Table ID from
   ;; what's actually in their query -- we need to fix [[metabase.test.generate]], but I'm not sure how to do that
   (when (and (map? query)
              (not mi/*deserializing?*))
     (when-let [{:keys [database-id table-id]} (query/query->database-and-table-ids query)]
       ;; TODO -- not sure `query_type` is actually used for anything important anyway
       (let [query-type (if (query/query-is-native? query)
                          :native
                          :query)]
         (merge
          {:query_type (keyword query-type)}
          (when database-id
            {:database_id database-id})
          (when table-id
            {:table_id table-id})))))))

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
                                           (u/ignore-exceptions
                                             ((requiring-resolve 'metabase.query-processor.preprocess/query->expected-cols) query))))]
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
    (seq (:dataset_query card)) (update :dataset_query #(mi/maybe-normalize-query :in %))))

;; TODO: move this to [[metabase.query-processor.card]] or MLv2 so the logic can be shared between the backend and frontend
;; NOTE: this should mirror `getTemplateTagParameters` in frontend/src/metabase-lib/parameters/utils/template-tags.ts
;; If this function moves you should update the comment that links to this one (#40013)
(defn template-tag-parameters
  "Transforms native query's `template-tags` into `parameters`.
  An older style was to not include `:template-tags` onto cards as parameters. I think this is a mistake and they
  should always be there. Apparently lots of e2e tests are sloppy about this so this is included as a convenience."
  [card]
  (for [[_ {tag-type :type, widget-type :widget-type, :as tag}] (get-in card [:dataset_query :native :template-tags])
        :when                         (and tag-type
                                           (or (contains? lib.schema.template-tag/raw-value-template-tag-types tag-type)
                                               (and (= tag-type :dimension) widget-type (not= widget-type :none))))]
    {:id       (:id tag)
     :type     (or widget-type (cond (= tag-type :date)   :date/single
                                     (= tag-type :string) :string/=
                                     (= tag-type :number) :number/=
                                     :else                :category))
     :target   (if (= tag-type :dimension)
                 [:dimension [:template-tag (:name tag)]]
                 [:variable  [:template-tag (:name tag)]])
     :name     (:display-name tag)
     :slug     (:name tag)
     :default  (:default tag)
     :required (boolean (:required tag))}))

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

(defn- assert-valid-type
  "Check that the card is a valid model if being saved as one. Throw an exception if not."
  [{query :dataset_query, card-type :type, :as _card}]
  (when (= (keyword card-type) :model)
    (let [template-tag-types (->> (get-in query [:native :template-tags])
                                  vals
                                  (map (comp keyword :type)))]
      (when (some (complement #{:card :snippet}) template-tag-types)
        (throw (ex-info (tru "A model made from a native SQL question cannot have a variable or field filter.")
                        {:status-code 400})))))
  nil)

;; TODO -- consider whether we should validate the Card query when you save/update it?? (#40013)
(defn- pre-insert [card]
  (let [defaults {:parameters         []
                  :parameter_mappings []}
        card     (merge defaults card)]
    (u/prog1 card
      ;; make sure this Card doesn't have circular source query references
      (check-for-circular-source-query-references card)
      (check-field-filter-fields-are-from-correct-database card)
      ;; TODO: add a check to see if all id in :parameter_mappings are in :parameters (#40013)
      (assert-valid-type card)
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
  (when (some #{:archived :result_metadata} (keys changes))
    (let [parameter-cards (t2/select ParameterCard :card_id id)]
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
                                                       ;; if cant find the value-field in result_metadata, then we should
                                                       ;; remove it
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
            (t2/update! model po-id {:parameters new-parameters})))))))

(defn model-supports-implicit-actions?
  "A model with implicit action supported iff they are a raw table,
  meaning there are no clauses such as filter, limit, breakout...

  It should be the opposite of [[metabase.lib.stage/has-clauses]] but for all stages."
  [{dataset-query :dataset_query :as _card}]
  (and (= :query (:type dataset-query))
       (every? #(nil? (get-in dataset-query [:query %]))
               [:expressions :filter :limit :breakout :aggregation :joins :order-by :fields])))

(defn- disable-implicit-action-for-model!
  "Delete all implicit actions of a model if exists."
  [model-id]
  (when-let [action-ids (t2/select-pks-set :model/Action {:select [:action.id]
                                                          :from   [:action]
                                                          :join   [:implicit_action
                                                                   [:= :action.id :implicit_action.action_id]]
                                                          :where  [:= :action.model_id model-id]})]
    (t2/delete! :model/Action :id [:in action-ids])))

(defn- pre-update [{archived? :archived, id :id, :as changes}]
  ;; TODO - don't we need to be doing the same permissions check we do in `pre-insert` if the query gets changed? Or
  ;; does that happen in the `PUT` endpoint? (#40013)
  (u/prog1 changes
    (let [;; Fetch old card data if necessary, and share the data between multiple checks.
          old-card-info (when (or (contains? changes :type)
                                  (:dataset_query changes)
                                  (get-in changes [:dataset_query :native]))
                          (t2/select-one [:model/Card :dataset_query :type] :id (u/the-id id)))]
      ;; if the Card is archived, then remove it from any Dashboards
      (when archived?
        (t2/delete! :model/DashboardCard :card_id id))
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
                 (= (:type old-card-info) :model)
                 (not (model-supports-implicit-actions? changes)))
        (disable-implicit-action-for-model! id))
      ;; Changing from a Question to a Model: archive associated actions
      (when (and (= (:type changes) :question)
                 (= (:type old-card-info) :model))
        (t2/update! :model/Action {:model_id id :type [:not= :implicit]} {:archived true})
        (t2/delete! :model/Action :model_id id, :type :implicit))
      ;; Make sure any native query template tags match the DB in the query.
      (check-field-filter-fields-are-from-correct-database changes)
      ;; Make sure the Collection is in the default Collection namespace (e.g. as opposed to the Snippets Collection
      ;; namespace)
      (collection/check-collection-namespace Card (:collection_id changes))
      (params/assert-valid-parameters changes)
      (params/assert-valid-parameter-mappings changes)
      (update-parameters-using-card-as-values-source changes)
      ;; TODO: should be done in after-update
      ;; has to place it here because changes is not available in after-update hook see toucan2#129
      (when (contains? changes :dataset_query)
       (query-field/update-query-fields-for-card! changes))
      (when (:parameters changes)
        (parameter-card/upsert-or-delete-from-parameters! "card" id (:parameters changes)))
      ;; additional checks (Enterprise Edition only)
      (pre-update-check-sandbox-constraints changes)
      (assert-valid-type (merge old-card-info changes)))))


(t2/define-after-select :model/Card
  [card]
  (public-settings/remove-public-uuid-if-public-sharing-is-disabled card))

(t2/define-before-insert :model/Card
  [card]
  (-> card
      (assoc :metabase_version config/mb-version-string)
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
    (parameter-card/upsert-or-delete-from-parameters! "card" (:id card) (:parameters card))
    (query-field/update-query-fields-for-card! card)))

(t2/define-before-update :model/Card
  [{:keys [verified-result-metadata?] :as card}]
  ;; remove all the unchanged keys from the map, except for `:id`, so the functions below can do the right thing since
  ;; they were written pre-Toucan 2 and don't know about [[t2/changes]]...
  ;;
  ;; We have to convert this to a plain map rather than a Toucan 2 instance at this point to work around upstream bug
  ;; https://github.com/camsaul/toucan2/issues/145 .
  ;; TODO: ^ that's been fixed, this could be refactored
  (-> (into {:id (:id card)} (t2/changes (dissoc card :verified-result-metadata?)))
      maybe-normalize-query
      ;; If we have fresh result_metadata, we don't have to populate it anew. When result_metadata doesn't
      ;; change for a native query, populate-result-metadata removes it (set to nil) unless prevented by the
      ;; verified-result-metadata? flag (see #37009).
      (cond-> #_changes
        (or (empty? (:result_metadata card))
            (not verified-result-metadata?))
        populate-result-metadata)
      pre-update
      populate-query-fields
      maybe-populate-initially-published-at
      (dissoc :id)))

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

(defmethod mi/exclude-internal-content-hsql :model/Card
  [_model & {:keys [table-alias]}]
  [:not= (h2x/identifier :field table-alias :creator_id) config/internal-mb-user-id])

;;; ----------------------------------------------- Creating Cards ----------------------------------------------------

(mu/defn result-metadata-async :- (ms/InstanceOfClass ManyToManyChannel)
  "Return a channel of metadata for the passed in `query`. Takes the `original-query` so it can determine if existing
  `metadata` might still be valid. Takes `dataset?` since existing metadata might need to be \"blended\" into the
  fresh metadata to preserve metadata edits from the dataset.

  Note this condition is possible for new cards and edits to cards. New cards can be created from existing cards by
  copying, and they could be datasets, have edited metadata that needs to be blended into a fresh run.

  This is also complicated because everything is optional, so we cannot assume the client will provide metadata and
  might need to save a metadata edit, or might need to use db-saved metadata on a modified dataset."
  [{:keys [original-query query metadata original-metadata dataset?]}]
  (let [valid-metadata? (and metadata (mc/validate qr/ResultsMetadata metadata))]
    (cond
      (or
       ;; query didn't change, preserve existing metadata
       (and (= (mbql.normalize/normalize original-query)
               (mbql.normalize/normalize query))
            valid-metadata?)
       ;; only sent valid metadata in the edit. Metadata might be the same, might be different. We save in either case
       (and (nil? query)
            valid-metadata?)

       ;; copying card and reusing existing metadata
       (and (nil? original-query)
            query
            valid-metadata?))
      (do
        (log/debug (trs "Reusing provided metadata"))
        (a/to-chan! [metadata]))

      ;; frontend always sends query. But sometimes programatic don't (cypress, API usage). Returning an empty channel
      ;; means the metadata won't be updated at all.
      (nil? query)
      (do
        (log/debug (trs "No query provided so not querying for metadata"))
        (doto (a/chan) a/close!))

      ;; datasets need to incorporate the metadata either passed in or already in the db. Query has changed so we
      ;; re-run and blend the saved into the new metadata
      (and dataset? (or valid-metadata? (seq original-metadata)))
      (do
        (log/debug (trs "Querying for metadata and blending model metadata"))
        (a/go (let [metadata' (if valid-metadata?
                                (map mbql.normalize/normalize-source-metadata metadata)
                                original-metadata)
                    fresh     (a/<! (qp.async/result-metadata-for-query-async query))]
                (qp.util/combine-metadata fresh metadata'))))
      :else
      ;; compute fresh
      (do
        (log/debug (trs "Querying for metadata"))
        (qp.async/result-metadata-for-query-async query)))))

(def metadata-sync-wait-ms
  "Duration in milliseconds to wait for the metadata before saving the card without the metadata. That metadata will be
saved later when it is ready."
  1500)

(def metadata-async-timeout-ms
  "Duration in milliseconds to wait for the metadata before abandoning the asynchronous metadata saving. Default is 15
  minutes."
  (u/minutes->ms 15))

(defn schedule-metadata-saving
  "Save metadata when (and if) it is ready. Takes a chan that will eventually return metadata. Waits up
  to [[metadata-async-timeout-ms]] for the metadata, and then saves it if the query of the card has not changed."
  [result-metadata-chan card]
  (a/go
    (let [timeoutc        (a/timeout metadata-async-timeout-ms)
          [metadata port] (a/alts! [result-metadata-chan timeoutc])
          id              (:id card)]
      (cond (= port timeoutc)
            (do (a/close! result-metadata-chan)
                (log/infof "Metadata not ready in %s minutes, abandoning" (long (/ metadata-async-timeout-ms 1000 60))))

            (not (seq metadata))
            (log/infof "Not updating metadata asynchronously for card %s because no metadata" id)
            :else
            (future
              (let [current-query (t2/select-one-fn :dataset_query Card :id id)]
                (if (= (:dataset_query card) current-query)
                  (do (t2/update! Card id {:result_metadata metadata})
                      (log/infof "Metadata updated asynchronously for card %s" id))
                  (log/infof "Not updating metadata asynchronously for card %s because query has changed" id))))))))

(defn create-card!
  "Create a new Card. Metadata will be fetched off thread. If the metadata takes longer than [[metadata-sync-wait-ms]]
  the card will be saved without metadata and it will be saved to the card in the future when it is ready.

  Dispatches the `:card-create` event unless `delay-event?` is true. Useful for when many cards are created in a
  transaction and work in the `:card-create` event cannot proceed because the cards would not be visible outside of
  the transaction yet. If you pass true here it is important to call the event after the cards are successfully
  created."
  ([card creator] (create-card! card creator false))
  ([{:keys [dataset_query result_metadata parameters parameter_mappings type] :as card-data} creator delay-event?]
   (let [data-keys            [:dataset_query :description :display :name :visualization_settings
                               :parameters :parameter_mappings :collection_id :collection_position :cache_ttl :type]
         ;; `zipmap` instead of `select-keys` because we want to get `nil` values for keys that aren't present. Required
         ;; by `api/maybe-reconcile-collection-position!`
         card-data            (-> (zipmap data-keys (map card-data data-keys))
                                  (assoc
                                   :creator_id (:id creator)
                                   :parameters (or parameters [])
                                   :parameter_mappings (or parameter_mappings []))
                                  (cond-> (nil? type)
                                    (assoc :type :question)))
         result-metadata-chan (result-metadata-async {:query    dataset_query
                                                      :metadata result_metadata
                                                      :dataset? (model? card-data)})
         metadata-timeout     (a/timeout metadata-sync-wait-ms)
         [metadata port]      (a/alts!! [result-metadata-chan metadata-timeout])
         timed-out?           (= port metadata-timeout)
         card                 (t2/with-transaction [_conn]
                                ;; Adding a new card at `collection_position` could cause other cards in this
                                ;; collection to change position, check that and fix it if needed
                                (api/maybe-reconcile-collection-position! card-data)
                                (t2/insert-returning-instance! Card (cond-> card-data
                                                                      (and metadata (not timed-out?))
                                                                      (assoc :result_metadata metadata))))]
     (when-not delay-event?
       (events/publish-event! :event/card-create {:object card :user-id (:id creator)}))
     (when timed-out?
       (log/info "Metadata not available soon enough. Saving new card and asynchronously updating metadata"))
     ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has with
     ;; returned one -- See #4283
     (u/prog1 card
       (when timed-out?
         (schedule-metadata-saving result-metadata-chan <>))))))

;;; ------------------------------------------------- Updating Cards -------------------------------------------------

(defn- card-archived? [old-card new-card]
  (and (not (:archived old-card))
       (:archived new-card)))

(defn- line-area-bar? [display]
  (contains? #{:line :area :bar} display))

(defn- progress? [display]
  (= :progress display))

(defn- allows-rows-alert? [display]
  (not (contains? #{:line :bar :area :progress} display)))

(defn- display-change-broke-alert?
  "Alerts no longer make sense when the kind of question being alerted on significantly changes. Setting up an alert
  when a time series query reaches 10 is no longer valid if the question switches from a line graph to a table. This
  function goes through various scenarios that render an alert no longer valid"
  [{old-display :display} {new-display :display}]
  (when-not (= old-display new-display)
    (or
     ;; Did the alert switch from a table type to a line/bar/area/progress graph type?
     (and (allows-rows-alert? old-display)
          (or (line-area-bar? new-display)
              (progress? new-display)))
     ;; Switching from a line/bar/area to another type that is not those three invalidates the alert
     (and (line-area-bar? old-display)
          (not (line-area-bar? new-display)))
     ;; Switching from a progress graph to anything else invalidates the alert
     (and (progress? old-display)
          (not (progress? new-display))))))

(defn- goal-missing?
  "If we had a goal before, and now it's gone, the alert is no longer valid"
  [old-card new-card]
  (and
   (get-in old-card [:visualization_settings :graph.goal_value])
   (not (get-in new-card [:visualization_settings :graph.goal_value]))))

(defn- multiple-breakouts?
  "If there are multiple breakouts and a goal, we don't know which breakout to compare to the goal, so it invalidates
  the alert"
  [{:keys [display] :as new-card}]
  (and (get-in new-card [:visualization_settings :graph.goal_value])
       (or (line-area-bar? display)
           (progress? display))
       (< 1 (count (get-in new-card [:dataset_query :query :breakout])))))

(defn- delete-alert-and-notify!
  "Removes all of the alerts and notifies all of the email recipients of the alerts change via `NOTIFY-FN!`"
  [& {:keys [notify-fn! alerts actor]}]
  (t2/delete! :model/Pulse :id [:in (map :id alerts)])
  (doseq [{:keys [channels] :as alert} alerts
          :let [email-channel (m/find-first #(= :email (:channel_type %)) channels)]]
    (doseq [recipient (:recipients email-channel)]
      (notify-fn! alert recipient actor))))

(defn delete-alert-and-notify-archived!
  "Removes all alerts and will email each recipient letting them know"
  [& {:keys [alerts actor]}]
  (delete-alert-and-notify! {:notify-fn! messages/send-alert-stopped-because-archived-email!
                             :alerts     alerts
                             :actor      actor}))

(defn- delete-alert-and-notify-changed! [& {:keys [alerts actor]}]
  (delete-alert-and-notify! {:notify-fn! messages/send-alert-stopped-because-changed-email!
                             :alerts     alerts
                             :actor      actor}))

(defn- delete-alerts-if-needed! [& {:keys [old-card new-card actor]}]
  ;; If there are alerts, we need to check to ensure the card change doesn't invalidate the alert
  (when-let [alerts (binding [pulse/*allow-hydrate-archived-cards* true]
                      (seq (pulse/retrieve-alerts-for-cards {:card-ids [(:id new-card)]})))]
    (cond

      (card-archived? old-card new-card)
      (delete-alert-and-notify-archived! :alerts alerts, :actor actor)

      (or (display-change-broke-alert? old-card new-card)
          (goal-missing? old-card new-card)
          (multiple-breakouts? new-card))
      (delete-alert-and-notify-changed! :alerts alerts, :actor actor)

      ;; The change doesn't invalidate the alert, do nothing
      :else
      nil)))

(defn- card-is-verified?
  "Return true if card is verified, false otherwise. Assumes that moderation reviews are ordered so that the most recent
  is the first. This is the case from the hydration function for moderation_reviews."
  [card]
  (-> card :moderation_reviews first :status #{"verified"} boolean))

(defn- changed?
  "Return whether there were any changes in the objects at the keys for `consider`.

  returns false because changes to collection_id are ignored:
  (changed? #{:description}
            {:collection_id 1 :description \"foo\"}
            {:collection_id 2 :description \"foo\"})

  returns true:
  (changed? #{:description}
            {:collection_id 1 :description \"foo\"}
            {:collection_id 2 :description \"diff\"})"
  [consider card-before updates]
  ;; have to ignore keyword vs strings over api. `{:type :query}` vs `{:type "query"}`
  (let [prepare              (fn prepare [card] (walk/prewalk (fn [x] (if (keyword? x)
                                                                        (name x)
                                                                        x))
                                                              card))
        before               (prepare (select-keys card-before consider))
        after                (prepare (select-keys updates consider))
        [_ changes-in-after] (data/diff before after)]
    (boolean (seq changes-in-after))))

(def ^:private card-compare-keys
  "When comparing a card to possibly unverify, only consider these keys as changing something 'important' about the
  query."
  #{:table_id
    :database_id
    :query_type ;; these first three may not even be changeable
    :dataset_query})

(defn update-card!
  "Update a Card. Metadata is fetched asynchronously. If it is ready before [[metadata-sync-wait-ms]] elapses it will be
  included, otherwise the metadata will be saved to the database asynchronously."
  [{:keys [card-before-update card-updates actor]}]
  ;; don't block our precious core.async thread, run the actual DB updates on a separate thread
  (t2/with-transaction [_conn]
    (api/maybe-reconcile-collection-position! card-before-update card-updates)

    (when (and (card-is-verified? card-before-update)
               (changed? card-compare-keys card-before-update card-updates))
      ;; this is an enterprise feature but we don't care if enterprise is enabled here. If there is a review we need
      ;; to remove it regardless if enterprise edition is present at the moment.
      (moderation-review/create-review! {:moderated_item_id   (:id card-before-update)
                                         :moderated_item_type "card"
                                         :moderator_id        (:id actor)
                                         :status              nil
                                         :text                (tru "Unverified due to edit")}))
    ;; ok, now save the Card
    (t2/update! Card (:id card-before-update)
                ;; `collection_id` and `description` can be `nil` (in order to unset them).
                ;; Other values should only be modified if they're passed in as non-nil
                (u/select-keys-when card-updates
                                    :present #{:collection_id :collection_position :description :cache_ttl}
                                    :non-nil #{:dataset_query :display :name :visualization_settings :archived
                                               :enable_embedding :type :parameters :parameter_mappings :embedding_params
                                               :result_metadata :collection_preview :verified-result-metadata?})))
  ;; Fetch the updated Card from the DB
  (let [card (t2/select-one Card :id (:id card-before-update))]
    (delete-alerts-if-needed! :old-card card-before-update, :new-card card, :actor actor)
    ;; skip publishing the event if it's just a change in its collection position
    (when-not (= #{:collection_position}
                 (set (keys card-updates)))
      (events/publish-event! :event/card-update {:object card :user-id api/*current-user-id*}))
    card))

(methodical/defmethod mi/to-json :model/Card
  [card json-generator]
  ;; we're doing update + dissoc instead of [[medley.core/dissoc-in]] because we don't want it to remove the
  ;; `:dataset_query` key entirely if it is empty, as it is in a lot of tests.
  (let [card (cond-> card
               (map? (:dataset_query card)) (update :dataset_query dissoc :lib/metadata))]
    (next-method card json-generator)))

(defn- replaced-inner-query-for-native-card
  [query {:keys [fields tables] :as _replacement-ids}]
  (let [keyvals-set         #(set/union (set (keys %))
                                        (set (vals %)))
        id->field           (if (empty? fields)
                              {}
                              (m/index-by :id
                                          (t2/query {:select [[:f.id :id]
                                                              [:f.name :column]
                                                              [:t.name :table]
                                                              [:t.schema :schema]]
                                                     :from   [[:metabase_field :f]]
                                                     :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                                                     :where  [:in :f.id (keyvals-set fields)]})))
        id->table           (if (empty? tables)
                              {}
                              (m/index-by :id
                                          (t2/query {:select [[:t.id :id]
                                                              [:t.name :table]
                                                              [:t.schema :schema]]
                                                     :from   [[:metabase_table :t]]
                                                     :where  [:in :t.id (keyvals-set tables)]})))
        remove-id           #(select-keys % [:column :table :schema])
        get-or-throw-from   (fn [m] (fn [k] (if (contains? m k)
                                              (remove-id (get m k))
                                              (throw (ex-info "ID not found" {:id k :available m})))))
        ids->replacements   (fn [id->replacement-id id->row row->identifier]
                              (-> id->replacement-id
                                  (u/update-keys-vals (get-or-throw-from id->row))
                                  (update-vals row->identifier)))
        ;; Note: we are naively providing unqualified new identifier names as the replacements.
        ;; this will break if previously unambiguous identifiers become ambiguous due to the replacements
        column-replacements (ids->replacements fields id->field :column)
        table-replacements  (ids->replacements tables id->table :table)]
    (query-analyzer/replace-names query {:columns column-replacements
                                         :tables  table-replacements})))


(defn replace-fields-and-tables!
  "Given a card and a map of the form

  {:fields {1 2, 3 4}
   :tables {100 101}}

  Update the card so that its references to the Field with ID 1 is replaced by Field 2, etc."
  [{q :dataset_query :as card} replacements]
  (if (= :native (:type q))
    (let [new-query (assoc-in q [:native :query]
                              (replaced-inner-query-for-native-card q replacements))]
      (update-card! {:card-before-update card
                     :card-updates       {:dataset_query new-query}
                     :actor              api/*current-user*}))
    (throw (ex-info "We don't (yet) support replacing field and table refs in cards with MBQL queries"
                    {:card card :replacements replacements}))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/extract-query "Card" [_ opts]
  (serdes/extract-query-collections Card opts))

(defn- export-result-metadata [metadata]
  (when metadata
    (for [m metadata]
      (-> (dissoc m :fingerprint)
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
    (reduce set/union #{} (for [m (seq metadata)]
                            (reduce set/union (serdes/mbql-deps (:field_ref m))
                                    [(when (:table_id m) #{(serdes/table->path (:table_id m))})
                                     (when (:id m)       #{(serdes/field->path (:id m))})])))))

(defmethod serdes/make-spec "Card"
  [_model-name _opts]
  {:copy [:archived :archived_directly :collection_position :collection_preview :created_at :description :display
          :embedding_params :enable_embedding :entity_id :metabase_version :public_uuid :query_type :type :name]
   :skip [;; cache invalidation is instance-specific
          :cache_invalidated_at
          ;; those are instance-specific analytic columns
          :view_count :last_used_at :initially_published_at
          ;; this column is not used anymore
          :cache_ttl]
   :transform
   {:database_id            (serdes/fk :model/Database :name)
    :table_id               (serdes/fk :model/Table)
    :source_card_id         (serdes/fk :model/Card)
    :collection_id          (serdes/fk :model/Collection)
    :creator_id             (serdes/fk :model/User)
    :made_public_by_id      (serdes/fk :model/User)
    :dataset_query          {:export serdes/export-mbql :import serdes/import-mbql}
    :parameters             {:export serdes/export-parameters :import serdes/import-parameters}
    :parameter_mappings     {:export serdes/export-parameter-mappings :import serdes/import-parameter-mappings}
    :visualization_settings {:export serdes/export-visualization-settings :import serdes/import-visualization-settings}
    :result_metadata        {:export export-result-metadata :import import-result-metadata}}})

(defmethod serdes/dependencies "Card"
  [{:keys [collection_id database_id dataset_query parameters parameter_mappings
           result_metadata table_id visualization_settings]}]
  (set
   (concat
    (mapcat serdes/mbql-deps parameter_mappings)
    (serdes/parameters-deps parameters)
    [[{:model "Database" :id database_id}]]
    (when table_id #{(serdes/table->path table_id)})
    (when collection_id #{[{:model "Collection" :id collection_id}]})
    (result-metadata-deps result_metadata)
    (serdes/mbql-deps dataset_query)
    (serdes/visualization-settings-deps visualization_settings))))

(defmethod serdes/descendants "Card" [_model-name id]
  (let [card               (t2/select-one Card :id id)
        source-table       (some->  card :dataset_query :query :source-table)
        template-tags      (some->> card :dataset_query :native :template-tags vals (keep :card-id))
        parameters-card-id (some->> card :parameters (keep (comp :card_id :values_source_config)))
        snippets           (some->> card :dataset_query :native :template-tags vals (keep :snippet-id))]
    (set
     (concat
      (when (and (string? source-table)
                 (str/starts-with? source-table "card__"))
        [["Card" (parse-long (subs source-table 6))]])
      (for [card-id template-tags]
        ["Card" card-id])
      (for [card-id parameters-card-id]
        ["Card" card-id])
      (for [snippet-id snippets]
        ["NativeQuerySnippet" snippet-id])))))


;;; ------------------------------------------------ Audit Log --------------------------------------------------------

(defmethod audit-log/model-details :model/Card
  [{card-type :type, :as card} _event-type]
  (merge (select-keys card [:name :description :database_id :table_id])
          ;; Use `model` instead of `dataset` to mirror product terminology
         {:model? (= (keyword card-type) :model)}))
