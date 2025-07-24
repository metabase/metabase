(ns metabase-enterprise.reports.api.run
  "`/api/ee/report/snapshot` routes"
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.core :as queries]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(def ^:private RunResource
  [:map
   [:snapshot_id pos-int?]
   [:card_id pos-int?]])

(def ^:private CardArgs
  [:or
   [:map
    [:report_id {:optional true} pos-int?]
    [:card_id pos-int?]]
   [:map
    [:report_id {:optional true} pos-int?]
    [:name                   ms/NonBlankString]
    [:dataset_query          ms/Map]
    ;; TODO: Make entity_id a NanoID regex schema?
    [:entity_id              {:optional true} [:maybe ms/NonBlankString]]
    [:parameters             {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]
    [:parameter_mappings     {:optional true} [:maybe [:sequential ::parameters.schema/parameter-mapping]]]
    [:description            {:optional true} [:maybe ms/NonBlankString]]
    [:display                ms/NonBlankString]
    [:visualization_settings ms/Map]
    [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
    [:collection_position    {:optional true} [:maybe ms/PositiveInt]]
    [:result_metadata        {:optional true} [:maybe analyze/ResultsMetadata]]
    [:cache_ttl              {:optional true} [:maybe ms/PositiveInt]]
    [:dashboard_id           {:optional true} [:maybe ms/PositiveInt]]
    [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]]])

(defn- snapshot-card
  [card report-id]
  (try
    (impl/do-with-serialization
     (fn [in-fn result-fn]
       (let [capture-rff (fn capture-rff [metadata]
                           (in-fn (assoc metadata
                                         :cache-version 3
                                         :last-ran (t/zoned-date-time)))
                           (fn
                             ([] {:data metadata})
                             ([result]
                              (in-fn (if (map? result)
                                       (->
                                        (m/dissoc-in result [:data :rows])
                                        (m/dissoc-in [:json_query :lib/metadata]))
                                       {}))
                              result)
                             ([result row]
                              (in-fn row)
                              result)))
             make-run (fn [qp _]
                        (fn [query info]
                          (qp (assoc query :info info) capture-rff)))]
         (qp.card/process-query-for-card
          (:id card) :api
          :make-run make-run
          :context :report))

       (t2/insert-returning-pk! :model/ReportRunCardData
                                {:user_id api/*current-user-id*
                                 :report_id report-id
                                 :card_id (:id card)
                                 :data (result-fn)})))

    (catch Exception e
      (throw (ex-info "Error snapshoting card" {:card-id (:id card)} e)))))

(defn- create-and-snapshot-card
  [body]
  (t2/with-transaction [_conn]
    (let [{:keys [id] :as card} (queries/create-card! (assoc body :type :in_report) @api/*current-user*)
          snapshot-id (snapshot-card card (:report_id body))]
      {:snapshot_id snapshot-id :card_id id})))

(api.macros/defendpoint :post "/" :- RunResource
  "Create a new card and and take a snapshot of the data in its query and return the snapshot id t
  TODO(edpaget): Parameters?"
  [_route-params
   _query-params
   body :- CardArgs]
  (if-let [card-id (:card_id body)]
    ;; TODO: check that is already a frozen report card
    (let [card (t2/select-one :model/Card :id card-id)]
      (prn (:type card))
      (api/check-404 card)
      (if (= :in_report (:type card))
        {:snapshot_id (snapshot-card card (:report_id body)) :card_id card-id}
        (create-and-snapshot-card (assoc card :name (trs "Snapshot of {0}" (:name card))))))
    (create-and-snapshot-card body)))

(defn- results-rff
  [rff]
  (fn results-rff
    [metadata]
    (let [rf (rff (dissoc metadata :last-ran :cache-version))]
      (fn
        ([] (rf))
        ([result]
         (rf result))
        ([acc row]
         (if (map? row)
           row
           (rf acc row)))))))

(defn- deserialize-card-data
  "Deserialize the results stored in ReportRunCardData into a response format"
  [^bytes serialized-bytes rff]
  (when serialized-bytes
    (impl/with-reducible-deserialized-results [[metadata reducible-rows] (ByteArrayInputStream. serialized-bytes)]
      (when metadata
        (qp.pipeline/*reduce* (results-rff rff) metadata reducible-rows)))))

(defn- stream-card-data
  [card-id card-data]
  (when card-data
    (let [make-run (fn [_qp export-format]
                     (fn [_query info]
                       (qp.streaming/streaming-response [rff export-format (u/slugify (:card-name info))]
                         (deserialize-card-data card-data rff))))]
      (qp.card/process-query-for-card
       card-id :api
       :make-run make-run
       :context :report))))

(api.macros/defendpoint :get "/:snapshot-id"
  "Stream data for a given snapshot-id"
  [{:keys [snapshot-id]} :- [:map [:snapshot-id pos-int?]]
   _query-params
   _body-params]
  (let [{:keys [card_id data]} (t2/select-one :model/ReportRunCardData :id snapshot-id)]
    (api/check-404 data)
    ;; Deserialize and return the results as regular JSON
    (stream-card-data card_id data)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/report` routes."
  (api.macros/ns-handler *ns* +auth))
