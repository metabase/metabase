(ns metabase-enterprise.impersonation.query-cache
  "Caches the result of validating each native stage of an impersonated query in the app DB, since validation parses
  the SQL and can take seconds."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase-enterprise.impersonation.db :as impersonation.db]
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
   [metabase.config.core :as config]
   [metabase.driver.sql :as driver.sql]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(mu/defn- query-cache-input :- ::impersonation.schema/impersonation-query-cache.update
  "The lookup key of validating the native SQL `native` for `engine`."
  [engine       :- :keyword
   allow-write? :- [:maybe :boolean]
   admin?       :- [:maybe :boolean]
   native       :- :string]
  {:input_version     config/mb-version-string
   :input_engine      engine
   :input_allow_write (boolean allow-write?)
   :input_admin       (boolean admin?)
   :input_query_hash  (codecs/bytes->hex (buddy-hash/sha256 ^String native))
   :input_query       native})

(mu/defn- cached-result :- [:maybe ::impersonation.schema/impersonation-query-cache]
  "The cached result for `input`, or nil when there is none or the cache cannot be read."
  [input :- ::impersonation.schema/impersonation-query-cache.update]
  (try
    (let [row (impersonation.db/query-cache input)]
      (when (= (:input_query input) (:input_query row))
        row))
    (catch Throwable e
      (log/errorf "Error reading the impersonation query cache: %s" (ex-message e))
      nil)))

(mu/defn- save-result! :- :nil
  "Cache `result` for `input`, leaving the cache as it is when the insert fails, e.g. because another node cached
  the same result first."
  [input  :- ::impersonation.schema/impersonation-query-cache.update
   result :- ::impersonation.schema/impersonation-query-cache.update]
  (try
    (impersonation.db/insert-query-cache! (merge input result))
    (catch Throwable e
      (log/debugf "Not caching an impersonated query validation result: %s" (ex-message e))))
  nil)

(mu/defn- replay-result :- :string
  "The validated SQL of the cached `result` for the native SQL `native`, or the refusal it records thrown."
  [{:keys [result result_query result_reason]} :- ::impersonation.schema/impersonation-query-cache
   native                                      :- :string
   allow-write?                                :- [:maybe :boolean]]
  (if (= result :valid)
    result_query
    (throw (driver.sql/impersonated-query-refusal result native allow-write? result_reason))))

(mu/defn- validate-and-save! :- :string
  "Call `validate` and cache what it returns, or the refusal it throws when that refusal records its result."
  [input    :- ::impersonation.schema/impersonation-query-cache.update
   validate :- fn?]
  (try
    (let [validated (validate)]
      (save-result! input {:result :valid, :result_query validated})
      validated)
    (catch ExceptionInfo e
      (when-let [result (#{:unparseable :unvalidatable :invalid} (:impersonation/result (ex-data e)))]
        (save-result! input {:result result, :result_reason (:reason (ex-data e))}))
      (throw e))))

(mu/defn validated-query :- :string
  "The validated SQL to run in place of the native stage SQL `native` on `engine`, from the cache or else by calling
  `validate`, which returns that SQL or throws a refusal."
  [engine       :- :keyword
   allow-write? :- [:maybe :boolean]
   admin?       :- [:maybe :boolean]
   native       :- :string
   validate     :- fn?]
  (let [input (query-cache-input engine allow-write? admin? native)]
    (if-let [cached (cached-result input)]
      (replay-result cached native allow-write?)
      (validate-and-save! input validate))))
