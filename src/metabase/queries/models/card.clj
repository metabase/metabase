(ns metabase.queries.models.card
  "Underlying DB model for what is now most commonly referred to as a 'Question' in most user-facing situations. Card
  is a historical name, but is the same thing; both terms are used interchangeably in the backend codebase."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.cache.core :as cache]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.content-verification.core :as moderation]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.events.core :as events]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util :as lib.util]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.parameters.params :as params]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.public-sharing.core :as public-sharing]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.pulse.core :as pulse]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.queries.models.query :as query]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.util :as qp.util]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Card [_model] :report_card)

(methodical/defmethod t2.hydrate/model-for-automagic-hydration [#_model :default #_k :card]
  [_original-model _k]
  :model/Card)

(def ^:private current-schema-version
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
  and including [[current-schema-version]]."
  22)

(defmulti ^:private upgrade-card-schema-to
  "Upgrades a card on read, so that it fits the given schema version number.

  The number is the **target** revision - if we read a row with `:card_schema` 22 and the [[current-schema-version]]
  is 25, then the `after-select` logic will effectively call

      (-> card
          (upgrade-card-schema-to 23)
          (upgrade-card-schema-to 24)
          (upgrade-card-schema-to 25))
  "
  {:arglists '([card target-schema-version])}
  (fn [_card target-schema-version]
    target-schema-version))

(t2/deftransforms :model/Card
  {:dataset_query          mi/transform-metabase-query
   :display                mi/transform-keyword
   :embedding_params       mi/transform-json
   :query_type             mi/transform-keyword
   :result_metadata        mi/transform-result-metadata
   :visualization_settings mi/transform-visualization-settings
   :parameters             mi/transform-card-parameters-list
   :parameter_mappings     mi/transform-parameters-list
   :type                   mi/transform-keyword})

(doto :model/Card
  (derive :metabase/model)
  ;; You can read/write a Card if you can read/write its parent Collection
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-write? :model/Card
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

(defmethod mi/can-read? :model/Card
  ([instance]
   (perms/can-read-audit-helper :model/Card instance))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Card :id pk))))

(defn model?
  "Returns true if `card` is a model."
  [card]
  (= (keyword (:type card)) :model))

(defn lib-query
  "Given a card with at least its `:dataset_query` field, this returns the `metabase.lib` form of the query.

  A `metadata-provider` may be passed as an optional first parameter, if the caller has one to hand."
  ([{:keys [database_id dataset_query] :as card}]
   (when dataset_query
     (let [db-id (or database_id (:database dataset_query))
           mp    (lib.metadata.jvm/application-database-metadata-provider db-id)]
       (lib-query mp card))))
  ([metadata-providerable {:keys [dataset_query] :as _card}]
   (when dataset_query
     (lib/query metadata-providerable dataset_query))))

;;; -------------------------------------------------- Hydration --------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Card :dashboard_count]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   (fn []
     (->> (t2/query {:select    [[:%count.* :count] :card_id]
                     :from      [:report_dashboardcard]
                     :where     [:in :card_id (map :id cards)]
                     :group-by  [:card_id]})
          (map (juxt :card_id :count))
          (into {})))
   :id
   {:default 0}))

(methodical/defmethod t2/batched-hydrate [:model/Card :in_dashboards]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   (fn []
     (let [card-ids (map :id cards)
           ;; First get dashboards from direct card connections
           direct-dashboards (t2/query {:select [[:dc.card_id :card_id]
                                                 :d.name
                                                 :d.collection_id
                                                 :d.description
                                                 :d.id
                                                 :d.archived]
                                        :from [[:report_dashboardcard :dc]]
                                        :join [[:report_dashboard :d] [:= :dc.dashboard_id :d.id]]
                                        :where [:in :dc.card_id card-ids]})
           ;; Then get dashboards from series
           series-dashboards (t2/query {:select [[:dcs.card_id :card_id]
                                                 :d.name
                                                 :d.collection_id
                                                 :d.description
                                                 :d.id
                                                 :d.archived]
                                        :from [[:dashboardcard_series :dcs]]
                                        :join [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]
                                               [:report_dashboard :d] [:= :d.id :dc.dashboard_id]]
                                        :where [:in :dcs.card_id card-ids]})
           ;; Combine and group all results
           all-dashboards (concat direct-dashboards series-dashboards)]
       (update-vals
        (group-by :card_id all-dashboards)
        (fn [dashes]
          (->> dashes
               (map #(dissoc % :card_id))
               distinct
               (mapv #(t2/instance :model/Dashboard %)))))))
   :id
   {:default []}))

(defn- source-card-id
  [query]
  (when (map? query)
    (let [query-type (lib/normalized-query-type query)]
      (case query-type
        :query      (-> query mbql.normalize/normalize qp.util/query->source-card-id)
        :mbql/query (-> query lib/normalize lib.util/source-card-id)
        nil))))

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
  "Adds `:can_run_adhoc_query` to each card."
  [cards]
  ;; TODO: for metrics, we can get (some-fn :source_model_id :source_question_id)
  (let [dataset-cards (filter (comp seq :dataset_query) cards)
        source-card-ids (into #{}
                              (keep (comp source-card-id :dataset_query))
                              dataset-cards)]
    ;; Prefetching code should not propagate any exceptions.
    (when lib.metadata.jvm/*metadata-provider-cache*
      (try
        (prefetch-tables-for-cards! dataset-cards)
        (catch Throwable t
          (log/errorf t "Failed prefetching cards `%s`." (pr-str (map :id dataset-cards))))))
    (query-perms/with-card-instances (when (seq source-card-ids)
                                       (t2/select-fn->fn :id identity [:model/Card :id :collection_id :card_schema]
                                                         :id [:in source-card-ids]))
      (perms/prime-db-cache (into #{} (map :database_id cards)))
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

;; note: perms lookup here in the course of fetching a card/model should hit a cache pre-warmed by
;; the `:can_run_adhoc_query` above
(mi/define-batched-hydration-method add-can-manage-db
  :can_manage_db
  "Hydrate can_manage_db onto cards. Indicates whether the current user has access to the database admin page for the
  database powering this card."
  [cards]
  (map
   (fn [card]
     (assoc card
            :can_manage_db
            (perms/user-has-permission-for-database? api/*current-user-id* :perms/manage-database :yes (:database_id card))))
   cards))

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

(methodical/defmethod t2/batched-hydrate [:model/Card :metrics]
  [_model k cards]
  (mi/instances-with-hydrated-data
   cards k
   #(group-by :source_card_id
              (->> (t2/select :model/Card
                              :source_card_id [:in (map :id cards)],
                              :archived false,
                              :type :metric,
                              {:order-by [[:name :asc]]})
                   (filter mi/can-read?)))
   :id))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn populate-query-fields
  "Lift `database_id`, `table_id`, `query_type`, and `source_card_id` fields
  from query definition when inserting/updating a Card."
  [{query :dataset_query, :as card}]
  (merge
   card
   (when-let [source-id (source-card-id query)]
     {:source_card_id source-id})
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
        (recur (or (t2/select-one-fn :dataset_query :model/Card :id source-card-id)
                   (throw (ex-info (tru "Card {0} does not exist." source-card-id)
                                   {:status-code 404})))
               (conj ids-already-seen source-card-id))))))

(defn- maybe-normalize-query [card]
  (cond-> card
    (seq (:dataset_query card)) (update :dataset_query #(mi/maybe-normalize-query :in %))))

;;; TODO -- move this to [[metabase.query-processor.card]] or MLv2 so the logic can be shared between the backend and
;;; frontend (?)
;;;
;;; NOTE: this should mirror `getTemplateTagParameters` in frontend/src/metabase-lib/parameters/utils/template-tags.ts
;;; If this function moves you should update the comment that links to this one (#40013)
;;;
;;; TODO -- does this belong HERE or in the `parameters` module?
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
      (doseq [{:keys [field-id field-name table-name field-db-id]} (app-db/query
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

(defn- dashboard-internal-card? [card]
  (boolean (:dashboard_id card)))

(defn- invalid-dashboard-internal-card-update-reason?
  "Returns the reason, if any, why this card is an invalid Dashboard Question"
  [card changes]
  (let [dq-will-change? (api/column-will-change? :dashboard_id card changes)
        will-be-dq? (or (and (not dq-will-change?)
                             (:dashboard_id card))
                        (and dq-will-change?
                             (:dashboard_id changes)))]
    (when will-be-dq?
      (cond
        (not (or dq-will-change?
                 (not (api/column-will-change? :collection_id card changes))))
        (tru "Invalid Dashboard Question: Cannot manually set `collection_id` on a Dashboard Question")
        (api/column-will-change? :collection_position card changes)
        (tru "Invalid Dashboard Question: Cannot set `collection_position` on a Dashboard Question")
        ;; `column-will-change?` seems broken in the case where we 'change' :question to "question"
        (and (api/column-will-change? :type card changes)
             (not (contains? #{"question" :question} (:type changes))))
        (tru "Invalid Dashboard Question: Cannot set `type` on a Dashboard Question")))))

(defn- assert-is-valid-dashboard-internal-update [changes card]
  (let [dashboard-id->name (->> (t2/hydrate card :in_dashboards)
                                :in_dashboards
                                (remove #(or (= (:id %)
                                                (:dashboard_id changes))
                                             (= (:id %)
                                                (:dashboard_id card))))
                                (map (juxt :id :name))
                                (into {}))]
    (when (and (:dashboard_id changes) (seq dashboard-id->name))
      (throw (ex-info
              (tru "Can''t move question into dashboard. Questions saved in dashboards can''t appear in other dashboards.")
              {:status-code 400
               :other-dashboards dashboard-id->name}))))
  (when-let [reason (invalid-dashboard-internal-card-update-reason? card changes)]
    (throw (ex-info reason {:status-code 400
                            :changes changes
                            :card card})))
  changes)

(defn- check-dashboard-internal-card-insert [card]
  (let [correct-collection-id (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] (:dashboard_id card))
        invalid? (or (and (contains? card :collection_id)
                          (not= correct-collection-id (:collection_id card)))
                     (not (contains? #{:question "question" nil} (:type card)))
                     (some? (:collection_position card)))]
    (when invalid?
      (throw (ex-info (tru "Invalid dashboard-internal card")
                      {:status-code 400
                       :card card})))
    (assoc card :collection_id correct-collection-id)))

(defn- maybe-check-dashboard-internal-card [card]
  (cond-> card
    (dashboard-internal-card? card) check-dashboard-internal-card-insert))

;; TODO -- consider whether we should validate the Card query when you save/update it?? (#40013)
;;
;; TODO (Cam 7/18/25) -- weird/offputting to have half of the before-insert logic live here and then the other half live
;; in `define-before-insert`... we should consolidate it so it all lives in one or the other.
(defn- pre-insert [card]
  (let [defaults {:parameters         []
                  :parameter_mappings []
                  :card_schema        current-schema-version}
        card     (maybe-check-dashboard-internal-card
                  (merge defaults card))]
    (u/prog1 card
      ;; make sure this Card doesn't have circular source query references
      (check-for-circular-source-query-references card)
      (check-field-filter-fields-are-from-correct-database card)
      ;; TODO: add a check to see if all id in :parameter_mappings are in :parameters (#40013)
      (assert-valid-type card)
      (params/assert-valid-parameters card)
      (params/assert-valid-parameter-mappings card)
      (collection/check-collection-namespace :model/Card (:collection_id card)))))

(defenterprise pre-update-check-sandbox-constraints
  "Checks additional sandboxing constraints for Metabase Enterprise Edition. The OSS implementation is a no-op."
  metabase-enterprise.sandbox.models.group-table-access-policy
  [_ _])

(defn- update-parameters-using-card-as-values-source
  "Update the config of parameter on any Dashboard/Card use this `card` as values source .

  Remove parameter.values_source_type and set parameter.values_source_type to nil ( the default type ) when:
  - card is archived
  - card.result_metadata changes and the parameter values source field can't be found anymore"
  [{:keys [id]} changes]
  (when (some #{:archived :result_metadata} (keys changes))
    (let [parameter-cards (t2/select :model/ParameterCard :card_id id)]
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

;;; TODO (Cam 7/21/25) -- icky to have some of the before-update stuff live in the before-update method below and then
;;; some but not all of it live in this `pre-update` function... all of the before-update stuff should live in a single
;;; function. We should move it all here or move it all there. Weird to split it up between two places.
(defn- pre-update [{id :id :as card} changes]
  ;; TODO - don't we need to be doing the same permissions check we do in `pre-insert` if the query gets changed? Or
  ;; does that happen in the `PUT` endpoint? (#40013)
  (u/prog1 card
    (let [;; Fetch old card data if necessary, and share the data between multiple checks.
          old-card-info (when (or (contains? changes :type)
                                  (:dataset_query changes)
                                  (get-in changes [:dataset_query :native]))
                          (t2/select-one [:model/Card :dataset_query :type :result_metadata :card_schema]
                                         :id (u/the-id id)))]
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
        (check-for-circular-source-query-references card))
      ;; updating a model dataset query to not support implicit actions will disable implicit actions if they exist
      (when (and (:dataset_query changes)
                 (= (:type old-card-info) :model)
                 (not (model-supports-implicit-actions? changes)))
        (disable-implicit-action-for-model! id))
      ;; Changing from a Model to a Question: archive associated actions
      (when (and (= (:type changes) :question)
                 (= (:type old-card-info) :model))
        (t2/update! :model/Action {:model_id id :type [:not= :implicit]} {:archived true})
        (t2/delete! :model/Action :model_id id, :type :implicit))
      ;; Make sure any native query template tags match the DB in the query.
      (check-field-filter-fields-are-from-correct-database changes)
      ;; Make sure the Collection is in the default Collection namespace (e.g. as opposed to the Snippets Collection
      ;; namespace)
      (collection/check-collection-namespace :model/Card (:collection_id changes))
      (params/assert-valid-parameters changes)
      (params/assert-valid-parameter-mappings changes)
      (update-parameters-using-card-as-values-source card changes)
      (when (:parameters changes)
        (parameter-card/upsert-or-delete-from-parameters! "card" id (:parameters changes)))
      ;; additional checks (Enterprise Edition only)
      (pre-update-check-sandbox-constraints card changes)
      (assert-valid-type (merge old-card-info changes)))))

(defn- add-query-description-to-metric-card
  "Add `:query_description` key to returned card.

  Some users were missing description that was present in v1 metric API responses. This new key compensates for that.

  This function is used in `t2/define-after-select :model/Card`. Metadata provider caching should be considered when
  fetching multiple metric cards having common database, as done in eg. dashboard API context."
  [card]
  (if-not (and (map? card)
               (= :metric (:type card))
               (-> card :dataset_query not-empty)
               (-> card :database_id))
    card
    (m/assoc-some card :query_description (some-> (lib.metadata.jvm/application-database-metadata-provider
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
                                  (mapv #(dissoc % :ident :model/inner_ident) cols))))

(mu/defn- upgrade-card-schema-to-latest :- [:map
                                            [:result_metadata {:optional true} [:maybe
                                                                                [:sequential
                                                                                 ::lib.schema.metadata/lib-or-legacy-column]]]]
  [card]
  (if (and (:id card)
           (or (:dataset_query card)
               (:result_metadata card)
               (:database_id card)
               (:type card)))
    ;; A plausible select to run the after-select logic on.
    (if-not (:card_schema card)
      ;; Plausible but no :card_schema - error.
      (throw (ex-info "Cannot SELECT a Card without including :card_schema"
                      {:card-id (:id card)}))
      ;; Plausible and has the schema, so run the upgrades over it.
      (loop [card card]
        (if (= (:card_schema card) current-schema-version)
          card
          (let [new-version (inc (:card_schema card))]
            (recur (assoc (upgrade-card-schema-to card new-version)
                          :card_schema new-version))))))

    ;; Some sort of odd query like an aggregation over cards. Just return it as-is.
    card))

(t2/define-after-select :model/Card
  [card]
  ;; +===============================================================================================+
  ;; |   DO NOT EDIT THIS FUNCTION DIRECTLY!                                                         |
  ;; |   Future revisions to the shapes of cards should be handled via [[upgrade-card-schema-to]].   |
  ;; |   See [[current-schema-version]] for details on the schema versioning.                        |
  ;; +===============================================================================================+
  (-> card
      (dissoc :dataset_query_metrics_v2_migration_backup)
      (m/assoc-some :source_card_id (-> card :dataset_query source-card-id))
      public-sharing/remove-public-uuid-if-public-sharing-is-disabled
      add-query-description-to-metric-card
      ;; At this point, the card should be at schema version 20 or higher.
      upgrade-card-schema-to-latest))

(t2/define-before-insert :model/Card
  [card]
  (-> card
      (assoc :metabase_version config/mb-version-string
             :card_schema current-schema-version)
      maybe-normalize-query
      ;; Must have an entity_id before populating the metadata. TODO (Cam 7/11/25) -- actually, this is no longer true,
      ;; since we're removing `:ident`s; we can probably remove this now.
      (u/assoc-default :entity_id (u/generate-nano-id))
      card.metadata/populate-result-metadata
      pre-insert
      populate-query-fields))

(t2/define-after-insert :model/Card
  [card]
  (u/prog1 card
    (when-let [field-ids (seq (params/card->template-tag-field-ids card))]
      (log/info "Card references Fields in params:" field-ids)
      (field-values/update-field-values-for-on-demand-dbs! field-ids))
    (parameter-card/upsert-or-delete-from-parameters! "card" (:id card) (:parameters card))))

(defn- apply-dashboard-question-updates [card changes]
  (if-let [dashboard-id (:dashboard_id changes)]
    (assoc card :collection_id (t2/select-one-fn :collection_id :model/Dashboard :id dashboard-id))
    card))

(mu/defn- populate-result-metadata :- [:map
                                       [:result_metadata {:optional true} [:maybe
                                                                           [:sequential
                                                                            ::lib.schema.metadata/lib-or-legacy-column]]]]
  "If we have fresh result_metadata, we don't have to populate it anew. When result_metadata doesn't
  change for a native query, populate-result-metadata removes it (set to nil) unless prevented by the
  verified-result-metadata? flag (see #37009)."
  [card changes verified-result-metadata?]
  (-> (cond-> card
        (or (empty? (:result_metadata card))
            (not verified-result-metadata?)
            (contains? (t2/changes card) :type))
        (card.metadata/populate-result-metadata changes))
      (m/update-existing :result_metadata #(some->> % (lib.normalize/normalize [:sequential ::lib.schema.metadata/lib-or-legacy-column])))))

(t2/define-before-update :model/Card
  [{:keys [verified-result-metadata?] :as card}]
  (let [changes (t2/changes card)]
    (-> card
        (dissoc :verified-result-metadata?)
        (assoc :card_schema current-schema-version)
        (apply-dashboard-question-updates changes)
        maybe-normalize-query
        (populate-result-metadata changes verified-result-metadata?)
        (pre-update changes)
        populate-query-fields
        maybe-populate-initially-published-at)))

;; Cards don't normally get deleted (they get archived instead) so this mostly affects tests
(t2/define-before-delete :model/Card
  [{:keys [id] :as _card}]
  ;; delete any ParameterCard that the parameters on this card linked to
  (parameter-card/delete-all-for-parameterized-object! "card" id)
  ;; delete any ParameterCard linked to this card
  (t2/delete! :model/ParameterCard :card_id id)
  (t2/delete! :model/ModerationReview :moderated_item_type "card", :moderated_item_id id)
  (t2/delete! :model/Revision :model "Card", :model_id id))

(defmethod serdes/hash-fields :model/Card
  [_card]
  [:name (serdes/hydrated-hash :collection) :created_at])

(defmethod mi/exclude-internal-content-hsql :model/Card
  [_model & {:keys [table-alias]}]
  [:not= (h2x/identifier :field table-alias :creator_id) config/internal-mb-user-id])

;;; ----------------------------------------------- Creating Cards ----------------------------------------------------

(defn- autoplace-dashcard-for-card! [dashboard-id maybe-dashboard-tab-id card]
  (let [dashboard (t2/hydrate (t2/select-one :model/Dashboard dashboard-id) :dashcards [:tabs :tab-cards])
        {:keys [dashcards tabs]} dashboard
        tabs (remove #(when maybe-dashboard-tab-id (not= maybe-dashboard-tab-id (:id %))) tabs)
        already-on-dashboard? (seq (filter #(= (:id card) (:card_id %)) dashcards))]
    (when-not already-on-dashboard?
      (let [first-tab (first tabs)
            cards-on-first-tab (or (when first-tab
                                     (:cards first-tab))
                                   dashcards)
            new-spot (autoplace/get-position-for-new-dashcard cards-on-first-tab (:display card))]
        (t2/insert! :model/DashboardCard (assoc new-spot
                                                :dashboard_tab_id (some-> first-tab :id)
                                                :card_id (:id card)
                                                :dashboard_id dashboard-id))
        ;; the handler for `:event/dashboard-update` will hydrate `:dashcards` iff it's missing - make sure it is, so
        ;; we don't store a revision for the *unmodified* dashcards.
        (events/publish-event! :event/dashboard-update
                               {:object (dissoc dashboard :dashcards :tabs)
                                :user-id api/*current-user-id*})))))

(defn- autoremove-dashcard-for-card!
  [card-id dashboard-id]
  (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id dashboard-id)
  (when-let [dashcard-ids (seq (map :id (t2/query {:select [[:dcs.id]]
                                                   :from [[:dashboardcard_series :dcs]]
                                                   :join [[:report_dashboardcard :dc]
                                                          [:= :dc.id :dcs.dashboardcard_id]]
                                                   :where [:and
                                                           [:= :dc.dashboard_id dashboard-id]
                                                           [:= :dcs.card_id card-id]]})))]
    (t2/delete! :model/DashboardCardSeries :id [:in (set dashcard-ids)]))
  (events/publish-event! :event/dashboard-update {:object (t2/select-one :model/Dashboard dashboard-id)
                                                  :user-id api/*current-user-id*}))

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
  (let [dashboard-changes? (api/column-will-change? :dashboard_id card-before-update card-updates)
        new-dashboard-id (if-not dashboard-changes?
                           old-dashboard-id
                           dashboard-id-update)
        on-dashboard-before? (boolean old-dashboard-id)
        on-dashboard-after? (boolean new-dashboard-id)
        archived-changes? (api/column-will-change? :archived card-before-update card-updates)
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
      (autoplace-dashcard-for-card! new-dashboard-id dashboard-tab-id card-before-update))

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
      (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id [:not= new-dashboard-id])
      (when-let [ids (seq (map :id (t2/query {:select [[:dcs.id]]
                                              :from [[:dashboardcard_series :dcs]]
                                              :join [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]]
                                              :where [:and
                                                      [:= :dcs.card_id card-id]
                                                      [:not= :dc.dashboard_id new-dashboard-id]]})))]
        (t2/delete! :model/DashboardCardSeries :id [:in ids])))))

(defn create-card!
  "Create a new Card. Metadata will be fetched off thread. If the metadata takes longer than [[metadata-sync-wait-ms]]
  the card will be saved without metadata and it will be saved to the card in the future when it is ready.

  Dispatches the `:card-create` event unless `delay-event?` is true. Useful for when many cards are created in a
  transaction and work in the `:card-create` event cannot proceed because the cards would not be visible outside of
  the transaction yet. If you pass true here it is important to call the event after the cards are successfully
  created."
  ([card creator] (create-card! card creator false))
  ([card creator delay-event?] (create-card! card creator delay-event? true))
  ([{:keys [result_metadata parameters parameter_mappings type] :as input-card-data} creator delay-event? autoplace-dashboard-questions?]
   ;; you can't specify the dashboard_tab_id and not a dashboard_id
   (api/check-400 (not (and (:dashboard_tab_id input-card-data)
                            (not (:dashboard_id input-card-data)))))
   (let [data-keys                          [:dataset_query :description :display :name :visualization_settings
                                             :parameters :parameter_mappings :collection_id :collection_position
                                             :cache_ttl :type :dashboard_id]
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
                                                maybe-normalize-query)
         {:keys [metadata metadata-future]} (card.metadata/maybe-async-result-metadata
                                             {:query     (:dataset_query card-data)
                                              :metadata  result_metadata
                                              :entity-id (:entity_id card-data)
                                              :model?    (model? card-data)})
         card                               (t2/with-transaction [_conn]
                                              ;; Adding a new card at `collection_position` could cause other cards in
                                              ;; this collection to change position, check that and fix it if needed
                                              (api/maybe-reconcile-collection-position! position-info)
                                              (t2/insert-returning-instance! :model/Card (cond-> card-data
                                                                                           metadata
                                                                                           (assoc :result_metadata metadata))))]
     (let [{:keys [dashboard_id]} card]
       (when (and dashboard_id autoplace-dashboard-questions?)
         (autoplace-dashcard-for-card! dashboard_id (:dashboard_tab_id input-card-data) card)))
     (when-not delay-event?
       (events/publish-event! :event/card-create {:object card :user-id (:id creator)}))
     (when metadata-future
       (log/info "Metadata not available soon enough. Saving new card and asynchronously updating metadata")
       (card.metadata/save-metadata-async! metadata-future card))
     ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has with
     ;; returned one -- See #4283
     card)))

;;; ------------------------------------------------- Updating Cards -------------------------------------------------

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

(defn- breakout-->identifier->refs
  "Generate mapping of of _ref identifier_ -> #{_ref..._}.

  _ref identifier_ is a vector of first 2 elements of ref, eg. [:expression \"xix\"] or [:field 10]"
  [breakouts]
  (-> (group-by #(subvec % 0 2) breakouts)
      (update-vals set)))

(defn- action-for-identifier+refs
  "Generate _action_ for combination of args.

  _Action_ is to be performed on _parameter mapping_ of a _dashcard_. For more info see
  the [[update-associated-parameters!]]'s docstring.

  _Action_ has a form of [<action> & args]."
  [after--identifier->refs identifier before--refs]
  (let [after--refs (get after--identifier->refs identifier #{})]
    (when (and (= 1 (count before--refs) (count after--refs))
               (not= before--refs after--refs))
      [:update (first after--refs)])))

(defn- breakouts-->identifier->action
  "Generate mapping of _identifier_ -> _action_.

  _identifier_ is is a vector of first 2 elements of ref, eg. [:expression \"xix\"] or [:field 10]. Action is generated
  in [[action-for-identifier+refs]] and performed later in [[update-mapping]]."
  [breakout-before-update breakout-after-update]
  (let [before--identifier->refs (breakout-->identifier->refs breakout-before-update)
        after--identifier->refs  (breakout-->identifier->refs breakout-after-update)]
    ;; Remove no-ops to avoid redundant db calls in [[update-associated-parameters!]].
    (->> before--identifier->refs
         (m/map-kv-vals #(action-for-identifier+refs after--identifier->refs %1 %2))
         (m/filter-vals some?)
         not-empty)))

(defn eligible-mapping?
  "Decide whether parameter mapping has strucuture so it can be updated presumably using [[update-mapping]]."
  [{[dim [ref-kind]] :target :as _mapping}]
  (and (= dim :dimension)
       (#{:field :expression} ref-kind)))

(defn- update-mapping
  "Return modifed mapping according to action."
  [identifier->action {[_dim ref] :target :as mapping}]
  (let [identifier (subvec ref 0 2)
        [action arg] (get identifier->action identifier)]
    (case action
      :update (assoc-in mapping [:target 1] arg)
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

(defn- update-associated-parameters!
  "Update _parameter mappings_ of _dashcards_ that target modified _card_, to reflect the modification.

  This function handles only modifications to breakout.

  Context. Card can have multiple multiple breakout elements referencing same field or expression, having different
  _temporal unit_. Those refs can be targeted by dashboard _temporal unit parameter_. If refs change, and card is saved,
  _parameter mappings_ have to be updated to target new, modified refs. This function takes care of that.

  First mappings of _identifier_ -> _action_ are generated. _identifier_ is described
  eg. in [[breakouts-->identifier->action]] docstring. Then, dashcards are fetched and updates are generated
  by [[updates-for-dashcards]]. Updates are then executed."
  [card-before card-after]
  (let [card->breakout  #(-> % :dataset_query mbql.normalize/normalize :query :breakout)
        breakout-before (card->breakout card-before)
        breakout-after  (card->breakout card-after)]
    (when-some [identifier->action (breakouts-->identifier->action breakout-before breakout-after)]
      (let [dashcards (t2/select :model/DashboardCard :card_id (some :id [card-after card-before]))
            updates   (updates-for-dashcards identifier->action dashcards)]
        ;; Beware. This can have negative impact on card update performance as queries are fired in sequence. I'm not
        ;; aware of more reasonable way.
        (when (seq updates)
          (t2/with-transaction [_conn]
            (doseq [[id update] updates]
              (t2/update! :model/DashboardCard :id id update))))))))

(defn update-card!
  "Update a Card. Metadata is fetched asynchronously. If it is ready before [[metadata-sync-wait-ms]] elapses it will be
  included, otherwise the metadata will be saved to the database asynchronously."
  [{:keys [card-before-update card-updates actor delete-old-dashcards?]}]
  ;; don't block our precious core.async thread, run the actual DB updates on a separate thread
  (t2/with-transaction [_conn]
    (api/maybe-reconcile-collection-position! card-before-update card-updates)

    (autoplace-or-remove-dashcards-for-card! card-before-update card-updates delete-old-dashcards?)
    (assert-is-valid-dashboard-internal-update card-updates card-before-update)

    (when (and (card-is-verified? card-before-update)
               (changed? card-compare-keys card-before-update card-updates))
      ;; this is an enterprise feature but we don't care if enterprise is enabled here. If there is a review we need
      ;; to remove it regardless if enterprise edition is present at the moment.
      (moderation/create-review! {:moderated_item_id   (:id card-before-update)
                                  :moderated_item_type "card"
                                  :moderator_id        (:id actor)
                                  :status              nil
                                  :text                (tru "Unverified due to edit")}))
    ;; Invalidate the cache for card
    (cache/invalidate-config! {:questions [(:id card-before-update)]
                               :with-overrides? true})
    ;; ok, now save the Card
    (t2/update! :model/Card (:id card-before-update)
                ;; `collection_id` and `description` can be `nil` (in order to unset them).
                ;; Other values should only be modified if they're passed in as non-nil
                (u/select-keys-when card-updates
                                    :present #{:collection_id :collection_position :description :cache_ttl :archived_directly :dashboard_id}
                                    :non-nil #{:dataset_query :display :name :visualization_settings :archived
                                               :enable_embedding :type :parameters :parameter_mappings :embedding_params
                                               :result_metadata :collection_preview :verified-result-metadata?}))
    ;; ok, now update dependent dashcard parameters
    (try
      (update-associated-parameters! card-before-update card-updates)
      (catch Throwable e
        (log/error "Update of dependent card parameters failed!")
        (log/debug e
                   "`card-before-update`:" (pr-str card-before-update)
                   "`card-updates`:" (pr-str card-updates)))))
  ;; Fetch the updated Card from the DB
  (let [card (t2/select-one :model/Card :id (:id card-before-update))]
    ;;; TODO -- this should be triggered indirectly by `:event/card-update`
    (pulse/delete-alerts-if-needed! :old-card card-before-update, :new-card card, :actor actor)
    ;; skip publishing the event if it's just a change in its collection position
    (when-not (= #{:collection_position}
                 (set (keys card-updates)))
      (events/publish-event! :event/card-update {:object card :user-id api/*current-user-id*}))
    card))

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

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- export-result-metadata [metadata]
  (when metadata
    (for [m metadata]
      (-> (dissoc m :fingerprint)
          (m/update-existing :table_id  serdes/*export-table-fk*)
          (m/update-existing :id        serdes/*export-field-fk*)
          (m/update-existing :field_ref serdes/export-mbql)
          (m/update-existing :fk_target_field_id serdes/*export-field-fk*)))))

(defn- import-result-metadata [metadata]
  (when metadata
    (for [m metadata]
      (-> m
          (m/update-existing :table_id  serdes/*import-table-fk*)
          (m/update-existing :id        serdes/*import-field-fk*)
          (m/update-existing :field_ref serdes/import-mbql)
          ;; FIXME: remove that `if` after v52
          (m/update-existing :fk_target_field_id #(if (number? %) % (serdes/*import-field-fk* %)))))))

(defn- result-metadata-deps [metadata]
  (when (seq metadata)
    (-> (reduce into #{} (for [m metadata]
                           (conj (serdes/mbql-deps (:field_ref m))
                                 (when (:table_id m)
                                   (serdes/table->path (:table_id m)))
                                 (when (:id m)
                                   (serdes/field->path (:id m)))
                                 (when (and (:fk_target_field_id m)
                                            ;; FIXME: remove that check after v52
                                            (not (number? (:fk_target_field_id m))))
                                   (serdes/field->path (:fk_target_field_id m))))))
        (disj nil))))

(defmethod serdes/make-spec "Card"
  [_model-name _opts]
  {:copy [:archived :archived_directly :collection_position :collection_preview :description :display
          :embedding_params :enable_embedding :entity_id :metabase_version :public_uuid :query_type :type :name
          :card_schema]
   :skip [;; cache invalidation is instance-specific
          :cache_invalidated_at
          ;; those are instance-specific analytic columns
          :view_count :last_used_at :initially_published_at
          ;; this is data migration column
          :dataset_query_metrics_v2_migration_backup
          ;; this column is not used anymore
          :cache_ttl]
   :transform
   {:created_at             (serdes/date)
    :database_id            (serdes/fk :model/Database :name)
    :table_id               (serdes/fk :model/Table)
    :source_card_id         (serdes/fk :model/Card)
    :collection_id          (serdes/fk :model/Collection)
    :dashboard_id           (serdes/fk :model/Dashboard)
    :creator_id             (serdes/fk :model/User)
    :made_public_by_id      (serdes/fk :model/User)
    :dataset_query          {:export serdes/export-mbql :import serdes/import-mbql}
    :parameters             {:export serdes/export-parameters :import serdes/import-parameters}
    :parameter_mappings     {:export serdes/export-parameter-mappings :import serdes/import-parameter-mappings}
    :visualization_settings {:export serdes/export-visualization-settings :import serdes/import-visualization-settings}
    :result_metadata        {:export export-result-metadata :import import-result-metadata}}})

(defmethod serdes/dependencies "Card"
  [{:keys [collection_id database_id dataset_query parameters parameter_mappings
           result_metadata table_id source_card_id visualization_settings
           dashboard_id]}]
  (set
   (concat
    (mapcat serdes/mbql-deps parameter_mappings)
    (serdes/parameters-deps parameters)
    [[{:model "Database" :id database_id}]]
    (when table_id #{(serdes/table->path table_id)})
    (when source_card_id #{[{:model "Card" :id source_card_id}]})
    (when collection_id #{[{:model "Collection" :id collection_id}]})
    (when dashboard_id #{[{:model "Dashboard" :id dashboard_id}]})
    (result-metadata-deps result_metadata)
    (serdes/mbql-deps dataset_query)
    (serdes/visualization-settings-deps visualization_settings))))

(defmethod serdes/descendants "Card" [_model-name id]
  (let [card               (t2/select-one :model/Card :id id)
        source-table       (some->  card :dataset_query :query :source-table)
        template-tags      (some->> card :dataset_query :native :template-tags vals (keep :card-id))
        parameters-card-id (some->> card :parameters (keep (comp :card_id :values_source_config)))
        snippets           (some->> card :dataset_query :native :template-tags vals (keep :snippet-id))]
    (into {} (concat
              (when (and (string? source-table)
                         (str/starts-with? source-table "card__"))
                {["Card" (parse-long (subs source-table 6))] {"Card" id}})
              (for [card-id template-tags]
                {["Card" card-id] {"Card" id}})
              (for [card-id parameters-card-id]
                {["Card" card-id] {"Card" id}})
              (for [snippet-id snippets]
                {["NativeQuerySnippet" snippet-id] {"Card" id}})))))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(defn ^:private base-search-spec
  []
  {:model        :model/Card
   :attrs        {:archived            true
                  :collection-id       true
                  :creator-id          true
                  :dashboard-id        true
                  :dashboardcard-count {:select [:%count.*]
                                        :from   [:report_dashboardcard]
                                        :where  [:= :report_dashboardcard.card_id :this.id]}
                  :database-id         true
                  :last-viewed-at      :last_used_at
                  :native-query        (search/searchable-value-trim-sql [:case [:= "native" :query_type] :dataset_query])
                  :official-collection [:= "official" :collection.authority_level]
                  :last-edited-at      :r.timestamp
                  :last-editor-id      :r.user_id
                  :pinned              [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]
                  :verified            [:= "verified" :mr.status]
                  :view-count          true
                  :created-at          true
                  :updated-at          true
                  :display-type        :this.display
                  ;; Visualizer compatibility filtering
                  :has-temporal-dimensions [:case
                                            [:and [:is-not :this.result_metadata nil]
                                             [:like :this.result_metadata "%\"temporal_unit\":%"]] true
                                            :else false]}
   :search-terms [:name :description]
   :render-terms {:archived-directly          true
                  :collection-authority_level :collection.authority_level
                  :collection-location        :collection.location
                  :collection-name            :collection.name
                  ;; This is used for legacy ranking, in future it will be replaced by :pinned
                  :collection-position        true
                  :collection-type            :collection.type
                  ;; This field can become stale, unless we change to calculate it just-in-time.
                  :display                    true
                  :moderated-status           :mr.status}
   :bookmark     [:model/CardBookmark [:and
                                       [:= :bookmark.card_id :this.id]
                                       [:= :bookmark.user_id :current_user/id]]]
   :where        [:= :collection.namespace nil]
   :joins        {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                  :r          [:model/Revision [:and
                                                [:= :r.model_id :this.id]
                                                ;; Interesting for inversion, another condition on whether to update.
                                                ;; For now, let's just swallow the extra update (2x amplification)
                                                [:= :r.most_recent true]
                                                [:= :r.model "Card"]]]
                  :mr         [:model/ModerationReview [:and
                                                        [:= :mr.moderated_item_type "card"]
                                                        [:= :mr.moderated_item_id :this.id]
                                                        [:= :mr.most_recent true]]]}
                  ;; Workaround for dataflow :((((((
                  ;; NOTE: disabled for now, as this is not a very important ranker and can afford to have stale data,
                  ;;       and could cause a large increase in the query count for dashboard updates.
                  ;;       (see the test failures when this hook is added back)
                  ;:dashcard  [:model/DashboardCard [:= :dashcard.card_id :this.id]]
   #_:end})

(search/define-spec "card"
  (-> (base-search-spec) (sql.helpers/where [:= :this.type "question"])))

(search/define-spec "dataset"
  (-> (base-search-spec) (sql.helpers/where [:= :this.type "model"])))

(search/define-spec "metric"
  (-> (base-search-spec) (sql.helpers/where [:= :this.type "metric"])))
