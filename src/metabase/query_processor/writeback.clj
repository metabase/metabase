(ns metabase.query-processor.writeback
  "Code for executing writeback queries."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.enterprise :as qp.enterprise]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:private execution-middleware
  "Middleware that happens after compilation, AROUND query execution itself. Has the form

    (f (f query rff)) -> (f query rff)"
  [#'qp.enterprise/swap-destination-db-middleware
   #'qp.perms/check-query-action-permissions])

(defn- apply-middleware [qp middleware-fns]
  (reduce
   (fn [qp middleware]
     (if middleware
       (middleware qp)
       qp))
   qp
   middleware-fns))

(mr/def ::native-mbql-4-query
  [:map
   [:type   [:= :native]]
   [:native [:map
             [:query :string]]]])

(mu/defn- substitute-params :- ::native-mbql-4-query
  [query :- ::native-mbql-4-query]
  (->> query
       (lib/query (qp.store/metadata-provider))
       parameters/substitute-parameters
       lib/->legacy-MBQL))

(defn- writeback-qp []
  ;; `rff` and `context` are not currently used by the writeback QP stuff, so these parameters can be ignored; we pass
  ;; in `nil` for these below.
  (letfn [(qp* [query _rff]
            (let [query (substitute-params query)]
              ;; ok, now execute the query.
              (log/debugf "Executing query\n\n%s" (u/pprint-to-str query))
              (driver/execute-write-query! driver/*driver* query)))]
    (apply-middleware qp* (concat execution-middleware qp/around-middleware))))

(mu/defn execute-write-query!
  "Execute an writeback query (which currently has to be an MBQL 4 native query) from an action."
  [query :- ::native-mbql-4-query]
  (qp.setup/with-qp-setup [query query]
    (let [{query-type :type, :as query} (-> (qp.preprocess/preprocess query)
                                            ;; TODO (Cam 8/19/25) -- update this code to use MBQL 5 / Lib
                                            lib/->legacy-MBQL)]
      ;; make sure this is a native query.
      (when-not (= query-type :native)
        (throw (ex-info (tru "Only native queries can be executed as write queries.")
                        {:type qp.error-type/invalid-query, :status-code 400, :query query})))
      ((writeback-qp) query (constantly conj)))))

(defn execute-write-sql!
  "Execute a write query in SQL against a database given by `db-id`."
  [db-id sql-or-sql+params]
  (if (sequential? sql-or-sql+params)
    (let [[sql & params] sql-or-sql+params]
      (execute-write-query! {:type     :native
                             :database db-id
                             :native   {:query  sql
                                        :params params}}))
    (execute-write-query! {:type     :native
                           :database db-id
                           :native   {:query sql-or-sql+params}})))
