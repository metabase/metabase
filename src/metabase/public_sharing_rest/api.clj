(ns metabase.public-sharing-rest.api
  "Metabase API endpoints for viewing publicly-accessible Cards and Dashboards."
  (:require
   [hiccup.core :as hiccup]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.dashboards-rest.api :as api.dashboard]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.models.interface :as mi]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.parameters.params :as params]
   [metabase.public-sharing.validation :as public-sharing.validation]
   [metabase.queries.core :as queries]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.tiles.api :as api.tiles]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [throttle.core :as throttle]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private ^:const ^Integer default-embed-max-height 800)
(def ^:private ^:const ^Integer default-embed-max-width 1024)

;;; -------------------------------------------------- Public Cards --------------------------------------------------

(defn combine-parameters-and-template-tags
  "Update `card.parameters` to include parameters from template-tags.

  On native queries parameters exists in 2 forms:
  - parameters
  - dataset_query.native.template-tags

  In most cases, these 2 are sync, meaning, if you have a template-tag, there will be a parameter.
  However, since card.parameters is a recently added feature, there may be instances where a template-tag
  is not present in the parameters.
  This function ensures that all template-tags are converted to parameters and added to card.parameters."
  [card]
  (assoc card :parameters (qp.card/combined-parameters-and-template-tags card)))

(defn remove-card-non-public-columns
  "Remove everything from public `card` that shouldn't be visible to the general public.

  This function is used by both OSS (for public cards) and EE (for cards in public documents) to ensure
  consistent filtering of sensitive fields across all public sharing endpoints."
  [card]
  ;; We need to check this to resolve params - we set `request/as-admin` there
  (if qp.perms/*param-values-query*
    card
    (mi/instance
     :model/Card
     (-> card
         (select-keys [:id :name :description :display :visualization_settings :parameters :entity_id :dataset_query])
         (update :dataset_query select-keys [:lib/metadata :lib/type :database :stages])))))

(defn public-card
  "Return a public Card matching key-value `conditions`, removing all columns that should not be visible to the general
  public. Throws a 404 if the Card doesn't exist."
  [& conditions]
  (binding [params/*ignore-current-user-perms-and-return-all-field-values* true]
    (-> (api/check-404 (apply t2/select-one [:model/Card :id :dataset_query :description :display :name :parameters
                                             :visualization_settings :card_schema]
                              :archived false, conditions))
        remove-card-non-public-columns
        combine-parameters-and-template-tags
        (t2/hydrate :param_fields))))

(defn- card-with-uuid [uuid] (public-card :public_uuid uuid))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:uuid"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (card-with-uuid uuid))

(defmulti ^:private transform-qp-result
  "Transform results to be suitable for a public endpoint"
  {:arglists '([results])}
  :status)

(defmethod transform-qp-result :default
  [x]
  x)

(defmethod transform-qp-result :completed
  [results]
  (u/select-nested-keys
   results
   [[:data :cols :rows :rows_truncated :insights :requested_timezone :results_timezone]
    [:json_query :parameters]
    :status]))

(defmethod transform-qp-result :failed
  [{error-type :error_type, :as results}]
  ;; if the query failed instead, unless the error type is specified and is EXPLICITLY allowed to be shown for embeds,
  ;; instead of returning anything about the query just return a generic error message
  (merge
   (select-keys results [:status :error :error_type])
   (when-not (qp.error-type/show-in-embeds? error-type)
     {:error (tru "An error occurred while running the query.")})))

(defn- process-query-for-card-with-id-run-fn
  "Create the `:make-run` function used for [[process-query-for-card-with-id]] and [[process-query-for-dashcard]]."
  [qp export-format]
  (fn run [query info]
    (qp.streaming/streaming-response [rff export-format (qp.streaming/safe-filename-prefix (:card-name info))]
      (binding [qp.pipeline/*result* (comp qp.pipeline/*result* transform-qp-result)]
        (request/as-admin
          (qp (update query :info merge info) rff))))))

(mu/defn- export-format->context :- ::lib.schema.info/context
  [export-format :- [:maybe :keyword]]
  (case (keyword export-format)
    :csv  :public-csv-download
    :xlsx :public-xlsx-download
    :json :public-json-download
    :public-question))

(mu/defn process-query-for-card-with-id
  "Run the query belonging to Card with `card-id` with `parameters` and other query options (e.g. `:constraints`).
  Returns a `StreamingResponse` object that should be returned as the result of an API endpoint."
  [card-id :- ::lib.schema.id/card
   export-format
   parameters
   & {:keys [qp]
      :or   {qp qp.card/process-query-for-card-default-qp}
      :as   options}]
  ;; run this query with full superuser perms
  ;;
  ;; we actually need to bind the current user perms here twice, once so `card-api` will have the full perms when it
  ;; tries to do the `read-check`, and a second time for when the query is ran (async) so the QP middleware will have
  ;; the correct perms
  (request/as-admin
    (m/mapply qp.card/process-query-for-card card-id export-format
              :parameters parameters
              :context    (export-format->context export-format)
              :qp         qp
              :make-run   process-query-for-card-with-id-run-fn
              options)))

(defn ^:private process-query-for-card-with-public-uuid
  "Run query for a *public* Card with UUID. If public sharing is not enabled, this throws an exception. Returns a
  `StreamingResponse` object that should be returned as the result of an API endpoint."
  [uuid export-format parameters & options]
  (public-sharing.validation/check-public-sharing-enabled)
  (let [card-id (api/check-404 (t2/select-one-pk :model/Card :public_uuid uuid, :archived false))]
    (apply process-query-for-card-with-id card-id export-format parameters options)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (process-query-for-card-with-public-uuid uuid :api (json/decode+kw parameters)))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:uuid/query/:export-format"
  "Fetch a publicly-accessible Card and return query results in the specified format. Does not require auth
  credentials. Public sharing must be enabled."
  [{:keys [uuid export-format]} :- [:map
                                    [:uuid          ms/UUIDString]
                                    [:export-format ::qp.schema/export-format]]
   {:keys [parameters format_rows pivot_results]} :- [:map
                                                      [:format_rows   {:default false} :boolean]
                                                      [:pivot_results {:default false} :boolean]
                                                      [:parameters    {:optional true} [:maybe ms/JSONString]]]]
  (process-query-for-card-with-public-uuid
   uuid
   export-format
   (json/decode+kw parameters)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          format_rows
                :pivot?                pivot_results}))

;;; ----------------------------------------------- Public Dashboards ------------------------------------------------

(def ^:private action-public-keys
  "The only keys for an action that should be visible to the general public."
  #{:name
    :id
    :database_id ;; needed to check if the database has actions enabled on the frontend
    :visualization_settings
    :parameters})

(defn- public-action
  "Returns a public version of `action`, removing all data that should not be visible to the general public."
  [action]
  (let [hidden-parameter-ids (->> (get-in action [:visualization_settings :fields])
                                  vals
                                  (keep (fn [x]
                                          (when (true? (:hidden x))
                                            (:id x))))
                                  set)]
    (-> action
        (update :parameters (fn [parameters]
                              (remove #(contains? hidden-parameter-ids (:id %)) parameters)))
        (update-in [:visualization_settings :fields] (fn [fields]
                                                       (m/remove-keys hidden-parameter-ids fields)))
        (select-keys action-public-keys))))

(mu/defn public-dashboard :- ::dashboards.schema/dashboard
  "Return a public Dashboard matching key-value `conditions`, removing all columns that should not be visible to the
  general public. Throws a 404 if the Dashboard doesn't exist."
  [& conditions]
  {:pre [(even? (count conditions))]}
  (binding [params/*ignore-current-user-perms-and-return-all-field-values* true
            params/*field-id-context* (atom params/empty-field-id-context)]
    (-> (api/check-404 (apply t2/select-one [:model/Dashboard :name :description :id :parameters :auto_apply_filters :width], :archived false, conditions))
        (t2/hydrate [:dashcards :card :series :dashcard/action] :tabs :param_fields)
        api.dashboard/add-query-average-durations
        (update :dashcards (fn [dashcards]
                             (for [dashcard dashcards]
                               (-> (select-keys dashcard [:id :card :card_id :dashboard_id :series :col :row :size_x :dashboard_tab_id
                                                          :size_y :parameter_mappings :visualization_settings :action :inline_parameters])
                                   (update :card remove-card-non-public-columns)
                                   (update :series (fn [series]
                                                     (for [series series]
                                                       (remove-card-non-public-columns series))))
                                   (m/update-existing :action public-action))))))))

(defn- dashboard-with-uuid [uuid] (public-dashboard :public_uuid uuid))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:uuid"
  "Fetch a publicly-accessible Dashboard. Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (u/prog1 (dashboard-with-uuid uuid)
    (events/publish-event! :event/dashboard-read {:object-id (:id <>), :user-id api/*current-user-id*})))

(defn process-query-for-dashcard
  "Return the results of running a query for Card with `card-id` belonging to Dashboard with `dashboard-id` via
  `dashcard-id`. `card-id`, `dashboard-id`, and `dashcard-id` are all required; other parameters are optional:

  * `parameters`    - MBQL query parameters, either already parsed or as a serialized JSON string
  * `export-format` - `:api` (default format with metadata), `:json` (results only), `:csv`, or `:xslx`. Default: `:api`
  * `qp`            - QP function to run the query with. Default [[qp/process-query]] + [[qp/userland-context]]

  Throws a 404 immediately if the Card isn't part of the Dashboard. Returns a `StreamingResponse`."
  {:arglists '([& {:keys [dashboard-id card-id dashcard-id export-format parameters] :as options}])}
  [& {:keys [export-format parameters qp]
      :or   {qp            qp.card/process-query-for-card-default-qp
             export-format :api}
      :as   options}]
  (let [options (merge
                 {:context     :public-dashboard
                  :constraints (qp.constraints/default-query-constraints)}
                 options
                 {:parameters    (cond-> parameters
                                   (string? parameters) json/decode+kw)
                  :export-format export-format
                  :qp            qp
                  :make-run      process-query-for-card-with-id-run-fn})]
    ;; Run this query with full superuser perms. We don't want the various perms checks failing because there are no
    ;; current user perms; if this Dashcard is public you're by definition allowed to run it without a perms check
    ;; anyway
    (request/as-admin
      ;; Even if we have a current user, we don't want this request associated with a particular user because it's
      ;; public. This also prevents setting user-specific parameters (for example, if a logged in user is visiting a
      ;; page that has locked parameters, we don't want them to get those same parameters next time they visit this
      ;; dashboard in Metabase proper.)
      (binding [api/*current-user-id* nil]
        (m/mapply qp.dashboard/process-query-for-dashcard options)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
   sharing must be enabled."
  [{:keys [uuid dashcard-id card-id]} :- [:map
                                          [:uuid        ms/UUIDString]
                                          [:dashcard-id ms/PositiveInt]
                                          [:card-id     ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Card :id card-id :archived false))
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (process-query-for-dashcard
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format :api
     :parameters    parameters)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post ["/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/:export-format"
                               :export-format qp.schema/export-formats-regex]
  "Fetch the results of running a publicly-accessible Card belonging to a Dashboard and return the data in one of the
  export formats. Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid dashcard-id card-id export-format]} :- [:map
                                                        [:uuid          ms/UUIDString]
                                                        [:dashcard-id   ms/PositiveInt]
                                                        [:card-id       ms/PositiveInt]
                                                        [:export-format ::qp.schema/export-format]]
   _query-parameters
   {:keys [format_rows pivot_results parameters]} :- [:map
                                                      [:parameters    {:optional true} [:maybe
                                                                                        {:decode/api
                                                                                         (fn [x]
                                                                                           (cond-> x
                                                                                             (string? x) json/decode+kw))}
                                                                                        [:sequential :map]]]
                                                      [:format_rows   {:default false} ms/BooleanValue]
                                                      [:pivot_results {:default false} ms/BooleanValue]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Card :id card-id :archived false))
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (u/prog1 (process-query-for-dashcard
              :dashboard-id  dashboard-id
              :card-id       card-id
              :dashcard-id   dashcard-id
              :export-format export-format
              :parameters    parameters
              :constraints   nil
              :middleware    {:process-viz-settings? true
                              :format-rows?          format_rows
                              :pivot?                pivot_results}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:uuid/dashcard/:dashcard-id/execute"
  "Fetches the values for filling in execution parameters. Pass PK parameters and values to select."
  [{:keys [uuid dashcard-id]} :- [:map
                                  [:uuid        ms/UUIDString]
                                  [:dashcard-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters ms/JSONString]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid :archived false))
  (actions/fetch-values
   (api/check-404 (actions/dashcard->action dashcard-id))
   (json/decode parameters)))

(def ^:private dashcard-execution-throttle (throttle/make-throttler :dashcard-id :attempts-threshold 5000))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/dashboard/:uuid/dashcard/:dashcard-id/execute"
  "Execute the associated Action in the context of a `Dashboard` and `DashboardCard` that includes it.

   `parameters` should be the mapped dashboard parameters with values."
  [{:keys [uuid dashcard-id]} :- [:map
                                  [:uuid        ms/UUIDString]
                                  [:dashcard-id ms/PositiveInt]]
   _query-params
   {:keys [parameters], :as _body} :- [:map
                                       [:parameters {:optional true} [:maybe [:map-of :keyword :any]]]]]
  (let [throttle-message (try
                           (throttle/check dashcard-execution-throttle dashcard-id)
                           nil
                           (catch ExceptionInfo e
                             (get-in (ex-data e) [:errors :dashcard-id])))
        throttle-time (when throttle-message
                        (second (re-find #"You must wait ([0-9]+) seconds" throttle-message)))]
    (if throttle-message
      (cond-> {:status 429
               :body throttle-message}
        throttle-time (assoc :headers {"Retry-After" throttle-time}))
      (do
        (public-sharing.validation/check-public-sharing-enabled)
        (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
          ;; Run this query with full superuser perms. We don't want the various perms checks
          ;; failing because there are no current user perms; if this Dashcard is public
          ;; you're by definition allowed to run it without a perms check anyway
          (request/as-admin
            ;; Undo middleware string->keyword coercion
            (actions/execute-dashcard! dashboard-id dashcard-id (update-keys parameters name))))))))

(defn- iframe
  "Return an `<iframe>` HTML fragment to embed a public page."
  ^String [^String url width height]
  (hiccup/html [:iframe {:src         url
                         :width       width
                         :height      height
                         :frameborder 0}]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/oembed"
  "oEmbed endpoint used to retrieve embed code and metadata for a (public) Metabase URL."
  [_route-params
   {:keys [url maxheight maxwidth]}
   :- [:map
       [:url       ms/NonBlankString]
       [:format    {:optional true} [:maybe
                                     {:description (str "The format param is not used by the API, but is required as"
                                                        " part of the oEmbed spec: http://oembed.com/#section2 just"
                                                        " return an error if `format` is specified and it's anything"
                                                        " other than `json`.")}
                                     [:enum "json"]]]
       [:maxheight {:default default-embed-max-height} pos-int?]
       [:maxwidth  {:default default-embed-max-width}  pos-int?]]]
  {:version "1.0"
   :type    "rich"
   :width   maxwidth
   :height  maxheight
   :html    (iframe url maxwidth maxheight)})

;;; ----------------------------------------------- Public Action ------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/action/:uuid"
  "Fetch a publicly-accessible Action. Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (let [action (api/check-404 (actions/select-action :public_uuid uuid :archived false))]
    (actions/check-actions-enabled! action)
    (public-action action)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        FieldValues, Search, Remappings                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------ Param Values -------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:uuid/params/:param-key/values"
  "Fetch values for a parameter on a public card."
  [{:keys [uuid param-key]} :- [:map
                                [:uuid      ms/UUIDString]
                                [:param-key ms/NonBlankString]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (let [card (t2/select-one :model/Card :public_uuid uuid, :archived false)]
    (request/as-admin
      (queries/card-param-values card param-key))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:uuid/params/:param-key/search/:query"
  "Fetch values for a parameter on a public card containing `query`."
  [{:keys [uuid param-key query]} :- [:map
                                      [:uuid      ms/UUIDString]
                                      [:param-key ms/NonBlankString]
                                      [:query     ms/NonBlankString]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (let [card (t2/select-one :model/Card :public_uuid uuid, :archived false)]
    (request/as-admin
      (queries/card-param-values card param-key query))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/card/:uuid/params/:param-key/remapping"
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of card with UUID `uuid`."
  [{:keys [uuid param-key]} :- [:map
                                [:uuid      ms/UUIDString]
                                [:param-key ms/NonBlankString]]
   {:keys [value]}          :- [:map [:value :any]]]
  (let [card (t2/select-one :model/Card :public_uuid uuid, :archived false)]
    (request/as-admin
      (queries/card-param-remapped-value card param-key (codec/url-decode value)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:uuid/params/:param-key/values"
  "Fetch filter values for dashboard parameter `param-key`."
  [{:keys [uuid param-key]} :- [:map
                                [:uuid      ms/UUIDString]
                                [:param-key ms/NonBlankString]]
   constraint-param-key->value :- [:map-of string? any?]]
  (let [dashboard (dashboard-with-uuid uuid)]
    (request/as-admin
      (binding [qp.perms/*param-values-query* true]
        (parameters.dashboard/param-values dashboard param-key constraint-param-key->value)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:uuid/params/:param-key/search/:query"
  "Fetch filter values for dashboard parameter `param-key`, containing specified `query`."
  [{:keys [uuid param-key query]} :- [:map
                                      [:uuid      ms/UUIDString]
                                      [:param-key ms/NonBlankString]
                                      [:query     ms/NonBlankString]]
   constraint-param-key->value]
  (let [dashboard (dashboard-with-uuid uuid)]
    (request/as-admin
      (binding [qp.perms/*param-values-query* true]
        (parameters.dashboard/param-values dashboard param-key constraint-param-key->value query)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/dashboard/:uuid/params/:param-key/remapping"
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of dashboard with UUID `uuid`."
  [{:keys [uuid param-key]} :- [:map
                                [:uuid      ms/UUIDString]
                                [:param-key ms/NonBlankString]]
   {:keys [value]}          :- [:map [:value :any]]]
  (let [dashboard (dashboard-with-uuid uuid)]
    (request/as-admin
      (binding [qp.perms/*param-values-query* true]
        (parameters.dashboard/dashboard-param-remapped-value dashboard param-key (codec/url-decode value))))))

;;; ----------------------------------------------------- Pivot Tables -----------------------------------------------

;; TODO -- why do these endpoints START with `/pivot/` whereas the version in Dash
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/pivot/card/:uuid/query"
  "Fetch a publicly-accessible Card an return query results as well as `:card` information. Does not require auth
   credentials. Public sharing must be enabled."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (process-query-for-card-with-public-uuid uuid :api (json/decode+kw parameters)
                                           :qp qp.pivot/run-pivot-query))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
  "Fetch the results for a Card in a publicly-accessible Dashboard. Does not require auth credentials. Public
  sharing must be enabled."
  [{:keys [uuid dashcard-id card-id]} :- [:map
                                          [:uuid        ms/UUIDString]
                                          [:card-id     ms/PositiveInt]
                                          [:dashcard-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (api/check-404 (t2/select-one-pk :model/Card :id card-id :archived false))
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))]
    (process-query-for-dashcard
     :dashboard-id  dashboard-id
     :card-id       card-id
     :dashcard-id   dashcard-id
     :export-format :api
     :parameters    parameters
     :qp            qp.pivot/run-pivot-query)))

(def ^:private action-execution-throttle
  "Rate limit at 10 actions per 1000 ms on a per action basis.
   The goal of rate limiting should be to prevent very obvious abuse, but it should
   be relatively lax so we don't annoy legitimate users."
  (throttle/make-throttler :action-uuid
                           :attempts-threshold 10
                           :initial-delay-ms 1000
                           :attempt-ttl-ms 1000
                           :delay-exponent 1))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/action/:uuid/execute"
  "Execute the Action.

   `parameters` should be the mapped dashboard parameters with values."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]
   _query-params
   {:keys [parameters], :as _body} :- [:map
                                       [:parameters {:optional true} [:maybe [:map-of :keyword any?]]]]]
  (let [throttle-message (try
                           (throttle/check action-execution-throttle uuid)
                           nil
                           (catch ExceptionInfo e
                             (get-in (ex-data e) [:errors :action-uuid])))
        throttle-time (when throttle-message
                        (second (re-find #"You must wait ([0-9]+) seconds" throttle-message)))]
    (if throttle-message
      (cond-> {:status 429
               :body   throttle-message}
        throttle-time (assoc :headers {"Retry-After" throttle-time}))
      (do
        (public-sharing.validation/check-public-sharing-enabled)
        ;; Run this query with full superuser perms. We don't want the various perms checks
        ;; failing because there are no current user perms; if this Dashcard is public
        ;; you're by definition allowed to run it without a perms check anyway
        (request/as-admin
          (let [action (api/check-404 (actions/select-action :public_uuid uuid :archived false))]
            (analytics/track-event! :snowplow/action
                                    {:event     :action-executed
                                     :source    :public_form
                                     :type      (:type action)
                                     :action_id (:id action)})
            ;; Undo middleware string->keyword coercion
            (actions/execute-action! action (update-keys parameters name))))))))

;;; ----------------------------------------------------- Map Tiles --------------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tiles/card/:uuid/:zoom/:x/:y"
  "Generates a single tile image for a publicly-accessible Card using the map visualization. Does not require auth
  credentials. Public sharing must be enabled."
  [{:keys [uuid zoom x y]}
   :- [:map
       [:uuid ms/UUIDString]
       [:zoom ms/Int]
       [:x ms/Int]
       [:y ms/Int]]
   {:keys [parameters latField lonField]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]
       [:latField string?]
       [:lonField string?]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (let [card-id    (api/check-404 (t2/select-one-pk :model/Card :public_uuid uuid, :archived false))
        parameters (when parameters (json/decode+kw parameters))
        lat-field  (json/decode+kw latField)
        lon-field  (json/decode+kw lonField)]
    (request/as-admin
      (api.tiles/process-tiles-query-for-card card-id parameters zoom x y lat-field lon-field))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/tiles/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
  "Generates a single tile image for a Card using the map visualization in a publicly-accessible Dashboard. Does not
  require auth credentials. Public sharing must be enabled."
  [{:keys [uuid dashcard-id card-id zoom x y]}
   :- [:map
       [:uuid        ms/UUIDString]
       [:dashcard-id ms/PositiveInt]
       [:card-id     ms/PositiveInt]
       [:zoom        ms/Int]
       [:x           ms/Int]
       [:y           ms/Int]]
   {:keys [parameters latField lonField]}
   :- [:map
       [:parameters {:optional true} ms/JSONString]
       [:latField string?]
       [:lonField string?]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (let [dashboard-id (api/check-404 (t2/select-one-pk :model/Dashboard :public_uuid uuid, :archived false))
        parameters   (when parameters (json/decode+kw parameters))
        lat-field    (json/decode+kw latField)
        lon-field    (json/decode+kw lonField)]
    (request/as-admin
      (api.tiles/process-tiles-query-for-dashcard dashboard-id dashcard-id card-id parameters zoom x y lat-field lon-field))))

;;; ------------------------------------------------ Public Documents -------------------------------------------------

(defn- remove-document-non-public-columns
  "Remove sensitive fields from a document before exposing it publicly.

  We filter out collection_id, creator_id, public_uuid, and other sensitive fields to prevent unauthenticated users
  from discovering internal organizational structure, permissions boundaries, or who created the document. Only the
  document content itself, basic metadata, and embedded cards are safe to expose publicly."
  [document]
  (select-keys document [:id :name :document :created_at :updated_at :cards]))

(defn- public-document
  "Fetch a public document with all embedded cards hydrated upfront.

  We hydrate cards eagerly (rather than requiring separate requests per card) to avoid N+1 queries and provide a
  consistent experience with public dashboards. This also allows us to filter sensitive fields from all cards at
  once before exposing them to unauthenticated users. The document and all cards must not be archived to be
  accessible publicly."
  [& conditions]
  (let [document (-> (api/check-404 (apply t2/select-one [:model/Document :id :name :document :content_type :created_at :updated_at]
                                           :archived false, conditions))
                     ;; Hydrate cards via Toucan batched hydration to avoid N+1 queries
                     (t2/hydrate :cards))]
    (-> document
        ;; Filter sensitive fields from all cards before exposing publicly
        (update :cards #(update-vals % remove-card-non-public-columns))
        (dissoc :content_type)
        remove-document-non-public-columns)))

(defn- validate-card-in-public-document
  "Ensure a card is actually embedded in the specified public document before running queries.

  We validate the document-card association to prevent users from querying arbitrary cards by guessing IDs. Only
  cards explicitly embedded in the public document (via document_id FK) are accessible through public document
  endpoints. This prevents bypassing collection permissions by accessing cards through public document routes."
  [uuid card-id]
  (let [document-id (api/check-404 (t2/select-one-pk :model/Document :public_uuid uuid :archived false))]
    (api/check-404 (t2/select-one-pk :model/Card :id card-id :document_id document-id :archived false))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/document/:uuid"
  "Fetch a publicly-accessible Document. Does not require auth credentials. Public sharing must be enabled.

  Returns a Document with sensitive fields removed (excludes collection_id, permissions, creator details, etc.).
  Includes all embedded Cards with their metadata hydrated so the frontend doesn't need to make separate
  requests for each card — just like public Dashboards do."
  [{:keys [uuid]} :- [:map
                      [:uuid ms/UUIDString]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (let [document (public-document :public_uuid uuid)]
    (events/publish-event! :event/document-read {:object-id (:id document), :user-id api/*current-user-id*})
    document))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/document/:uuid/card/:card-id"
  "Run a query for a Card that's embedded in a public Document. Doesn't require auth credentials. Public sharing must
  be enabled."
  [{:keys [uuid card-id]} :- [:map
                              [:uuid    ms/UUIDString]
                              [:card-id ms/PositiveInt]]
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe ms/JSONString]]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (validate-card-in-public-document uuid card-id)
  ;; Run the query as admin since public documents are available to everyone anyway
  (u/prog1 (process-query-for-card-with-id
            card-id
            :api
            (json/decode+kw parameters)
            :constraints (qp.constraints/default-query-constraints))
    (events/publish-event! :event/card-read {:object-id card-id :user-id api/*current-user-id* :context :question})))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/document/:uuid/card/:card-id/:export-format"
  "Fetch a Card embedded in a public Document and return query results in the specified format.
  Does not require auth credentials. Public sharing must be enabled."
  [{:keys [uuid card-id export-format]} :- [:map
                                            [:uuid          ms/UUIDString]
                                            [:card-id       ms/PositiveInt]
                                            [:export-format ::qp.schema/export-format]]
   _query-params
   {:keys [parameters format_rows pivot_results]} :- [:map
                                                      [:parameters    {:optional true} [:maybe [:or
                                                                                                [:sequential ms/Map]
                                                                                                ms/JSONString]]]
                                                      [:format_rows   {:default false} ms/BooleanValue]
                                                      [:pivot_results {:default false} ms/BooleanValue]]]
  (public-sharing.validation/check-public-sharing-enabled)
  (validate-card-in-public-document uuid card-id)
  (process-query-for-card-with-id
   card-id
   export-format
   (cond-> parameters
     (string? parameters) json/decode+kw)
   :constraints nil
   :middleware {:process-viz-settings? true
                :js-int-to-string?     false
                :format-rows?          format_rows
                :pivot?                pivot_results}))

;;; ----------------------------------------- Route Definitions & Complaints -----------------------------------------

;; TODO - why don't we just make these routes have a bit of middleware that includes the
;; `public-sharing.validation/check-public-sharing-enabled` check in each of them? That way we don't need to remember to include the line in
;; every single endpoint definition here? Wouldn't that be 100x better?!
;;
;; TODO - also a smart person would probably just parse the UUIDs automatically in middleware as appropriate for
;;`/dashboard` vs `/card`
