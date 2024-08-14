(ns metabase.api.dataset
  "/api/dataset endpoints."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.api.field :as api.field]
   [metabase.api.query-metadata :as api.query-metadata]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events :as events]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.models.card :refer [Card]]
   [metabase.models.database :as database :refer [Database]]
   [metabase.models.params.custom-values :as custom-values]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.util :as qp.util]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

;;; -------------------------------------------- Running a Query Normally --------------------------------------------

(defn- query->source-card-id
  "Return the ID of the Card used as the \"source\" query of this query, if applicable; otherwise return `nil`. Used so
  `:card-id` context can be passed along with the query so Collections perms checking is done if appropriate. This fn
  is a wrapper for the function of the same name in the QP util namespace; it adds additional permissions checking as
  well."
  [outer-query]
  (when-let [source-card-id (qp.util/query->source-card-id outer-query)]
    (log/infof "Source query for this query is Card %s" (pr-str source-card-id))
    (api/read-check Card source-card-id)
    source-card-id))

(mu/defn ^:private run-streaming-query :- (ms/InstanceOfClass metabase.async.streaming_response.StreamingResponse)
  [{:keys [database], :as query}
   & {:keys [context export-format was-pivot]
      :or   {context       :ad-hoc
             export-format :api}}]
  (span/with-span!
    {:name "run-query-async"}
    (when (and (not= (:type query) "internal")
               (not= database lib.schema.id/saved-questions-virtual-database-id))
      (when-not database
        (throw (ex-info (tru "`database` is required for all queries whose type is not `internal`.")
                        {:status-code 400, :query query})))
      (api/read-check Database database))
    ;; store table id trivially iff we get a query with simple source-table
    (let [table-id (get-in query [:query :source-table])]
      (when (int? table-id)
        (events/publish-event! :event/table-read {:object  (t2/select-one Table :id table-id)
                                                  :user-id api/*current-user-id*})))
    ;; add sensible constraints for results limits on our query
    (let [source-card-id (query->source-card-id query)
          source-card    (when source-card-id
                           (t2/select-one [Card :result_metadata :type] :id source-card-id))
          info           (cond-> {:executed-by api/*current-user-id*
                                  :context     context
                                  :card-id     source-card-id}
                           (= (:type source-card) :model)
                           (assoc :metadata/model-metadata (:result_metadata source-card)))]
      (binding [qp.perms/*card-id* source-card-id]
        (qp.streaming/streaming-response [rff export-format]
          (if was-pivot
            (qp.pivot/run-pivot-query (-> query
                                          (assoc :constraints (qp.constraints/default-query-constraints))
                                          (update :info merge info))
                                      rff)
            (qp/process-query (update query :info merge info) rff)))))))

(api/defendpoint POST "/"
  "Execute a query and retrieve the results in the usual format. The query will not use the cache."
  [:as {{:keys [database] :as query} :body}]
  {database [:maybe :int]}
  (run-streaming-query
   (-> query
       (update-in [:middleware :js-int-to-string?] (fnil identity true))
       qp/userland-query-with-default-constraints)))


;;; ----------------------------------- Downloading Query Results in Other Formats -----------------------------------

(def export-formats
  "Valid export formats for downloading query results."
  (mapv u/qualified-name (qp.streaming/export-formats)))

(def ExportFormat
  "Schema for valid export formats for downloading query results."
  (into [:enum] export-formats))

(mu/defn export-format->context :- ::lib.schema.info/context
  "Return the `:context` that should be used when saving a QueryExecution triggered by a request to download results
  in `export-format`.

    (export-format->context :json) ;-> :json-download"
  [export-format]
  (keyword (str (u/qualified-name export-format) "-download")))

(def export-format-regex
  "Regex for matching valid export formats (e.g., `json`) for queries.
   Inteneded for use in an endpoint definition:

     (api/defendpoint-schema POST [\"/:export-format\", :export-format export-format-regex]"
  (re-pattern (str "(" (str/join "|" (map u/qualified-name (qp.streaming/export-formats))) ")")))

(def ^:private column-ref-regex #"^\[.+\]$")

(defn- viz-setting-key-fn
  "Key function for parsing JSON visualization settings into the DB form. Converts most keys to
  keywords, but leaves column references as strings."
   [json-key]
   (if (re-matches column-ref-regex json-key)
     json-key
     (keyword json-key)))

(api/defendpoint POST ["/:export-format", :export-format export-format-regex]
  "Execute a query and download the result data as a file in the specified format."
  [export-format :as {{:keys [query visualization_settings format_rows]
                       :or   {visualization_settings "{}"}} :params}]
  {query                  ms/JSONString
   visualization_settings ms/JSONString
   format_rows            [:maybe :boolean]
   export-format          (into [:enum] export-formats)}
  (let [{:keys [was-pivot] :as query} (json/parse-string query keyword)
        query                         (dissoc query :was-pivot)
        viz-settings                  (-> (json/parse-string visualization_settings viz-setting-key-fn)
                                          (update :table.columns mbql.normalize/normalize)
                                          mb.viz/db->norm)
        query                         (-> query
                                          (assoc :viz-settings viz-settings)
                                          (dissoc :constraints)
                                          (update :middleware #(-> %
                                                                   (dissoc :add-default-userland-constraints? :js-int-to-string?)
                                                                   (assoc :process-viz-settings? true
                                                                          :skip-results-metadata? true
                                                                          :format-rows? format_rows))))]
    (run-streaming-query
     (qp/userland-query query)
     :export-format export-format
     :context      (export-format->context export-format)
     :was-pivot    was-pivot)))

;;; ------------------------------------------------ Other Endpoints -------------------------------------------------

(api/defendpoint POST "/query_metadata"
  "Get all of the required query metadata for an ad-hoc query."
  [:as {{:keys [database] :as query} :body}]
  {database ms/PositiveInt}
  (api.query-metadata/batch-fetch-query-metadata [query]))

(api/defendpoint POST "/native"
  "Fetch a native version of an MBQL query."
  [:as {{:keys [database pretty] :as query} :body}]
  {database ms/PositiveInt
   pretty  [:maybe :boolean]}
  (binding [persisted-info/*allow-persisted-substitution* false]
    (qp.perms/check-current-user-has-adhoc-native-query-perms query)
    (let [driver (driver.u/database->driver database)
          prettify (partial driver/prettify-native-form driver)
          compiled (qp.compile/compile-and-splice-parameters query)]
      (cond-> compiled
        (not (false? pretty)) (update :query prettify)))))

(api/defendpoint POST "/pivot"
  "Generate a pivoted dataset for an ad-hoc query"
  [:as {{:keys [database] :as query} :body}]
  {database [:maybe ms/PositiveInt]}
  (when-not database
    (throw (Exception. (str (tru "`database` is required for all queries.")))))
  (api/read-check Database database)
  (let [info {:executed-by api/*current-user-id*
              :context     :ad-hoc}]
    (qp.streaming/streaming-response [rff :api]
      (qp.pivot/run-pivot-query (assoc query
                                       :constraints (qp.constraints/default-query-constraints)
                                       :info        info)
                                rff)
      query)))

(defn- parameter-field-values
  [field-ids query]
  (when-not (seq field-ids)
    (throw (ex-info (tru "Missing field-ids for parameter")
                    {:status-code 400})))
  (-> (reduce (fn [resp id]
                (let [{values :values more? :has_more_values} (api.field/search-values-from-field-id id query)]
                  (-> resp
                      (update :values concat values)
                      (update :has_more_values #(or % more?)))))
              {:has_more_values false
               :values          []}
              field-ids)
      ;; deduplicate the values returned from multiple fields
      (update :values (comp vec set))))

(defn parameter-values
  "Fetch parameter values. Parameter should be a full parameter, field-ids is an optional vector of field ids, only
  consulted if `:values_source_type` is nil. Query is an optional string return matching field values not all."
  [parameter field-ids query]
  (custom-values/parameter->values
    parameter query
    (fn [] (parameter-field-values field-ids query))))

(api/defendpoint POST "/parameter/values"
  "Return parameter values for cards or dashboards that are being edited."
  [:as {{:keys [parameter field_ids]} :body}]
  {parameter ms/Parameter
   field_ids [:maybe [:sequential ms/PositiveInt]]}
  (parameter-values parameter field_ids nil))

(api/defendpoint POST "/parameter/search/:query"
  "Return parameter values for cards or dashboards that are being edited. Expects a query string at `?query=foo`."
  [query :as {{:keys [parameter field_ids]} :body}]
  {parameter ms/Parameter
   field_ids [:maybe [:sequential ms/PositiveInt]]
   query     ms/NonBlankString}
  (parameter-values parameter field_ids query))

(api/define-routes)
