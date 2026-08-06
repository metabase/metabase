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
   [metabase.usage-metadata.candidates :as candidates]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-limit 50)
(def ^:private max-limit 200)
(def ^:private max-search-length 254)
(def ^:private max-name-length 254)
(def ^:private max-description-length 10000)
(def ^:private max-dismissal-reason-length 1000)

(defn- run-refresh-async!
  "TEMPORARY: run a manual refresh without Quartz so it works when the scheduler is disabled."
  [run]
  (u.jvm/in-virtual-thread*
   (try
     (candidates/run-refresh! run)
     (catch Exception e
       (log/error e "Manual usage-metadata candidate refresh failed")
       (throw e)))))

(defn- paging
  []
  (let [limit (or (request/limit) default-limit)]
    (api/check-400 (<= limit max-limit) "limit must not exceed 200")
    {:limit limit, :offset (or (request/offset) 0)}))

(defn- snapshot-response
  [run]
  (when run
    (select-keys run [:id :finished_at :algorithm_version :summary])))

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
                             :data_layer :data_authority :view_count :active :visibility_type
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

(defn- presented-atom
  [{:keys [signature display-name kind]}]
  {:signature    signature
   :display_name display-name
   :kind         kind})

(defn- candidate-presentation
  [{:keys [candidate_type semantic_details]}]
  (let [predicates (:display-atoms semantic_details)]
    (cond-> {:predicates (mapv presented-atom predicates)}
      (= candidate_type :measure)
      (assoc :aggregation {:display_name (:base-name semantic_details)}))))

(defn- candidate-summary
  [candidate table dismissals]
  (let [creation-candidate? (contains? #{:measure :segment} (:candidate_type candidate))
        editable?           (and creation-candidate?
                                 (table-editable-for-candidate? candidate table))]
    {:id                    (:id candidate)
     :candidate_type        (:candidate_type candidate)
     :table                 (assoc (select-keys table [:id :db_id :schema :name :display_name :description
                                                       :data_layer :data_authority :view_count :is_published
                                                       :collection_id])
                                   :database (:database table))
     :display_name          (:display_name candidate)
     :suggested_name        (:suggested_name candidate)
     :suggested_description (:suggested_description candidate)
     :required_tables       (or (:required-tables (:semantic_details candidate)) [])
     :presentation          (candidate-presentation candidate)
     :family                {:key      (:family_key candidate)
                             :position (:family_position candidate)
                             :depth    (:family_depth candidate)}
     :definition            (:definition candidate)
     :modeling_status       (:modeling_status candidate)
     :dismissed             (dismissed? dismissals candidate)
     :evidence              {:verified_source_count (:verified_source_count candidate)
                             :official_source_count (:official_source_count candidate)
                             :popular_source_count (:popular_source_count candidate)
                             :distinct_source_count (:distinct_source_count candidate)
                             :total_view_count (:total_view_count candidate)}
     :creation_blockers     (cond-> []
                              (and creation-candidate? (not (:is_published table)))
                              (conj :table-not-published)

                              (and creation-candidate? (not (:active table)))
                              (conj :table-inactive)

                              (and creation-candidate? (not editable?))
                              (conj :table-uneditable))}))

(def ^:private list-query-schema
  [:map
   [:table-id        {:optional true} [:maybe ms/PositiveInt]]
   [:database-id     {:optional true} [:maybe ms/PositiveInt]]
   [:schema          {:optional true} [:maybe :string]]
   [:candidate-type  {:optional true} [:maybe [:enum :table :metric :measure :segment]]]
   [:modeling-status {:optional true} [:maybe [:enum :missing :partially-modeled :modeled]]]
   [:signal          {:optional true} [:maybe [:enum :verified :official :popular]]]
   [:queue           {:default :suggested} [:enum :suggested :used-raw :discarded]]
   [:search          {:optional true} [:maybe [:string {:max max-search-length}]]]
   [:sort            {:default :priority} [:enum :priority :name :source-count :view-count]]
   [:direction       {:default :asc} [:enum :asc :desc]]])

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
  [run-id {:keys [table-id database-id schema candidate-type modeling-status signal queue search]}]
  (cond-> [:and [:= :candidate.run_id run-id]]
    table-id
    (conj [:= :candidate.table_id table-id])

    database-id
    (conj [:= :table.db_id database-id])

    schema
    (conj [:= :table.schema schema])

    candidate-type
    (conj [:= :candidate.candidate_type (name candidate-type)])

    modeling-status
    (conj [:= :candidate.modeling_status (name modeling-status)])

    signal
    (conj [:> (case signal
                :verified :candidate.verified_source_count
                :official :candidate.official_source_count
                :popular  :candidate.popular_source_count)
           0])

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

(defn- reverse-direction
  [direction]
  (if (= direction :asc) :desc :asc))

(defn- candidate-order
  [sort-column direction]
  (let [ordered (case sort-column
                  :name
                  [[[:lower :candidate.display_name] :asc]]

                  :source-count
                  [[:candidate.distinct_source_count :desc]]

                  :view-count
                  [[:candidate.total_view_count :desc]]

                  ;; Preserve the miner's ordering exactly: presence of verified
                  ;; and official evidence is binary; source count then breaks ties.
                  ;; Recommendation families inherit the priority of their strongest member,
                  ;; then use a deterministic parent-first traversal inside the family.
                  [[:candidate.family_order :asc]
                   [:candidate.family_position :asc]
                   [[:case [:> :candidate.verified_source_count 0] [:inline 0] :else [:inline 1]] :asc]
                   [[:case [:> :candidate.official_source_count 0] [:inline 0] :else [:inline 1]] :asc]
                   [:candidate.distinct_source_count :desc]
                   [:candidate.complexity :asc]
                   [:candidate.total_view_count :desc]
                   [:candidate.signature :asc]])
        ordered (if (= direction :desc)
                  (mapv (fn [[column column-direction]]
                          [column (reverse-direction column-direction)])
                        ordered)
                  ordered)]
    (conj ordered [:candidate.id (if (= direction :desc) :desc :asc)])))

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
                                 :order-by (candidate-order (:sort opts) (:direction opts))
                                 :limit limit
                                 :offset offset)))
        candidates (if (seq ids)
                     (t2/select-pk->fn identity :model/UsageMetadataCandidate :id [:in ids])
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

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/candidates"
  "List mined Library cleanup candidates."
  [_route
   {:keys [sort direction] :as opts} :- list-query-schema]
  (api/check-superuser)
  (if-let [run (candidates/latest-successful-run)]
    (let [{:keys [rows total limit offset]} (candidate-page run (assoc opts :sort sort :direction direction))
          tables     (table-index (into #{} (map :table_id) rows))
          dismissals (dismissal-index rows)
          presented  (mapv #(candidate-summary % (tables (:table_id %)) dismissals) rows)]
      (page-response presented total limit offset run))
    (let [{:keys [limit offset]} (paging)]
      (page-response [] 0 limit offset nil))))

(defn- conditional-count-expression
  [predicate]
  [:sum
   [:case
    predicate
    [:inline 1]
    :else [:inline 0]]])

(defn- status-count-expression
  ([candidate-type modeling-status]
   (status-count-expression candidate-type modeling-status nil))
  ([candidate-type modeling-status extra-predicate]
   (conditional-count-expression
    (cond-> [:and
             [:= :candidate.candidate_type (name candidate-type)]
             [:= :candidate.modeling_status (name modeling-status)]]
      extra-predicate (conj extra-predicate)))))

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
                     [[:count :candidate.id] :candidate_count]
                     [(status-count-expression :table :missing) :table_missing]
                     [(status-count-expression :metric :missing) :metric_missing]
                     [(status-count-expression :measure :missing) :measure_missing]
                     [(status-count-expression :measure :partially-modeled) :measure_partially_modeled]
                     [(status-count-expression :measure :modeled) :measure_modeled]
                     [(status-count-expression :segment :missing) :segment_missing]
                     [(status-count-expression :segment :partially-modeled) :segment_partially_modeled]
                     [(status-count-expression :segment :modeled) :segment_modeled]]
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

(defn- table-detail-count-row
  [run-id table-id]
  (let [suggested? [:and
                    [:= :dismissal.id nil]
                    [:!= :candidate.modeling_status "modeled"]]
        discarded? [:and
                    [:!= :dismissal.id nil]
                    [:!= :candidate.modeling_status "modeled"]]
        select     [[(conditional-count-expression suggested?) :candidate_count]
                    [(status-count-expression :table :missing suggested?) :table_missing]
                    [(status-count-expression :metric :missing suggested?) :metric_missing]
                    [(status-count-expression :measure :missing suggested?) :measure_missing]
                    [(status-count-expression :measure :partially-modeled suggested?) :measure_partially_modeled]
                    [(status-count-expression :measure :modeled suggested?) :measure_modeled]
                    [(status-count-expression :segment :missing suggested?) :segment_missing]
                    [(status-count-expression :segment :partially-modeled suggested?) :segment_partially_modeled]
                    [(status-count-expression :segment :modeled suggested?) :segment_modeled]
                    [(conditional-count-expression discarded?) :dismissed_count]]]
    (t2/query-one
     (merge (candidate-joins)
            {:select select
             :where [:and
                     [:= :candidate.run_id run-id]
                     [:= :candidate.table_id table-id]]}))))

(defn- table-summary
  [table row]
  (let [{:keys [candidate_count
                table_missing metric_missing
                measure_missing measure_partially_modeled measure_modeled
                segment_missing segment_partially_modeled segment_modeled]} row]
    {:table (dissoc table :collection)
     :counts {:table {:missing (or table_missing 0)
                      :partially-modeled 0
                      :modeled 0}
              :metric {:missing (or metric_missing 0)
                       :partially-modeled 0
                       :modeled 0}
              :measure {:missing (or measure_missing 0)
                        :partially-modeled (or measure_partially_modeled 0)
                        :modeled (or measure_modeled 0)}
              :segment {:missing (or segment_missing 0)
                        :partially-modeled (or segment_partially_modeled 0)
                        :modeled (or segment_modeled 0)}}
     :candidate_count (or candidate_count 0)}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tables"
  "List physical tables with mined Library cleanup activity."
  [_route
   opts :- list-query-schema]
  (api/check-superuser)
  (if-let [run (candidates/latest-successful-run)]
    (let [{:keys [rows total limit offset]} (table-page run opts)
          tables    (table-index (into #{} (map :table_id) rows))
          presented (mapv #(table-summary (tables (:table_id %)) %) rows)]
      (page-response presented total limit offset run))
    (let [{:keys [limit offset]} (paging)]
      (page-response [] 0 limit offset nil))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tables/:id"
  "Return one table's cleanup summary and publication readiness."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [table         (api/check-404 ((table-index #{id}) id))
        run           (candidates/latest-successful-run)
        count-row     (when run (table-detail-count-row (:id run) id))
        summary       (table-summary table count-row)
        editable?     (table-editable-for-candidate? {:candidate_type :measure} table)]
    (-> summary
        (assoc :table (assoc (:table summary)
                             :publication_ready (and (:is_published table) editable?)
                             :creation_blockers (cond-> []
                                                  (not (:is_published table)) (conj :table-not-published)
                                                  (not (:active table))       (conj :table-inactive)
                                                  (not editable?)             (conj :table-uneditable)))
               :dismissed_count (or (:dismissed_count count-row) 0)
               :snapshot (snapshot-response run)))))

(defn- require-current-candidate
  [id]
  (let [candidate (api/check-404 (candidates/candidate id))]
    (when-not (candidates/candidate-current? candidate)
      (throw (ex-info "Candidate belongs to an obsolete snapshot"
                      {:status-code 409, :reason :obsolete-snapshot})))
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
        measure-ids (into #{} (keep :measure_id) matches)
        segment-ids (into #{} (keep :segment_id) matches)
        measures    (if (seq measure-ids)
                      (t2/select-pk->fn identity [:model/Measure :id :name :description :archived]
                                        :id [:in measure-ids])
                      {})
        segments    (if (seq segment-ids)
                      (t2/select-pk->fn identity [:model/Segment :id :name :description :archived]
                                        :id [:in segment-ids])
                      {})
        dismissal   (dismissals (dismissal-key candidate))
        dependency-paths (into {}
                               (map (juxt :card-id :dependency-paths))
                               (get-in candidate [:semantic_details :source-dependencies]))]
    (assoc (candidate-summary candidate table dismissals)
           :definition (:definition candidate)
           :semantic_details (:semantic_details candidate)
           :dismissal (some-> dismissal
                              (select-keys [:id :dismissed_by :dismissed_at :reason]))
           :sources (mapv (fn [source]
                            (cond-> source
                              (contains? dependency-paths (:card_id source))
                              (assoc :dependency_paths (dependency-paths (:card_id source)))))
                          sources)
           :matches (mapv (fn [{:keys [relation measure_id segment_id]}]
                            {:relation relation
                             :entity_type (if measure_id :measure :segment)
                             :entity (if measure_id (measures measure_id) (segments segment_id))})
                          matches))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/candidates/:id"
  "Return full provenance and Library reconciliation for one candidate."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (candidate-detail (require-current-candidate id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/candidates/:id/dismiss"
  "Globally dismiss a semantic candidate."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   {:keys [reason]} :- [:map
                        [:reason {:optional true}
                         [:maybe [:string {:max max-dismissal-reason-length}]]]]]
  (api/check-superuser)
  (let [candidate (require-current-candidate id)]
    (candidates/dismiss! candidate api/*current-user-id* reason)
    (candidate-detail candidate)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/candidates/:id/dismissal"
  "Restore a globally dismissed semantic candidate."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [candidate (require-current-candidate id)]
    (candidates/restore! candidate)
    (candidate-detail candidate)))

(defn- create-candidate!
  [candidate {:keys [name description] :as overrides}]
  (when-not (contains? #{:measure :segment} (:candidate_type candidate))
    (throw (ex-info "This recommendation does not support direct creation"
                    {:status-code 409, :reason :unsupported-candidate-action})))
  (let [table (api/check-404 (t2/select-one :model/Table :id (:table_id candidate)))]
    (when-not (:active table)
      (throw (ex-info "Candidate table is inactive"
                      {:status-code 409, :reason :table-inactive})))
    (when-not (:is_published table)
      (throw (ex-info "Candidate table is not published in the Library"
                      {:status-code 409, :reason :table-not-published})))
    (when-not (table-editable-for-candidate? candidate table)
      (throw (ex-info "Candidate table cannot be edited"
                      {:status-code 409, :reason :table-uneditable})))
    (if-let [existing (candidates/exact-existing-entity candidate)]
      (candidates/mark-modeled! candidate existing)
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
        (candidates/mark-modeled! candidate entity)))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/candidates/:id/create"
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
          _         (when-not (candidates/candidate-current? candidate)
                      (throw (ex-info "Candidate belongs to an obsolete snapshot"
                                      {:status-code 409, :reason :obsolete-snapshot})))
          entity    (create-candidate! candidate body)]
      {:candidate (candidate-detail (candidates/candidate id))
       :entity    entity})))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/refresh"
  "Return candidate refresh and snapshot status."
  []
  (api/check-superuser)
  (candidates/refresh-status))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/refresh"
  "Queue a candidate refresh."
  []
  (api/check-superuser)
  (if-let [run (candidates/queue-refresh! :manual api/*current-user-id*)]
    (do
      (run-refresh-async! run)
      {:status 202
       :headers {}
       :body {:run_id (:id run)}})
    (let [run (candidates/active-run)]
      (throw (ex-info "A usage-metadata candidate refresh is already running"
                      {:status-code 409, :run-id (:id run)})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/usage-metadata` routes."
  (let [handler (api.macros/ns-handler *ns* +auth)]
    (open-api/handler-with-open-api-spec
     (fn [request respond raise]
       (premium-features/assert-has-feature :library (deferred-tru "Library"))
       (handler request respond raise))
     (fn [prefix]
       (open-api/open-api-spec handler prefix)))))
