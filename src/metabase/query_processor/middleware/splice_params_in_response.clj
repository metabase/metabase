(ns metabase.query-processor.middleware.splice-params-in-response
  (:require [metabase.driver :as driver]))

(defn- splice-params-in-response* [{:keys [status], {{:keys [params]} :native_form} :data, :as results}]
  ;; no need to i18n this since this message is something only developers who break the QP by changing middleware
  ;; order will see
  (assert driver/*driver*
    "Middleware order error: splice-params-in-response must run *after* driver is resolved.")
  (cond
    (not= status :completed)
    results

    (empty? params)
    results

    :else
    (update-in results [:data :native_form] (partial driver/splice-parameters-into-native-query driver/*driver*))))

(defn splice-params-in-response
  "Middleware that manipulates query response. Splice prepared statement (or equivalent) parameters directly into the
  native query returned as part of successful query results. (This `:native_form` is ultimately what powers the
  'Convert this Question to SQL' feature in the Query Processor.) E.g.:

    {:data {:native_form {:query \"SELECT * FROM birds WHERE name = ?\", :params [\"Reggae\"]}}}

     -> splice params in response ->

    {:data {:native_form {:query \"SELECT * FROM birds WHERE name = 'Reggae'\"}}}

  Note that this step happens *after* a query is executed; we do not want to execute the query with literals spliced
  in, so as to avoid SQL injection attacks.

  This feature is ultimately powered by the `metabase.driver/splice-parameters-into-native-query` method. For native
  queries without `:params` (which will be all of them for drivers that don't support the equivalent of prepared
  statement parameters, like Druid), this middleware does nothing.

  !!! IMPORTANT NOTE !!!

  This middleware "
  [qp]
  (comp splice-params-in-response* qp))
