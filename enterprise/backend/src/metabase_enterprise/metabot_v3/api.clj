(ns metabase-enterprise.metabot-v3.api
  "`/api/ee/metabot-v3/` routes"
  (:require
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.handle-envelope :as metabot-v3.handle-envelope]
   [metabase-enterprise.metabot-v3.reactions :as metabot-v3.reactions]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as metabot-v3.tools.create-dashboard-subscription]
   [metabase-enterprise.metabot-v3.tools.filters :as metabot-v3.tools.filters]
   [metabase-enterprise.metabot-v3.tools.generate-insights :as metabot-v3.tools.generate-insights]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defn- safe-case-updater
  [f]
  #(cond-> % (or (string? %) (keyword? %)) f))

(def ^:private safe->kebab-case-en
  (safe-case-updater u/->kebab-case-en))

(def ^:private safe->snake_case_en
  (safe-case-updater u/->snake_case_en))

(defn- recursive-update-keys
  [form f]
  (walk/walk #(cond-> % (coll? %) (recursive-update-keys f))
             #(cond-> % (map? %) (update-keys f))
             form))

(mu/defn ^:private encode-reactions [reactions :- [:sequential ::metabot-v3.reactions/reaction]]
  (mc/encode [:sequential ::metabot-v3.reactions/reaction]
             reactions
             (mtx/transformer
              {:name :api-response}
              (mtx/key-transformer {:encode u/->snake_case_en}))))

(defn request
  "Handles an incoming request, making all required tool invocation, LLM call loops, etc."
  [message context history session-id]
  (let [env (-> (metabot-v3.envelope/create
                 (metabot-v3.context/create-context context)
                 history
                 session-id)
                (metabot-v3.envelope/add-user-message message)
                (metabot-v3.dummy-tools/invoke-dummy-tools)
                (metabot-v3.handle-envelope/handle-envelope))]
    {:reactions (encode-reactions (metabot-v3.envelope/reactions env))
     :history (metabot-v3.envelope/history env)}))

(api.macros/defendpoint :post "/agent"
  "Send a chat message to the LLM via the AI Proxy."
  [_route-params
   _query-params
   {:keys [message context history session_id] :as body} :- [:map
                                                             [:message ms/NonBlankString]
                                                             [:context [:map-of :keyword :any]]
                                                             [:history [:maybe [:sequential :map]]]
                                                             [:session_id ms/UUIDString]]]
  (metabot-v3.context/log body :llm.log/fe->be)
  (let [context (mc/decode ::metabot-v3.context/context
                           context (mtx/transformer {:name :api-request}))
        history (mc/decode [:maybe ::metabot-v3.client.schema/messages]
                           history (mtx/transformer {:name :api-request}))]
    (doto (assoc
           (request message context history session_id)
           :session_id session_id)
      (metabot-v3.context/log :llm.log/be->fe))))

(mr/def ::existence-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "is-null"         "is-not-null"
                "string-is-empty" "string-is-not-empty"
                "is-true"         "is-false"]]])

(mr/def ::temporal-extraction-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "year-equals"        "year-not-equals"
                "quarter-equals"     "quarter-not-equals"
                "month-equals"       "month-not-equals"
                "day-of-week-equals" "day-of-week-not-equals"
                "hour-equals"        "hour-not-equals"
                "minute-equals"      "minute-not-equals"
                "second-equals"      "second-not-equals"]]
   [:value :int]])

(mr/def ::temporal-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "date-equals" "date-not-equals"
                "date-before" "date-on-or-before"
                "date-after"  "date-on-or-after"]]
   [:value :string]])

(mr/def ::string-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "string-equals"      "string-not-equals"
                "string-contains"    "string-not-contains"
                "string-starts-with" "string-ends-with"]]
   [:value :string]])

(mr/def ::numeric-filter
  [:map
   [:field_id :string]
   [:operation [:enum
                "number-equals"       "number-not-equals"
                "number-greater-than" "number-greater-than-or-equal"
                "number-less-than"    "number-less-than-or-equal"]]
   [:value [:or :int :double]]])

(mr/def ::filter
  [:or ::existence-filter ::temporal-extraction-filter ::temporal-filter ::string-filter ::numeric-filter])

(mr/def ::group-by
  [:map
   [:field_id :string]
   [:field_granularity {:optional true} [:maybe [:enum "day" "week" "month" "quarter" "year"]]]])

(mr/def ::query-metric-arguments
  [:map
   {:encode/api-request #(update-keys % u/->kebab-case-en)
    :encode/tool-api-request #(recursive-update-keys % safe->kebab-case-en)}
   [:metric_id :int]
   [:filters {:optional true} [:maybe [:sequential ::filter]]]
   [:group_by {:optional true} [:maybe [:sequential ::group-by]]]])

(mr/def ::result-column
  [:map
   [:field_id :string]
   [:name :string]
   [:type :string]
   [:description {:optional true} :string]])

(mr/def ::filtering-result
  [:or
   [:map
    {:decode/api-response #(update-keys % u/->snake_case_en)
     :decode/tool-api-response #(recursive-update-keys % safe->snake_case_en)}
    [:structured_output
     [:map
      [:type [:= :query]]
      [:query_id :string]
      [:query mbql.s/Query]
      [:result_columns [:sequential ::result-column]]]]]
   [:map
    [:output :string]]])

(mr/def ::tool-request [:map [:conversation_id ms/UUIDString]])

(mr/def ::subscription-schedule
  (let [days ["sunday" "monday" "tuesday" "wednesday" "thursday" "friday" "saturday"]]
    [:or
     [:map
      [:frequency [:= "hourly"]]]
     [:map
      [:frequency [:= "daily"]]
      [:hour :int]]
     [:map
      [:frequency [:= "weekly"]]
      [:hour :int]
      [:day_of_week (into [:enum] days)]]
     [:map
      [:frequency [:= "monthly"]]
      [:hour :int]
      [:day_of_month (into [:enum "first-calendar-day" "middle-of-month" "last-calendar-day"]
                           (for [fl ["first" "last"]
                                 day days]
                             (str fl "-" day)))]]]))

(mr/def ::create-dashboard-subscription-arguments
  [:map
   {:encode/api-request #(update-keys % u/->kebab-case-en)
    :encode/tool-api-request #(recursive-update-keys % safe->kebab-case-en)}
   [:dashboard_id :int]
   [:email :string]
   [:schedule ::subscription-schedule]])

(mr/def ::filter-records-arguments
  [:map
   {:encode/api-request #(update-keys % u/->kebab-case-en)
    :encode/tool-api-request #(recursive-update-keys % safe->kebab-case-en)}
   [:data_source [:or
                  [:map
                   [:query [:map
                            [:database :int]]]
                   [:query_id {:optional true} :string]]
                  [:map [:report_id :int]]
                  [:map [:table_id :string]]]]
   [:filters [:sequential ::filter]]])

(mr/def ::generate-insights-arguments
  [:map
   {:encode/api-request #(update-keys % u/->kebab-case-en)
    :encode/tool-api-request #(recursive-update-keys % safe->kebab-case-en)}
   [:for [:or
          [:map [:metric_id :int]]
          [:map [:table_id :string]]
          [:map [:report_id :int]]
          [:map [:query :map]]]]])

(api.macros/defendpoint :post "/create-dashboard-subscription" :- [:merge
                                                                   [:map [:output :string]]
                                                                   ::tool-request]
  "Create a dashboard subscription."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::create-dashboard-subscription-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log body :llm.log/llm->be)
  (let [arguments (mc/encode ::create-dashboard-subscription-arguments
                             arguments (mtx/transformer {:name :api-request}))]
    (doto (-> (metabot-v3.tools.create-dashboard-subscription/create-dashboard-subscription arguments)
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/filter-records" :- [:merge ::filtering-result ::tool-request]
  "Construct a query from a metric."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::filter-records-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log body :llm.log/llm->be)
  (let [arguments (mc/encode ::filter-records-arguments
                             arguments (mtx/transformer {:name :api-request}))]
    (doto (-> (mc/decode ::filtering-result
                         (metabot-v3.tools.filters/filter-records arguments)
                         (mtx/transformer {:name :api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/generate-insights" :- [:merge
                                                       [:map
                                                        [:output :string]
                                                        [:reactions [:sequential :metabot.reaction/redirect]]]
                                                       ::tool-request]
  "Generate insights."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::generate-insights-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log body :llm.log/llm->be)
  (let [arguments (mc/encode ::generate-insights-arguments
                             arguments (mtx/transformer {:name :api-request}))]
    (doto (-> (metabot-v3.tools.generate-insights/generate-insights arguments)
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(api.macros/defendpoint :post "/query-metric" :- [:merge ::filtering-result ::tool-request]
  "Construct a query from a metric."
  [_route-params
   _query-params
   {:keys [arguments conversation_id] :as body} :- [:merge
                                                    [:map [:arguments ::query-metric-arguments]]
                                                    ::tool-request]]
  (metabot-v3.context/log body :llm.log/llm->be)
  (let [arguments (mc/encode ::query-metric-arguments
                             arguments (mtx/transformer {:name :api-request}))]
    (doto (-> (mc/decode ::filtering-result
                         (metabot-v3.tools.filters/query-metric arguments)
                         (mtx/transformer {:name :api-response}))
              (assoc :conversation_id conversation_id))
      (metabot-v3.context/log :llm.log/be->llm))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (api.macros/ns-handler *ns* +auth))
