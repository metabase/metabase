(ns metabase-enterprise.data-studio.api.usage-metadata
  "Superuser workflow for reviewing deterministic Library recommendations."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.measures.api :as measures.api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.segments.api :as segments.api]
   [metabase.usage-metadata.candidate-service :as candidate-service]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-limit 50)
(def ^:private max-limit 200)
(def ^:private max-search-length 254)
(def ^:private max-name-length 254)
(def ^:private max-description-length 10000)
(def ^:private max-dismissal-reason-length 1000)

;;; ------------------------------------------------ Response schemas ------------------------------------------------

(mr/def ::snapshot-summary
  [:map
   [:candidate_count     ms/IntGreaterThanOrEqualToZero]
   [:measure_count       ms/IntGreaterThanOrEqualToZero]
   [:segment_count       ms/IntGreaterThanOrEqualToZero]
   [:metric_count        ms/IntGreaterThanOrEqualToZero]
   [:publish_table_count ms/IntGreaterThanOrEqualToZero]
   [:table_count         ms/IntGreaterThanOrEqualToZero]])

(mr/def ::snapshot
  [:map
   [:id                ms/PositiveInt]
   [:finished_at       :any]
   [:algorithm_version ms/IntGreaterThanOrEqualToZero]
   [:summary           [:maybe ::snapshot-summary]]])

(mr/def ::database
  [:map
   [:id   ms/PositiveInt]
   [:name :string]])

(mr/def ::creation-blocker
  [:enum :table-not-published :table-inactive :table-uneditable])

(mr/def ::table
  [:map
   [:id                ms/PositiveInt]
   [:db_id             ms/PositiveInt]
   [:schema            [:maybe :string]]
   [:name              :string]
   [:display_name      :string]
   [:description       [:maybe :string]]
   [:data_layer        [:maybe :keyword]]
   [:data_authority    [:maybe :keyword]]
   [:view_count        ms/IntGreaterThanOrEqualToZero]
   [:is_published      :boolean]
   [:collection_id     [:maybe ms/PositiveInt]]
   [:database          ::database]])

(mr/def ::table-summary
  [:map
   [:table           ::table]
   [:candidate_count ms/IntGreaterThanOrEqualToZero]])

(mr/def ::candidate-type [:enum :table :metric :measure :segment])
(mr/def ::modeling-status [:enum :missing :partially-modeled :modeled])
(mr/def ::predicate-kind [:enum "boolean" "category" "number" "temporal" "other"])

(mr/def ::presented-predicate
  [:map
   [:signature    :string]
   [:display_name :string]
   [:kind         ::predicate-kind]])

(mr/def ::candidate-presentation
  [:map
   [:aggregation {:optional true}
    [:map [:display_name :string]]]
   [:predicates [:sequential ::presented-predicate]]])

(mr/def ::candidate-evidence
  [:map
   [:verified_source_count ms/IntGreaterThanOrEqualToZero]
   [:official_source_count ms/IntGreaterThanOrEqualToZero]
   [:popular_source_count  ms/IntGreaterThanOrEqualToZero]
   [:distinct_source_count ms/IntGreaterThanOrEqualToZero]
   [:total_view_count      ms/IntGreaterThanOrEqualToZero]])

(mr/def ::required-table
  [:map
   [:id             ms/PositiveInt]
   [:database_id    ms/PositiveInt]
   [:database_name  :string]
   [:schema         [:maybe :string]]
   [:name           :string]
   [:display_name   :string]
   [:description    [:maybe :string]]
   [:data_layer     [:maybe :string]]
   [:data_authority [:maybe :string]]
   [:view_count     ms/IntGreaterThanOrEqualToZero]
   [:is_published   :boolean]])

(mr/def ::candidate-clause [:sequential :any])

(mr/def ::candidate-join
  [:map
   [:lib/type   [:= "mbql/join"]]
   [:stages     [:sequential {:min 1} [:ref ::candidate-stage]]]
   [:conditions [:sequential {:min 1} ::candidate-clause]]
   [:alias      ms/NonBlankString]
   [:fields     {:optional true}
    [:or [:= "all"] [:= "none"] [:sequential ::candidate-clause]]]
   [:strategy   {:optional true} :string]])

(mr/def ::candidate-stage
  [:map
   [:lib/type     [:= "mbql.stage/mbql"]]
   [:source-table ms/PositiveInt]
   [:aggregation  {:optional true} [:sequential ::candidate-clause]]
   [:breakout     {:optional true} [:sequential ::candidate-clause]]
   [:expressions  {:optional true} [:map-of :string ::candidate-clause]]
   [:filters      {:optional true} [:sequential ::candidate-clause]]
   [:joins        {:optional true} [:sequential [:ref ::candidate-join]]]])

(mr/def ::candidate-query
  [:map
   [:database ms/PositiveInt]
   [:lib/type [:= "mbql/query"]]
   [:stages   [:sequential {:min 1} ::candidate-stage]]])

(mr/def ::candidate-definition
  [:or
   ::candidate-query
   [:map [:table_id ms/PositiveInt]]])

(mr/def ::candidate-summary
  [:map
   [:id              ms/PositiveInt]
   [:candidate_type  ::candidate-type]
   [:display_name    :string]
   [:presentation    ::candidate-presentation]
   [:modeling_status ::modeling-status]
   [:dismissed       :boolean]
   [:evidence        ::candidate-evidence]])

(mr/def ::model-lineage-item
  [:map
   [:id   ms/PositiveInt]
   [:name :string]])

(mr/def ::dependency-path
  [:map
   [:direct :boolean]
   [:models [:sequential ::model-lineage-item]]])

(mr/def ::candidate-source
  [:map
   [:id               ms/PositiveInt]
   [:candidate_id     ms/PositiveInt]
   [:card_id          ms/PositiveInt]
   [:card_name        [:maybe :string]]
   [:card_type        [:enum :question :model]]
   [:verified         :boolean]
   [:official         :boolean]
   [:popular          :boolean]
   [:view_count       ms/IntGreaterThanOrEqualToZero]
   [:joined           :boolean]
   [:stage_numbers    [:sequential ms/IntGreaterThanOrEqualToZero]]
   [:model_lineage    [:maybe [:sequential ::model-lineage-item]]]
   [:dependency_paths {:optional true} [:sequential ::dependency-path]]])

(mr/def ::candidate-match
  [:map
   [:relation    [:enum :exact :same-base :subset :superset :overlap]]
   [:entity_type [:enum :measure :segment]]
   [:entity      [:map
                  [:id          ms/PositiveInt]
                  [:name        :string]
                  [:description [:maybe :string]]
                  [:archived    :boolean]]]])

(mr/def ::candidate-dismissal
  [:map
   [:id           ms/PositiveInt]
   [:dismissed_by ms/PositiveInt]
   [:dismissed_at :any]
   [:reason       [:maybe :string]]])

(mr/def ::candidate-detail
  [:merge
   ::candidate-summary
   [:map
    [:table                 ::table]
    [:suggested_name        :string]
    [:suggested_description [:maybe :string]]
    [:required_tables       [:sequential ::required-table]]
    [:definition            ::candidate-definition]
    [:creation_blockers     [:sequential ::creation-blocker]]
    [:dismissal             [:maybe ::candidate-dismissal]]
    [:sources               [:sequential ::candidate-source]]
    [:matches               [:sequential ::candidate-match]]]])

(mr/def ::candidate-page
  [:map
   [:data     [:sequential ::candidate-summary]]
   [:total    ms/IntGreaterThanOrEqualToZero]
   [:limit    ms/IntGreaterThanOrEqualToZero]
   [:offset   ms/IntGreaterThanOrEqualToZero]
   [:snapshot [:maybe ::snapshot]]])

(mr/def ::table-page
  [:map
   [:data     [:sequential ::table-summary]]
   [:total    ms/IntGreaterThanOrEqualToZero]
   [:limit    ms/IntGreaterThanOrEqualToZero]
   [:offset   ms/IntGreaterThanOrEqualToZero]
   [:snapshot [:maybe ::snapshot]]])

(mr/def ::created-entity
  [:map
   [:id          ms/PositiveInt]
   [:name        ms/NonBlankString]
   [:table_id    {:optional true} ms/PositiveInt]
   [:definition  {:optional true} ::candidate-query]
   [:description {:optional true} [:maybe :string]]
   [:archived    {:optional true} :boolean]])

(mr/def ::create-response
  [:map
   [:candidate ::candidate-detail]
   [:entity    ::created-entity]])

(mr/def ::run
  [:map
   [:id                ms/PositiveInt]
   [:status            [:enum :queued :running :succeeded :failed]]
   [:trigger           [:enum :scheduled :manual]]
   [:requested_by      [:maybe ms/PositiveInt]]
   [:algorithm_version ms/IntGreaterThanOrEqualToZero]
   [:summary           [:maybe ::snapshot-summary]]
   [:error             [:maybe :string]]
   [:created_at        :any]
   [:started_at        [:maybe :any]]
   [:finished_at       [:maybe :any]]])

(mr/def ::refresh-status
  [:map
   [:snapshot [:maybe ::run]]
   [:active   [:maybe ::run]]
   [:failure  [:maybe ::run]]
   [:fresh    :boolean]])

(mr/def ::start-refresh-response
  [:map
   [:status [:= 202]]
   [:body   [:map [:run_id ms/PositiveInt]]]])

(defn- run-refresh-async!
  "TEMPORARY: run a manual refresh without Quartz so it works when the scheduler is disabled."
  [run]
  (u.jvm/in-virtual-thread*
   (try
     (candidate-service/run-refresh! run)
     (catch Exception e
       (log/error e "Manual usage-metadata candidate refresh failed")
       (throw e)))))

(defn- paging
  []
  (let [limit (or (request/limit) default-limit)]
    (api/check-400 (<= limit max-limit) "limit must not exceed 200")
    {:limit limit, :offset (or (request/offset) 0)}))

(defn- snapshot-summary-response
  [summary]
  (when summary
    {:candidate_count     (:candidate-count summary)
     :measure_count       (:measure-count summary)
     :segment_count       (:segment-count summary)
     :metric_count        (:metric-count summary)
     :publish_table_count (:publish-table-count summary)
     :table_count         (:table-count summary)}))

(defn- snapshot-response
  [run]
  (when run
    {:id                (:id run)
     :finished_at       (:finished_at run)
     :algorithm_version (:algorithm_version run)
     :summary           (snapshot-summary-response (:summary run))}))

(defn- run-response
  [run]
  (when run
    {:id                (:id run)
     :status            (:status run)
     :trigger           (:trigger run)
     :requested_by      (:requested_by run)
     :algorithm_version (:algorithm_version run)
     :summary           (snapshot-summary-response (:summary run))
     :error             (:error run)
     :created_at        (:created_at run)
     :started_at        (:started_at run)
     :finished_at       (:finished_at run)}))

(defn- dismissal-key
  [candidate]
  (mapv candidate [:candidate_type :table_id :signature_version :signature_hash]))

(defn- dismissal-index
  [candidates]
  (let [table-ids (into #{} (map :table_id) candidates)]
    (if (seq table-ids)
      (into {}
            (map (juxt dismissal-key identity))
            (t2/select :model/UsageMetadataCandidateDismissal :table_id [:in table-ids]))
      {})))

(defn- table-index
  [table-ids]
  (if (seq table-ids)
    (let [tables (t2/select [:model/Table :id :db_id :schema :name :display_name :description
                             :data_layer :data_authority :view_count :active
                             :is_published :collection_id]
                            :id [:in table-ids])
          db-ids (into #{} (keep :db_id) tables)
          dbs     (if (seq db-ids)
                    (t2/select-pk->fn identity :model/Database :id [:in db-ids])
                    {})
          collection-ids (into #{} (keep :collection_id) tables)
          collections    (if (seq collection-ids)
                           (t2/select-pk->fn identity :model/Collection :id [:in collection-ids])
                           {})]
      (into {}
            (map (fn [{:keys [id db_id] :as table}]
                   [id (assoc table
                              :database (select-keys (dbs db_id) [:id :name])
                              :collection (collections (:collection_id table)))]))
            tables))
    {}))

(defn- dismissed?
  [dismissals candidate]
  (contains? dismissals (dismissal-key candidate)))

(defn- candidate-entity-model
  [candidate]
  (case (:candidate_type candidate)
    :measure :model/Measure
    :segment :model/Segment
    nil))

(defn- table-editable-for-candidate?
  [candidate table]
  (when-let [model (candidate-entity-model candidate)]
    (mi/can-create? model {:table table, :table_id (:id table)})))

(defn- table-response
  [table]
  {:id             (:id table)
   :db_id          (:db_id table)
   :schema         (:schema table)
   :name           (:name table)
   :display_name   (:display_name table)
   :description    (:description table)
   :data_layer     (:data_layer table)
   :data_authority (:data_authority table)
   :view_count     (long (or (:view_count table) 0))
   :is_published   (boolean (:is_published table))
   :collection_id  (:collection_id table)
   :database       (:database table)})

(defn- presented-atom
  [{:keys [signature display-name kind]}]
  {:signature    signature
   :display_name display-name
   :kind         kind})

(defn- required-table-response
  [table]
  {:id             (:id table)
   :database_id    (:database-id table)
   :database_name  (:database-name table)
   :schema         (:schema table)
   :name           (:name table)
   :display_name   (:display-name table)
   :description    (:description table)
   :data_layer     (:data-layer table)
   :data_authority (:data-authority table)
   :view_count     (:view-count table)
   :is_published   (:published? table)})

(defn- candidate-presentation
  [{:keys [candidate_type semantic_details]}]
  (let [predicates (:display-atoms semantic_details)]
    (cond-> {:predicates (mapv presented-atom predicates)}
      (= candidate_type :measure)
      (assoc :aggregation {:display_name (:base-name semantic_details)}))))

(defn- json-response-value
  [value]
  (cond
    (map? value)        (update-vals value json-response-value)
    (vector? value)     (mapv json-response-value value)
    (sequential? value) (mapv json-response-value value)
    (keyword? value)    (u/qualified-name value)
    :else               value))

(defn- query-definition-response
  [definition]
  (json-response-value (dissoc definition :lib/metadata)))

(defn- candidate-definition-response
  [{:keys [candidate_type definition]}]
  (if (= candidate_type :table)
    {:table_id (:table-id definition)}
    (query-definition-response definition)))

(defn- created-entity-response
  [entity]
  (cond-> (select-keys entity [:id :name :table_id :description :archived])
    (:definition entity) (assoc :definition (query-definition-response (:definition entity)))))

(defn- candidate-summary
  [candidate dismissals]
  {:id              (:id candidate)
   :candidate_type  (:candidate_type candidate)
   :display_name    (:display_name candidate)
   :presentation    (candidate-presentation candidate)
   :modeling_status (:modeling_status candidate)
   :dismissed       (dismissed? dismissals candidate)
   :evidence        {:verified_source_count (:verified_source_count candidate)
                     :official_source_count (:official_source_count candidate)
                     :popular_source_count (:popular_source_count candidate)
                     :distinct_source_count (:distinct_source_count candidate)
                     :total_view_count (:total_view_count candidate)}})

(defn- candidate-detail-summary
  [candidate table dismissals]
  (let [creation-candidate? (contains? #{:measure :segment} (:candidate_type candidate))
        editable?           (and creation-candidate?
                                 (table-editable-for-candidate? candidate table))]
    (assoc (candidate-summary candidate dismissals)
           :table (table-response table)
           :suggested_name (:suggested_name candidate)
           :suggested_description (:suggested_description candidate)
           :required_tables (mapv required-table-response
                                  (:required-tables (:semantic_details candidate)))
           :definition (candidate-definition-response candidate)
           :creation_blockers (cond-> []
                                (and creation-candidate? (not (:is_published table)))
                                (conj :table-not-published)

                                (and creation-candidate? (not (:active table)))
                                (conj :table-inactive)

                                (and creation-candidate? (not editable?))
                                (conj :table-uneditable)))))

(def ^:private list-query-schema
  [:map
   [:table-id        {:optional true} [:maybe ms/PositiveInt]]
   [:database-id     {:optional true} [:maybe ms/PositiveInt]]
   [:candidate-type  {:optional true} [:maybe [:enum :table :metric :measure :segment]]]
   [:queue           {:default :suggested} [:enum :suggested :used-raw :discarded]]
   [:search          {:optional true} [:maybe [:string {:max max-search-length}]]]])

(defn- candidate-joins
  []
  {:from       [[(t2/table-name :model/UsageMetadataCandidate) :candidate]]
   :inner-join [[(t2/table-name :model/Table) :table]
                [:= :candidate.table_id :table.id]
                [(t2/table-name :model/Database) :database]
                [:= :table.db_id :database.id]]
   :left-join  [[(t2/table-name :model/UsageMetadataCandidateDismissal) :dismissal]
                [:and
                 [:= :candidate.candidate_type :dismissal.candidate_type]
                 [:= :candidate.table_id :dismissal.table_id]
                 [:= :candidate.signature_version :dismissal.signature_version]
                 [:= :candidate.signature_hash :dismissal.signature_hash]]]})

(defn- candidate-where
  [run-id {:keys [table-id database-id candidate-type queue search]}]
  (cond-> [:and [:= :candidate.run_id run-id]]
    table-id
    (conj [:= :candidate.table_id table-id])

    database-id
    (conj [:= :table.db_id database-id])

    candidate-type
    (conj [:= :candidate.candidate_type (name candidate-type)])

    (= queue :suggested)
    (conj [:= :dismissal.id nil]
          [:!= :candidate.modeling_status "modeled"])

    (= queue :used-raw)
    (conj [:= :candidate.modeling_status "modeled"])

    (= queue :discarded)
    (conj [:!= :dismissal.id nil]
          [:!= :candidate.modeling_status "modeled"])

    (not (str/blank? search))
    (conj (let [pattern (str "%" (u/lower-case-en search) "%")]
            [:or
             [:like [:lower :candidate.suggested_name] pattern]
             [:like [:lower :candidate.display_name] pattern]
             [:like [:lower :candidate.suggested_description] pattern]
             [:like [:lower :table.name] pattern]
             [:like [:lower :table.display_name] pattern]
             [:like [:lower :table.schema] pattern]
             [:like [:lower :database.name] pattern]]))))

(defn- candidate-order
  []
  ;; Mining materializes a globally unique, deterministic family position for every candidate in a run.
  [[:candidate.family_order :asc]
   [:candidate.family_position :asc]])

(defn- candidate-page
  [run opts]
  (let [{:keys [limit offset]} (paging)
        base-query (merge (candidate-joins)
                          {:where (candidate-where (:id run) opts)})
        total      (:total (t2/query-one
                            (assoc base-query :select [[[:count :candidate.id] :total]])))
        ids        (mapv :id
                         (t2/query
                          (assoc base-query
                                 :select [[:candidate.id :id]]
                                 :order-by (candidate-order)
                                 :limit limit
                                 :offset offset)))
        candidates (if (seq ids)
                     (t2/select-pk->fn
                      identity
                      [:model/UsageMetadataCandidate
                       :id :candidate_type :table_id :signature_version :signature_hash
                       :display_name :semantic_details :modeling_status
                       :verified_source_count :official_source_count :popular_source_count
                       :distinct_source_count :total_view_count]
                      :id [:in ids])
                     {})
        rows       (mapv candidates ids)]
    {:rows rows, :total total, :limit limit, :offset offset}))

(defn- page-response
  [data total limit offset run]
  {:data data
   :total total
   :limit limit
   :offset offset
   :snapshot (snapshot-response run)})

(api.macros/defendpoint :get "/candidates" :- ::candidate-page
  "List mined Library cleanup candidates."
  [_route
   opts :- list-query-schema]
  (api/check-superuser)
  (if-let [run (candidate-service/latest-successful-run)]
    (let [{:keys [rows total limit offset]} (candidate-page run opts)
          dismissals (dismissal-index rows)
          presented  (mapv #(candidate-summary % dismissals) rows)]
      (page-response presented total limit offset run))
    (let [{:keys [limit offset]} (paging)]
      (page-response [] 0 limit offset nil))))

(defn- table-page
  ([run opts]
   (table-page run opts (paging)))
  ([run opts {:keys [limit offset]}]
   (let [base-query (merge (candidate-joins)
                           {:where (candidate-where (:id run) opts)})
         total      (:total (t2/query-one
                             (assoc base-query
                                    :select [[[:count [:distinct :candidate.table_id]] :total]])))
         select     [[:candidate.table_id :table_id]
                     [[:count :candidate.id] :candidate_count]]
         rows       (t2/query
                     (assoc base-query
                            :select select
                            :group-by [:candidate.table_id :table.display_name :table.name]
                            :order-by [[:candidate_count :desc]
                                       [[:lower [:coalesce :table.display_name :table.name]] :asc]
                                       [:candidate.table_id :asc]]
                            :limit limit
                            :offset offset))]
     {:rows rows, :total total, :limit limit, :offset offset})))

(defn- table-summary
  [table row]
  {:table (table-response table)
   :candidate_count (or (:candidate_count row) 0)})

(api.macros/defendpoint :get "/tables" :- ::table-page
  "List physical tables with mined Library cleanup activity."
  [_route
   opts :- list-query-schema]
  (api/check-superuser)
  (if-let [run (candidate-service/latest-successful-run)]
    (let [{:keys [rows total limit offset]} (table-page run opts)
          tables    (table-index (into #{} (map :table_id) rows))
          presented (mapv #(table-summary (tables (:table_id %)) %) rows)]
      (page-response presented total limit offset run))
    (let [{:keys [limit offset]} (paging)]
      (page-response [] 0 limit offset nil))))

(defn- conflict!
  [message reason & [data]]
  (throw (ex-info message (merge {:status-code 409, :reason reason} data))))

(defn- require-current-candidate
  [id]
  (let [candidate (api/check-404 (candidate-service/candidate id))]
    (when-not (candidate-service/candidate-current? candidate)
      (conflict! "Candidate belongs to an obsolete snapshot" :obsolete-snapshot))
    candidate))

(defn- candidate-detail
  [candidate]
  (let [table       ((table-index #{(:table_id candidate)}) (:table_id candidate))
        dismissals  (dismissal-index [candidate])
        sources     (t2/select :model/UsageMetadataCandidateSource
                               :candidate_id (:id candidate)
                               {:order-by [[:card_id :asc]]})
        matches     (t2/select :model/UsageMetadataCandidateMatch
                               :candidate_id (:id candidate)
                               {:order-by [[:id :asc]]})
        dismissal   (dismissals (dismissal-key candidate))
        dependency-paths (into {}
                               (map (juxt :card-id :dependency-paths))
                               (get-in candidate [:semantic_details :source-dependencies]))]
    (assoc (candidate-detail-summary candidate table dismissals)
           :dismissal (some-> dismissal
                              (select-keys [:id :dismissed_by :dismissed_at :reason]))
           :sources (mapv (fn [source]
                            (cond-> (select-keys source [:id :candidate_id :card_id :card_name :card_type
                                                         :verified :official :popular :view_count :joined
                                                         :stage_numbers :model_lineage])
                              (contains? dependency-paths (:card_id source))
                              (assoc :dependency_paths
                                     (mapv (fn [{:keys [direct? models]}]
                                             {:direct direct?, :models models})
                                           (dependency-paths (:card_id source))))))
                          sources)
           :matches (mapv (fn [{:keys [relation measure_id segment_id entity_name entity_description
                                       entity_archived]}]
                            {:relation relation
                             :entity_type (if measure_id :measure :segment)
                             :entity {:id          (or measure_id segment_id)
                                      :name        entity_name
                                      :description entity_description
                                      :archived    entity_archived}})
                          matches))))

(api.macros/defendpoint :get "/candidates/:id" :- ::candidate-detail
  "Return full provenance and Library reconciliation for one candidate."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (candidate-detail (require-current-candidate id)))

(api.macros/defendpoint :post "/candidates/:id/dismiss" :- ::candidate-detail
  "Globally dismiss a semantic candidate."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   {:keys [reason]} :- [:map
                        [:reason {:optional true}
                         [:maybe [:string {:max max-dismissal-reason-length}]]]]]
  (api/check-superuser)
  (let [candidate (require-current-candidate id)]
    (candidate-service/dismiss! candidate api/*current-user-id* reason)
    (candidate-detail candidate)))

(api.macros/defendpoint :delete "/candidates/:id/dismissal" :- ::candidate-detail
  "Restore a globally dismissed semantic candidate."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [candidate (require-current-candidate id)]
    (candidate-service/restore! candidate)
    (candidate-detail candidate)))

(defn- create-candidate!
  [candidate {:keys [name description] :as overrides}]
  (when-not (contains? #{:measure :segment} (:candidate_type candidate))
    (conflict! "This recommendation does not support direct creation" :unsupported-candidate-action))
  (let [table (api/check-404 (t2/select-one :model/Table :id (:table_id candidate)))]
    (when-not (:active table)
      (conflict! "Candidate table is inactive" :table-inactive))
    (when-not (:is_published table)
      (conflict! "Candidate table is not published in the Library" :table-not-published))
    (when-not (table-editable-for-candidate? candidate table)
      (conflict! "Candidate table cannot be edited" :table-uneditable))
    (if-let [existing (candidate-service/exact-existing-entity candidate)]
      (candidate-service/mark-modeled! candidate existing)
      (let [body   {:name        (or name (:suggested_name candidate))
                    :description (if (contains? overrides :description)
                                   description
                                   (:suggested_description candidate))
                    :definition  (:definition candidate)}
            entity (case (:candidate_type candidate)
                     :measure (measures.api/create-measure! body {:publish-event? false})
                     :segment (segments.api/create-segment! body {:publish-event? false}))
            topic  (case (:candidate_type candidate)
                     :measure :event/measure-create
                     :segment :event/segment-create)
            user-id api/*current-user-id*]
        (mdb/do-after-commit
         #(events/publish-event! topic {:object entity :user-id user-id}))
        (candidate-service/mark-modeled! candidate entity)))))

(api.macros/defendpoint :post "/candidates/:id/create" :- ::create-response
  "Create a Measure or Segment from a persisted candidate definition."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- [:map
            [:name        {:optional true}
             [:maybe [:and ms/NonBlankString [:string {:max max-name-length}]]]]
            [:description {:optional true}
             [:maybe [:string {:max max-description-length}]]]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (let [candidate (api/check-404
                     (t2/select-one :model/UsageMetadataCandidate :id id {:for :update}))
          _         (when-not (candidate-service/candidate-current? candidate)
                      (conflict! "Candidate belongs to an obsolete snapshot" :obsolete-snapshot))
          entity    (create-candidate! candidate body)]
      {:candidate (candidate-detail (candidate-service/candidate id))
       :entity    (created-entity-response entity)})))

(api.macros/defendpoint :get "/refresh" :- ::refresh-status
  "Return candidate refresh and snapshot status."
  []
  (api/check-superuser)
  (let [{:keys [snapshot active failure fresh]} (candidate-service/refresh-status)]
    {:snapshot (run-response snapshot)
     :active   (run-response active)
     :failure  (run-response failure)
     :fresh    fresh}))

(api.macros/defendpoint :post "/refresh" :- ::start-refresh-response
  "Queue a candidate refresh."
  []
  (api/check-superuser)
  (if-let [run (candidate-service/queue-refresh! :manual api/*current-user-id*)]
    (do
      (run-refresh-async! run)
      (-> (response/response {:run_id (:id run)})
          (response/status 202)))
    (let [run (candidate-service/active-run)]
      (conflict! "A usage-metadata candidate refresh is already running"
                 :refresh-already-active
                 {:run-id (:id run)}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/usage-metadata` routes."
  (let [handler (api.macros/ns-handler *ns* +auth)]
    (open-api/handler-with-open-api-spec
     (fn [request respond raise]
       (premium-features/assert-has-feature :library (deferred-tru "Library"))
       (handler request respond raise))
     (fn [prefix]
       (open-api/open-api-spec handler prefix)))))
