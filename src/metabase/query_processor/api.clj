(ns metabase.query-processor.api
  "/api/dataset endpoints."
  (:refer-clojure :exclude [not-empty get-in])
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.lib.walk.util :as lib.walk.util]
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
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.server.core :as server]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.util.malli.schema :as ms]
   [metabase.util.performance :refer [not-empty get-in]]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [toucan2.core :as t2]))

;;; -------------------------------------------- Running a Query Normally --------------------------------------------

(defn- query->source-card-id
  "Return the ID of the Card used as the \"source\" query of this query, if applicable; otherwise return `nil`. Used so
  `:card-id` context can be passed along with the query so Collections perms checking is done if appropriate. This fn
  is a wrapper for the function of the same name in the QP util namespace; it adds additional permissions checking as
  well."
  [query]
  (when-let [source-card-id (and ((complement #{:internal "internal"}) (:type query))
                                 (some-> query not-empty lib-be/normalize-query lib/primary-source-card-id))]
    (log/infof "Source query for this query is Card %s" (pr-str source-card-id))
    (api/read-check :model/Card source-card-id)
    source-card-id))

(mu/defn- run-streaming-query :- (ms/InstanceOfClass metabase.server.streaming_response.StreamingResponse)
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
                        {:status-code 400, :query query}))))
    ;; store table id trivially iff we get a query with simple source-table
    (let [table-id (get-in query [:query :source-table])]
      (when (int? table-id)
        (events/publish-event! :event/table-read {:object  (t2/select-one :model/Table :id table-id)
                                                  :user-id api/*current-user-id*})))
    ;; add sensible constraints for results limits on our query
    (let [source-card-id (query->source-card-id query) ; This is only set for direct :source-table "card__..."
          source-card    (when source-card-id
                           (t2/select-one [:model/Card :entity_id :result_metadata :type :card_schema] :id source-card-id))
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
                                          (assoc :info info))
                                      rff))
          (qp/process-query (update query :info merge info) rff))))))

(api.macros/defendpoint :post "/"
  :- (server/streaming-response-schema ::qp.schema/query-result)
  "Execute a query and retrieve the results in the usual format. The query will not use the cache."
  [_route-params
   _query-params
   query :- [:map
             [:database {:optional true} [:maybe :int]]]]
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
    visualization-settings        :visualization_settings}
   ;; Support JSON-encoded query and viz settings for backwards compatibility for when downloads used to be triggered by
   ;; `<form>` submissions... see https://metaboat.slack.com/archives/C010L1Z4F9S/p1738003606875659
   :- [:map
       [:query                  [:map
                                 {:decode/api (fn [x]
                                                (cond-> x
                                                  (string? x) json/decode+kw))}]]
       [:visualization_settings {:default {}} [:map
                                               {:decode/api (fn [x]
                                                              (cond-> x
                                                                (string? x) (json/decode viz-setting-key-fn)))}]]
       [:format_rows            {:default false} ms/BooleanValue]
       [:pivot_results          {:default false} ms/BooleanValue]]]
  (let [viz-settings                  (-> visualization-settings
                                          mi/normalize-visualization-settings
                                          mb.viz/norm->db)
        query                         (-> query
                                          (assoc :viz-settings viz-settings)
                                          (dissoc :constraints)
                                          (update :middleware #(-> %
                                                                   (dissoc :add-default-userland-constraints? :js-int-to-string?)
                                                                   (assoc :format-rows?           (or format-rows false)
                                                                          :pivot?                 (or pivot-results false)
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
   query :- [:map
             [:database ms/PositiveInt]
             [:settings {:optional true} [:maybe [:map
                                                  [:include_sensitive_fields {:optional true} :boolean]]]]]]
  (lib-be/with-metadata-provider-cache
    (queries/batch-fetch-query-metadata
     [query]
     (when-some [include-sensitive-fields (get-in query [:settings :include_sensitive_fields])]
       {:include-sensitive-fields? include-sensitive-fields}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/native"
  "Fetch a native version of an MBQL query."
  [_route-params
   _query-params
   {:keys [database pretty] :as query} :- [:map
                                           [:database ms/PositiveInt]
                                           [:pretty   {:default true} [:maybe :boolean]]]]
  (model-persistence/with-persisted-substituion-disabled
    (qp.perms/check-current-user-has-adhoc-native-query-perms query)
    (let [driver (driver.u/database->driver database)
          prettify (partial driver/prettify-native-form driver)
          compiled (qp.compile/compile-with-inline-parameters query)]
      (cond-> compiled
        pretty (update :query prettify)))))

;; Hackathon code imitating a subset of metabase-enterprise.dependencies.native-validation.

(def ^:private source-parse-card-placeholder
  "Placeholder prefix for card template tags (`{{#42}}`) before compiling a native query for source
  extraction. Using a placeholder keeps `compile-with-inline-parameters` from inlining the card's SQL —
  otherwise the SQL parser would report that card's underlying tables as sources of this query."
  "mb_qp_src_card_")

(def ^:private source-parse-table-placeholder
  "Placeholder prefix for table template tags."
  "mb_qp_src_table_")

(defn- substitute-source-template-tags
  "Replace `:type :card` and `:type :table` template tags in a native first stage with placeholder
  identifiers, and drop those tags from `:template-tags`. Returns nil if the SQL already contains a
  placeholder prefix (collision guard)."
  [query]
  (let [stage      (first (:stages query))
        sql        (:native stage)
        ttags      (:template-tags stage)
        card-tags  (into {} (filter #(= (:type (val %)) :card)) ttags)
        table-tags (into {} (filter #(= (:type (val %)) :table)) ttags)]
    (when-not (or (str/includes? sql source-parse-card-placeholder)
                  (str/includes? sql source-parse-table-placeholder))
      (let [sql'           (reduce (fn [s [tag-name tag]]
                                     (str/replace s (str "{{" tag-name "}}")
                                                  (str source-parse-card-placeholder (:card-id tag))))
                                   sql card-tags)
            sql'           (reduce (fn [s [tag-name tag]]
                                     (str/replace s (str "{{" tag-name "}}")
                                                  (str source-parse-table-placeholder (:table-id tag))))
                                   sql' table-tags)
            remaining-tags (into {} (remove #(#{:card :table} (:type (val %)))) ttags)]
        (-> query
            (assoc-in [:stages 0 :native] sql')
            (assoc-in [:stages 0 :template-tags] remaining-tags))))))

(defn- compile-for-source-parsing
  "Compile `query` to a `::lib.schema/native-only-query` suitable for passing to
  `sql-tools/referenced-tables`. Only runs on queries whose first stage is native — for pure MBQL the
  structural walkers in `lib.walk.util` cover every source. Returns nil if the query can't be prepared."
  [query]
  (let [stage0 (first (:stages query))]
    (when (= (:lib/type stage0) :mbql.stage/native)
      (let [ttags               (:template-tags stage0)
            has-card-or-table?  (some #(#{:card :table} (:type %)) (vals ttags))
            substituted         (if has-card-or-table?
                                  (substitute-source-template-tags query)
                                  query)]
        (when substituted
          (let [with-params (lib/add-parameters-for-template-tags substituted)
                compiled    (qp.compile/compile-with-inline-parameters with-params)]
            (lib/native-query with-params (:query compiled))))))))

(defn- native-source-table-ids
  "Extract source table IDs from native SQL (including compiled template-tag substitutions). Returns a
  set of Metabase table IDs. Returns `#{}` for pure MBQL queries and when parsing fails."
  [driver pmbql]
  (try
    (if-let [native-only (compile-for-source-parsing pmbql)]
      (into #{} (keep :table) (sql-tools/referenced-tables driver native-only))
      #{})
    (catch Throwable e
      (log/warnf e "query-sources: native SQL parsing failed; returning structural sources only")
      #{})))

(def ^:private table-source-schema
  [:map
   [:id           ms/PositiveInt]
   [:db_id        ms/PositiveInt]
   [:schema       [:maybe :string]]
   [:name         :string]
   [:display_name :string]])

(def ^:private card-source-schema
  [:map
   [:id           ms/PositiveInt]
   [:name         :string]
   [:display_name :string]])

(api.macros/defendpoint :post "/query-sources"
  :- [:map
      [:tables [:sequential table-source-schema]]
      [:cards  [:sequential card-source-schema]]]
  "Return every source table and source card referenced in a query, across all stages. MBQL stages
  contribute via `:source-table` / `:source-card`; native stages contribute via template tags and via
  raw-SQL table references parsed out of the compiled query."
  [_route-params
   _query-params
   query :- [:map
             [:database ms/PositiveInt]]]
  (api/read-check :model/Database (:database query))
  (request/as-admin
    (lib-be/with-metadata-provider-cache
      (let [mp        (lib-be/application-database-metadata-provider (:database query))
            driver    (driver.u/database->driver (:database query))
            pmbql     (lib/query mp query)
            table-ids (into #{}
                            cat
                            [(lib.walk.util/all-source-table-ids pmbql)
                             (lib.walk.util/all-template-tag-table-ids pmbql)
                             (native-source-table-ids driver pmbql)])
            card-ids  (lib.walk.util/all-source-card-ids pmbql)]
        {:tables (vec
                  (for [t (when (seq table-ids) (lib.metadata/bulk-metadata mp :metadata/table table-ids))]
                    {:id           (:id t)
                     :db_id        (:db-id t)
                     :schema       (:schema t)
                     :name         (:name t)
                     :display_name (or (:display-name t) (:name t))}))
         :cards  (vec
                  (for [c (when (seq card-ids) (lib.metadata/bulk-metadata mp :metadata/card card-ids))]
                    {:id           (:id c)
                     :name         (:name c)
                     :display_name (:name c)}))}))))

(api.macros/defendpoint :post "/pivot"
  :- (server/streaming-response-schema ::qp.schema/query-result)
  "Generate a pivoted dataset for an ad-hoc query"
  [_route-params
   _query-params
   {:keys [database] :as query} :- [:map
                                    [:database ms/PositiveInt]]]
  (api/read-check :model/Database database)
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
