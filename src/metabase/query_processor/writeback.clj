(ns metabase.query-processor.writeback
  "Code for executing writeback queries."
  (:require
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.enterprise :as qp.enterprise]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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

(mu/defn- substitute-params :- ::lib.schema/native-only-query
  [query :- ::lib.schema/native-only-query]
  (->> query
       (lib/query (qp.store/metadata-provider))
       parameters/substitute-parameters))

(defn- writeback-qp []
  ;; `rff` and `context` are not currently used by the writeback QP stuff, so these parameters can be ignored; we pass
  ;; in `nil` for these below.
  (letfn [(qp* [query _rff]
            (let [query (substitute-params query)]
              ;; ok, now execute the query.
              (log/debugf "Executing query\n\n%s" (u/pprint-to-str query))
              (driver/execute-write-query! driver/*driver* (lib/->legacy-MBQL query))))]
    (apply-middleware qp* (concat execution-middleware qp/around-middleware))))

(mu/defn execute-write-query!
  "Execute an writeback query (which currently has to be an MBQL 4 native query) from an action."
  [query :- ::lib.schema/native-only-query]
  (qp.setup/with-qp-setup [query query]
    (let [query (qp.preprocess/preprocess query)]
      ;; make sure this is a native query.
      (when-not (lib/native-only-query? query)
        (throw (ex-info (tru "Only native queries can be executed as write queries.")
                        {:type qp.error-type/invalid-query, :status-code 400, :query query})))
      ((writeback-qp) query (constantly conj)))))

(mu/defn execute-write-sql!
  "Execute a write query in SQL against a database given by `db-id`."
  [db-id :- ::lib.schema.id/database
   sql-or-sql+params :- [:or
                         :string
                         [:cat
                          :string
                          [:* :any]]]]
  (let [mp             (lib-be/application-database-metadata-provider db-id)
        [sql & params] (if (string? sql-or-sql+params)
                         (cons sql-or-sql+params nil)
                         sql-or-sql+params)
        query          (cond-> (lib/native-query mp sql)
                         (seq params) (lib/update-query-stage 0 assoc :params params))]
    (execute-write-query! query)))
