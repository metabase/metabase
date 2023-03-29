(ns metabase.actions.http-action
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log])
  (:import
   (com.fasterxml.jackson.databind ObjectMapper)
   (net.thisptr.jackson.jq BuiltinFunctionLoader JsonQuery Output Scope Versions)))

(set! *warn-on-reflection* true)

(defonce ^:private root-scope
  (delay
    (let [scope (Scope/newEmptyScope)]
      (.loadFunctions (BuiltinFunctionLoader/getInstance) Versions/JQ_1_6 scope))))

(defonce ^:private object-mapper
  (delay (ObjectMapper.)))

;; Largely copied from sql drivers param substitute.
;; May go away if parameters substitution is taken out of query-processing/db dependency
(declare substitute*)

(defn- substitute-param [param->value [sql missing] _in-optional? {:keys [k]}]
  (if-not (contains? param->value k)
    [sql (conj missing k)]
    (let [v (get param->value k)]
      (cond
        (= params/no-value v)
        [sql (conj missing k)]

        :else
        [(str sql v) missing]))))

(defn- substitute-optional [param->value [sql missing] {subclauses :args}]
  (let [[opt-sql opt-missing] (substitute* param->value subclauses true)]
    (if (seq opt-missing)
      [sql missing]
      [(str sql opt-sql) missing])))

(defn- substitute*
  "Returns a sequence of `[replaced-sql-string jdbc-args missing-parameters]`."
  [param->value parsed in-optional?]
  (reduce
   (fn [[sql missing] x]
     (cond
       (string? x)
       [(str sql x) missing]

       (params/Param? x)
       (substitute-param param->value [sql missing] in-optional? x)

       (params/Optional? x)
       (substitute-optional param->value [sql missing] x)))
   nil
   parsed))

(defn substitute
  "Substitute `Optional` and `Param` objects in a `parsed-template`, a sequence of parsed string fragments and tokens, with
  the values from the map `param->value` (using logic from `substitution` to decide what replacement SQL should be
  generated).

    (substitute [\"https://example.com/?filter=\" (param \"bird_type\")]
                 {\"bird_type\" \"Steller's Jay\"})
    ;; -> \"https://example.com/?filter=Steller's Jay\""
  [parsed-template param->value]
  (log/tracef "Substituting params\n%s\nin template\n%s" (u/pprint-to-str param->value) (u/pprint-to-str parsed-template))
  (let [[sql missing] (try
                        (substitute* param->value parsed-template false)
                        (catch Throwable e
                          (throw (ex-info (tru "Unable to substitute parameters: {0}" (ex-message e))
                                          {:type         (or (:type (ex-data e)) qp.error-type/qp)
                                           :params       param->value
                                           :parsed-query parsed-template}
                                          e))))]
    (log/tracef "=>%s" sql)
    (when (seq missing)
      (throw (ex-info (tru "Cannot call the service: missing required parameters: {0}" (set missing))
                      {:type    qp.error-type/missing-required-parameter
                       :missing missing})))
    (str/trim sql)))

(defn- parse-and-substitute [s params->value]
  (when s
    (-> s
        params.parse/parse
        (substitute params->value))))
;;

(deftype ActionOutput [results]
  Output
  (emit [_ x]
    (vswap! results conj (str x))))

(defn apply-json-query
  "Executes a jq query on [[object]]."
  [object jq-query]
  ;; TODO this is pretty ineficient. We parse with `:as :json`, then reencode within a response
  ;; I couldn't find a way to get JSONNode out of cheshire, so we fall back to jackson.
  ;; Should jackson be added explicitly to deps.edn?
  (let [json-node (.readTree ^ObjectMapper @object-mapper (json/generate-string object))
        vresults (volatile! [])
        output (ActionOutput. vresults)
        expr (JsonQuery/compile jq-query Versions/JQ_1_6)
        ;; might need to Scope childScope = Scope.newChildScope(rootScope); if root-scope can be modified by expression
        _ (.apply expr @root-scope json-node output)
        results @vresults]
    (if (<= (count results) 1)
      (first results)
      (throw (ex-info (tru "Too many results returned: {0}" (pr-str results)) {:jq-query jq-query :results results})))))

(defn execute-http-action!
  "Calls an http endpoint based on action and params"
  [action params->value]
  (try
    (let [{:keys [method url body headers]} (:template action)
          request {:method (keyword method)
                   :url (parse-and-substitute url params->value)
                   :accept :json
                   :content-type :json
                   :throw-exceptions false
                   :headers (merge
                              ;; TODO maybe we want to default Agent here? Maybe Origin/Referer?
                              {"X-Metabase-Action" (:name action)}
                              (-> headers
                                  (parse-and-substitute params->value)
                                  (json/decode)))
                   :body (parse-and-substitute body params->value)}
          response (-> (http/request request)
                       (select-keys [:body :headers :status])
                       (update :body json/decode))
          error (json/parse-string (apply-json-query response (or (:error_handle action) ".status >= 400")))]
      (log/trace "Response before handle:" response)
      (if error
        {:status 400
         :headers {"Content-Type" "application/json"}
         :body (if (boolean? error)
                 {:remote-status (:status response)}
                 error)}
        (if-some [response (some->> action :response_handle (apply-json-query response))]
          {:status 200
           :headers {"Content-Type" "application/json"}
           :body response}
          {:status 204
           :body nil})))
    (catch Exception e
      (throw (ex-info (str "Problem building request: " (ex-message e))
                      {:template (:template action)}
                      e)))))
