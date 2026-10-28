(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format.

  The response carries only the client-facing part of each exception's ex-data (see [[metabase.util.api-error]]). The
  error log line carries just the message, plus the ex-data keys listed under `:log/keys`, as log context:

    (throw (ex-info (tru \"Field is not available\")
                    {:status-code 400, :field-id id, :field-name field-name, :log/keys #{:field-id :field-name}}))

  responds without either key and logs `field-id` and `field-name` alongside the message. Don't list the query or
  values from it.

  A user whose row access is restricted on the query's database (by a sandbox, connection impersonation or database
  routing) gets a generic message in place of each error message that could carry the compiled query, the sandbox
  definition or column metadata such as fingerprints. See [[restricted-response-maps]]."
  (:refer-clojure :exclude [some get-in not-empty select-keys])
  (:require
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.api-error :as api-error]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some get-in not-empty select-keys]])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(defmulti ^:private format-exception
  "Format an Exception thrown by the Query Processor into a userland error response map."
  {:arglists '([^Throwable e])}
  class)

(defmethod format-exception Throwable
  [^Throwable e]
  {:status     :failed
   :class      (class e)
   :error      (.getMessage e)
   :stacktrace (u/filtered-stacktrace e)})

(defmethod format-exception InterruptedException
  [^InterruptedException _e]
  {:status :interrupted})

(defn- response-ex-data
  "The part of an exception's `data` sent to the client: what [[api-error/response-data]] sends, and `:status-code`,
  which [[metabase.query-processor.streaming]] turns into the HTTP status."
  [data]
  (not-empty (merge (api-error/response-data data)
                    (select-keys data [:status-code]))))

(defmethod format-exception ExceptionInfo
  [e]
  ;; `:is-curated` is a flag that signals whether the error message in `e` was approved by product
  ;; to be shown to the user. It is used by FE.
  (let [{error-type :type, is-curated :is-curated, :as data} (ex-data e)
        response-data (response-ex-data data)]
    (when-let [dropped (and config/is-dev?
                            (not-empty (apply dissoc data (keys response-data))))]
      (log/debugf "Query error response leaves out ex-data: %s" (pr-str dropped)))
    (merge
     ((get-method format-exception Throwable) e)
     (when (qp.error-type/known-error-type? error-type)
       {:error_type error-type})
     (when is-curated
       {:error_is_curated is-curated})
     (when response-data
       ;; TODO - we should probably change this key to `:data` so we're not mixing lisp-case and snake_case keys
       {:ex-data response-data}))))

(defmethod format-exception SQLException
  [^SQLException e]
  (assoc ((get-method format-exception Throwable) e)
         :state (.getSQLState e)))

(mr/def ::format-exception-result
  "The map shape produced by one of this namespace's private `format-exception` methods."
  [:map {:closed true}
   [:status            [:enum :failed :interrupted]]
   [:class             {:optional true} (lib.schema.common/instance-of-class Class)]
   [:error             {:optional true} [:maybe :string]]
   [:stacktrace        {:optional true} [:maybe [:sequential :string]]]
   [:error_type        {:optional true} :keyword]
   [:error_is_curated  {:optional true} :boolean]
   [:ex-data           {:optional true} :metabase.lib.schema.common/exception-data]
   [:state             {:optional true} [:maybe :string]]])

;; TODO -- some of this logic duplicates the functionality of `clojure.core/Throwable->map`, we should consider
;; whether we can use that more extensively and remove some of this logic
(defn- exception-chain
  "Exception chain in reverse order, e.g. inner-most cause first."
  [e]
  (reverse (u/full-exception-chain e)))

(mu/defn- best-top-level-error
  "In cases where the top-level Exception doesn't have the best error message, return a better one to use instead. We
  usually want to show SQLExceptions at the top level since they contain more useful information."
  [maps :- [:sequential {:min 1} ::format-exception-result]]
  (some (fn [m]
          (when (isa? (:class m) SQLException)
            ;; Some JDBC drivers (e.g. Databricks) return a stacktrace in the
            ;; error message that we don't want to show the user
            {:error (first (str/split (get m :error "") #"\n\tat " 2))}))
        maps))

;;; ------------------------------------------- Row-restricted users -------------------------------------------

(defn- generic-error-message []
  (tru "An error occurred while running the query."))

(defn- row-restricted-user?
  "Whether the current user's row access to database `database-id` is restricted by a sandbox, connection impersonation
  or database routing. Such a user must not see the compiled query (which holds the sandbox) or column metadata such
  as fingerprints (computed over every row). Fails closed: true when the check itself throws."
  [database-id]
  (boolean
   (and api/*current-user-id*
        (not api/*is-superuser?*)
        (try
          (or (perms/sandboxed-user-for-db? database-id)
              (perms/impersonation-enforced-for-db? database-id)
              (contains? (perms/data-access-token {:database-id database-id, :table-ids #{}}) :routing))
          (catch Throwable _
            true)))))

(defn- sql-visible?
  "Whether the current user may see the compiled native query of `query`: the same check as for the `:native` key."
  [query]
  (try
    (boolean (qp.perms/current-user-has-adhoc-native-query-perms? query))
    (catch Throwable _
      false)))

(defn- written-for-user?
  "Whether formatted exception `m` has a message written for the user, which a row-restricted user may see: one of an
  error type shown in embeds, a permission error, or one thrown with a 4xx `:status-code`."
  [{error-type :error_type, {:keys [status-code]} :ex-data}]
  (or (qp.error-type/show-in-embeds? error-type)
      (qp.error-type/permission-error? error-type)
      (and (int? status-code) (<= 400 status-code 499))))

(defn- restricted-response-maps
  "`maps`, the formatted exception chain, for a row-restricted user. Each message is replaced with a generic one, and
  its ex-data reduced to `:status-code`, unless it is one of:

  - a message [[written-for-user?]] that does not repeat a replaced message, or
  - a database message (from a `SQLException`) when `sql-visible?`. The user could write that SQL themselves, so a
    message quoting it shows them nothing new."
  [maps sql-visible?]
  (let [keep?   (fn [m]
                  (or (written-for-user? m)
                      (and sql-visible? (isa? (:class m) SQLException))))
        hidden  (into []
                      (comp (remove keep?) (keep :error) (remove str/blank?))
                      maps)
        repeats-hidden? (fn [{message :error}]
                          (and (string? message)
                               (some #(str/includes? message %) hidden)))]
    (for [m maps]
      (if (and (keep? m) (not (repeats-hidden? m)))
        m
        (-> m
            (assoc :error (generic-error-message))
            (dissoc :error_is_curated)
            (u/assoc-dissoc :ex-data (not-empty (select-keys (:ex-data m) [:status-code]))))))))

(defn- exception-response*
  [^Throwable e restrict-maps]
  (let [[m & more :as maps] (restrict-maps (for [e (exception-chain e)]
                                             (format-exception e)))]
    (merge
     m
     (best-top-level-error maps)
     ;; merge in the first error_type we see
     (when-let [error-type (some :error_type maps)]
       {:error_type error-type})
     (when (seq more)
       {:via (vec more)}))))

(mu/defn exception-response :- [:map [:status :keyword]]
  "Convert an Exception to a nicely-formatted Clojure map suitable for returning in userland QP responses."
  [^Throwable e :- (lib.schema.common/instance-of-class Throwable)]
  (exception-response* e identity))

(defn- query-info
  "Map of about `query` to add to the exception response. `extra-info` holds only what the user may see."
  [{query-type :type, :as query} {:keys [preprocessed native]}]
  (merge
   {:json_query (dissoc query :info :driver)}
   ;; add the fully-preprocessed and native forms to the error message for MBQL queries, since they're extremely
   ;; useful for debugging purposes.
   (when (= (keyword query-type) :query)
     {:preprocessed preprocessed
      :native       native})))

(mr/def ::query-execution-info
  "The in-flight QueryExecution info that userland query processing attaches to exceptions: the columns about to be saved, plus the query and start time."
  [:merge
   ::queries.schema/query-execution.update
   [:map {:closed true}
    [:json_query        {:optional true} ::qp.schema/any-query]
    [:start_time_millis {:optional true} :int]]])

(mu/defn- query-execution-info :- :map
  [query-execution :- ::query-execution-info]
  (dissoc query-execution :result_rows :hash :executor_id :dashboard_id :pulse_id :native :start_time_millis))

(def ^:private ExtraInfo
  [:map {:closed true}
   [:native       {:optional true} [:maybe :metabase.query-processor.compile/compiled]]
   [:preprocessed {:optional true} [:maybe :metabase.lib.schema/query]]])

(mu/defn- format-exception* :- [:map [:status :keyword]]
  "Format a `Throwable` into the usual userland error-response format. `restrict-maps` is applied to the formatted
  exception chain, see [[restricted-response-maps]]."
  [query         :- ::qp.schema/any-query
   ^Throwable e  :- (lib.schema.common/instance-of-class Throwable)
   extra-info    :- [:maybe ExtraInfo]
   restrict-maps :- ifn?]
  (try
    ;; [[metabase.query-processor.middleware.process-userland-query/process-userland-query-middleware]] wraps exceptions
    ;; to add query execution info, unwrap them and format the wrapped one
    (if-let [query-execution (:query-execution (ex-data e))]
      (merge (query-execution-info query-execution)
             (format-exception* query (ex-cause e) extra-info restrict-maps))
      (merge
       {:data {:rows [], :cols []}, :row_count 0}
       (exception-response* e restrict-maps)
       (query-info query extra-info)))
    (catch Throwable e
      (if (identical? restrict-maps identity)
        (assoc (api-error/throwable->map e) :status :failed)
        {:status :failed, :error (generic-error-message)}))))

(defn- error-visibility
  "What the current user may see of a failed `query`'s internals:

  - `:sql?`          the compiled native query
  - `:preprocessed?` the preprocessed query, which holds the compiled sandbox and column metadata
  - `:restrict-maps` the function applied to the formatted exception chain"
  [{database-id :database, :as query}]
  (let [restricted? (row-restricted-user? database-id)
        sql?        (sql-visible? query)]
    {:sql?          sql?
     :preprocessed? (and sql? (not restricted?))
     :restrict-maps (if restricted?
                      #(restricted-response-maps % sql?)
                      identity)}))

(defn- restricted-exception
  "`e` as thrown to a row-restricted user by a non-userland query. When [[restricted-response-maps]] replaces any message
  in its chain, an exception with the first message left, the `:type` and `:status-code` of the first exception in the
  chain that has them, and no cause. Interrupts and cancelations are rethrown as they are, since callers look for them
  in the chain."
  ^Throwable [^Throwable e]
  (let [chain      (u/full-exception-chain e)
        maps       (for [ex (reverse chain)]
                     (format-exception ex))
        restricted (restricted-response-maps maps false)]
    (if (or (some #(instance? InterruptedException %) chain)
            (some (comp :query/query-canceled? ex-data) chain)
            (= (map :error maps) (map :error restricted)))
      e
      (ex-info (:error (first restricted))
               (merge (some #(not-empty (select-keys (ex-data %) [:type])) chain)
                      (some #(not-empty (select-keys (ex-data %) [:status-code])) chain))))))

(defn- log-context
  "The ex-data entries each exception in `e`'s chain lists under `:log/keys`, for the error log line. An inner
  exception's entries win over an outer one's. Empty when a `:log/keys` is malformed, so that it can't mask `e`."
  [e]
  (try
    (into {}
          (map (fn [ex]
                 (let [data (ex-data ex)]
                   (select-keys data (:log/keys data)))))
          (u/full-exception-chain e))
    (catch Throwable _
      {})))

(mu/defn catch-exceptions :- ::qp.schema/qp
  "Middleware for catching exceptions thrown by the query processor and returning them in a 'normal' format. Forwards
  exceptions to the `result-chan`.

  A non-userland query's exceptions are rethrown, with their messages hidden from a row-restricted user
  (see [[restricted-exception]])."
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::qp.schema/any-query
          rff   :- ::qp.schema/rff]
    (if-not (get-in query [:middleware :userland-query?])
      (try
        (qp query rff)
        (catch Throwable e
          (let [e' (if (row-restricted-user? (:database query))
                     (restricted-exception e)
                     e)]
            (when-not (identical? e e')
              (log/with-thread-context (log-context e)
                (log/errorf "Error processing query: %s" (ex-message e))))
            (throw e'))))
      (try
        (qp query rff)
        (catch Throwable e
          (analytics/inc! :metabase-query-processor/query {:driver driver/*driver* :status "failure"})
          ;; format the Exception and return it
          (let [{:keys [sql? preprocessed? restrict-maps]} (error-visibility query)
                extra-info          {:native       (when sql?
                                                     (u/ignore-exceptions
                                                       (qp.compile/compile query)))
                                     :preprocessed (when preprocessed?
                                                     (u/ignore-exceptions
                                                       (qp.preprocess/preprocess query)))}
                formatted-exception (format-exception* query e extra-info restrict-maps)
                query-canceled?     (some (comp :query/query-canceled? ex-data)
                                          (u/full-exception-chain e))
                pool-saturated?     (qp.error-type/connection-pool-saturated?
                                     (:error_type formatted-exception))]
            (when-not (or query-canceled? pool-saturated?)
              (log/with-thread-context (log-context e)
                ;; the unrestricted message, which a row-restricted user's response leaves out
                (log/errorf "Error processing query: %s"
                            (or (:error (if (identical? restrict-maps identity)
                                          formatted-exception
                                          (exception-response e)))
                                "Error running query"))))
            ;; ensure always a message on the error otherwise FE thinks query was successful. (#23258, #23281)
            (let [result (update formatted-exception
                                 :error (fnil identity (trs "Error running query")))]
              (assert (:status result))
              (qp.pipeline/*result* result))))))))
