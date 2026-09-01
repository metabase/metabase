(ns metabase.query-processor.api
  "/api/dataset endpoints."
  (:refer-clojure :exclude [get-in select-keys])
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.models.interface :as mi]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.parameters.field :as parameters.field]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.core :as queries]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.server.core :as server]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   ;; defendpoint param schemas (ms/PositiveInt etc.); lib.schema has no API-param coercion schemas
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.util.malli.schema :as ms]
   [metabase.util.performance :refer [get-in select-keys]]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   ;; endpoint side effects: table-read events and source-card lookups hit the app db directly
   ^{:clj-kondo/ignore [:discouraged-namespace]} [toucan2.core :as t2]))

;;; -------------------------------------------- Running a Query Normally --------------------------------------------

(defn- query->source-card-id
  "Return the ID of the Card used as the \"source\" query of this query, if applicable; otherwise return `nil`. Used so
  `:card-id` context can be passed along with the query so Collections perms checking is done if appropriate. This fn
  is a wrapper for the function of the same name in the QP util namespace; it adds additional permissions checking as
  well."
  [query]
  (when-let [source-card-id (lib/primary-source-card-id query)]
    (log/infof "Source query for this query is Card %s" (pr-str source-card-id))
    (api/read-check :model/Card source-card-id)
    source-card-id))

(mu/defn- run-streaming-query :- (ms/InstanceOfClass metabase.server.streaming_response.StreamingResponse)
  [query :- [:or ::lib.schema/query ::lib-be.schema/internal-query]
   & {:keys [context export-format was-pivot]
      :or   {context       :ad-hoc
             export-format :api}}]
  (span/with-span!
    {:name "run-query-async"}
    ;; store table id trivially iff we get a query with simple source-table
    (let [table-id (when (= (lib/normalized-query-type query) :mbql/query)
                     (lib/primary-source-table-id query))]
      (when (int? table-id)
        (events/publish-event! :event/table-read {:object  (t2/select-one :model/Table 'id table-id)
                                                  :user-id api/*current-user-id*})))
    ;; add sensible constraints for results limits on our query
    (let [source-card-id (when (= (lib/normalized-query-type query) :mbql/query)
                           (query->source-card-id query))
          source-card    (when source-card-id
                           (t2/select-one [:model/Card 'entity_id 'result_metadata 'type 'card_schema] 'id source-card-id))
          info           (cond-> {:executed-by api/*current-user-id*
                                  :context     context
                                  :card-id     source-card-id}
                           (= (:type source-card) :model)
                           (assoc :metadata/model-metadata (:result_metadata source-card)))]
      (qp.streaming/streaming-response [rff export-format]
        (if was-pivot
          (let [constraints (if (= export-format :api)
                              (qp.constraints/default-query-constraints)
                              (:constraints query))]
            (qp.pivot/run-pivot-query (-> query
                                          (assoc :constraints constraints)
                                          ;; Use assoc rather than merge so :info comes entirely from the
                                          ;; server-built map. :info carries :card-id and similar fields the
                                          ;; server derives, so we replace it rather than combining it with
                                          ;; whatever was on the incoming query.
                                          (assoc :info info))
                                      rff))
          (qp/process-query (assoc query :info info) rff))))))

(api.macros/defendpoint :post "/"
  :- (server/streaming-response-schema ::qp.schema/query-result)
  "Execute a query and retrieve the results in the usual format. The query will not use the cache."
  [_route-params
   _query-params
   query :- ::lib-be.schema/maybe-legacy-or-internal-query]
  (run-streaming-query
   (-> query
       (update-in [:middleware :js-int-to-string?] (fnil identity true))
       qp/userland-query-with-default-constraints)))

;;; ----------------------------------- Downloading Query Results in Other Formats -----------------------------------

(mu/defn export-format->context :- ::lib.schema.info/context
  "Return the `:context` that should be used when saving a QueryExecution triggered by a request to download results
  in `export-format`.

    (export-format->context :json) ;-> :json-download"
  [export-format]
  (keyword (str (u/qualified-name export-format) "-download")))

(def ^:private column-ref-regex #"^\[.+\]$")

(defn- viz-setting-key-fn
  "Key function for parsing JSON visualization settings into the DB form. Converts most keys to
  keywords, but leaves column references as strings."
  [json-key]
  (if (re-matches column-ref-regex json-key)
    json-key
    (keyword json-key)))

(api.macros/defendpoint :post ["/:export-format", :export-format qp.schema/export-formats-regex]
  :- (server/streaming-response-schema ::qp.schema/query-result)
  "Execute a query and download the result data as a file in the specified format."
  [{:keys [export-format]} :- [:map
                               [:export-format ::qp.schema/export-format]]
   _query-params
   {{:keys [was-pivot] :as query} :query
    format-rows                   :format_rows
    pivot-results                 :pivot_results
    csv-include-bom               :csv_include_bom
    visualization-settings        :visualization_settings}
   ;; Support JSON-encoded query and viz settings for backwards compatibility for when downloads used to be triggered by
   ;; `<form>` submissions... see https://metaboat.slack.com/archives/C010L1Z4F9S/p1738003606875659
   :- [:map
       [:query                  [:schema
                                 {:decode/api (fn [x]
                                                (cond-> x
                                                  (string? x) json/decode))}
                                 ::lib-be.schema/maybe-legacy-or-internal-query]]
       [:visualization_settings {:default {}} [:map
                                               {:closed     false
                                                :decode/api (fn [x]
                                                              (cond-> x
                                                                (string? x) (json/decode viz-setting-key-fn)))}]]
       [:format_rows            {:default false} ms/BooleanValue]
       [:pivot_results          {:default false} ms/BooleanValue]
       [:csv_include_bom         {:default false} ms/BooleanValue]]]
  (let [viz-settings                  (-> visualization-settings
                                          mi/normalize-visualization-settings
                                          mb.viz/norm->db)
        query                         (-> query
                                          (dissoc :constraints)
                                          (assoc :viz-settings viz-settings)
                                          (update :middleware #(-> %
                                                                   (select-keys [:ignore-cached-results?])
                                                                   (assoc :format-rows?           (or format-rows false)
                                                                          :pivot?                 (or pivot-results false)
                                                                          :csv-include-bom?       (if (some? csv-include-bom) csv-include-bom false)
                                                                          :process-viz-settings?  true
                                                                          :skip-results-metadata? true))))]
    (run-streaming-query
     (qp/userland-query query)
     :export-format export-format
     :context      (export-format->context export-format)
     :was-pivot    was-pivot)))

;;; ------------------------------------------------ Other Endpoints -------------------------------------------------

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/query_metadata"
  "Get all of the required query metadata for an ad-hoc query.

  You can pass `{:settings {:include-sensitive-fields true}}` in the query to include fields with
  visibility_type :sensitive in the response."
  [_route-params
   _query-params
   query :- ::lib-be.schema/maybe-legacy-query]
  (queries/batch-fetch-query-metadata
   [query]
   (when-some [include-sensitive-fields (get-in query [:settings :include-sensitive-fields])]
     {:include-sensitive-fields? include-sensitive-fields})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/native"
  "Fetch a native version of an MBQL query."
  [_route-params
   _query-params
   {:keys [database pretty] :as query} :- [:map {:closed false}
                                           [:database ms/PositiveInt]
                                           [:pretty   {:default true} [:maybe :boolean]]]]
  (model-persistence/with-persisted-substituion-disabled
    (let [query (-> (lib-be/normalize-query (dissoc query :pretty))
                    (dissoc :constraints :middleware)
                    lib/disable-default-limit)]
      (qp.perms/check-current-user-has-adhoc-native-query-perms query)
      (qp.setup/with-qp-setup [query query]
        (binding [driver/*compile-with-inline-parameters* true]
          ;; Preprocess once, then run the same permission checks the run path (execute chain) runs, so both
          ;; endpoints agree on which referenced cards and tables the caller may use. Preprocessing resolves
          ;; `card__N` source tables and card/snippet template tags, so the referenced entities are known by
          ;; the time we check.
          (let [preprocessed (qp.preprocess/preprocess query)]
            (try
              (qp.perms/check-query-permissions* preprocessed)
              (catch clojure.lang.ExceptionInfo e
                (throw (if (:permissions-error? (ex-data e))
                         (ex-info (ex-message e) (assoc (ex-data e) :status-code 403) e)
                         e))))
            (let [compiled (qp.compile/compile-preprocessed preprocessed)
                  driver (driver.u/database->driver database)]
              ;; Return only the compiled query and its params, not the internal keys the compiler carries
              ;; through (e.g. :lib/type, :query-permissions/referenced-card-ids).
              (-> (select-keys compiled [:query :params])
                  (cond-> pretty (update :query #(driver/prettify-native-form driver %)))))))))))

(api.macros/defendpoint :post "/pivot"
  :- (server/streaming-response-schema ::qp.schema/query-result)
  "Generate a pivoted dataset for an ad-hoc query"
  [_route-params
   _query-params
   {:keys [database] :as query} :- ::lib-be.schema/maybe-legacy-query]
  (api/read-check :model/Database database)
  (let [info {:executed-by api/*current-user-id*
              :context     :ad-hoc}]
    (qp.streaming/streaming-response [rff :api]
      (qp.pivot/run-pivot-query (assoc (update query :middleware select-keys [:js-int-to-string? :ignore-cached-results?])
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
                (let [{values :values more? :has_more_values} (parameters.field/search-values-from-field-id id query)]
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/parameter/values"
  "Return parameter values for cards or dashboards that are being edited."
  [_route-params
   _query-params
   {:keys     [parameter]
    field-ids :field_ids} :- [:map
                              [:parameter ::parameters.schema/parameter]
                              [:field_ids {:optional true} [:maybe [:sequential ::lib.schema.id/field]]]]]
  (parameter-values parameter field-ids nil))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/parameter/search/:query"
  "Return parameter values for cards or dashboards that are being edited. Expects a query string at `?query=foo`."
  [{:keys [query]} :- [:map
                       [:query ms/NonBlankString]]
   _query-params
   {:keys     [parameter]
    field-ids :field_ids} :- [:map
                              [:parameter ::parameters.schema/parameter]
                              [:field_ids {:optional true} [:maybe [:sequential ::lib.schema.id/field]]]]]
  (parameter-values parameter field-ids query))

(defn param-remapped-value
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of `card`."
  [[field-id :as field-ids] param value]
  (or (custom-values/parameter-remapped-value
       param
       value
       #(-> (if (= (count field-ids) 1)
              (chain-filter/chain-filter field-id [{:field-id field-id, :op :=, :value value}] :limit 1)
              (when-let [pk-field-id (custom-values/pk-of-fk-pk-field-ids field-ids)]
                (chain-filter/chain-filter pk-field-id [{:field-id pk-field-id, :op :=, :value value}] :limit 1)))
            :values
            first))
      [value]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/parameter/remapping"
  "Return the remapped parameter values for cards or dashboards that are being edited."
  [_route-params
   _query-params
   {:keys [parameter value field_ids]} :- [:map
                                           [:parameter ::parameters.schema/parameter]
                                           [:value :any]
                                           [:field_ids {:optional true} [:maybe [:sequential ::lib.schema.id/field]]]]]
  (param-remapped-value field_ids parameter value))
