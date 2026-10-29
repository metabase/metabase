(ns metabase-enterprise.impersonation.query-cache-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.impersonation.query-cache :as query-cache]
   [metabase-enterprise.impersonation.task.query-cache-cleanup :as query-cache-cleanup]
   [metabase.config.core :as config]
   [metabase.driver.sql :as driver.sql]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- counting-validate
  "A validate fn returning `result` (or throwing it when it is an exception) that counts its calls in `calls`."
  [calls result]
  (fn []
    (swap! calls inc)
    (if (instance? Throwable result)
      (throw result)
      result)))

(defn- validated
  "Validate `native` through the cache with `validate`, returning the validated SQL or the thrown exception message."
  [native validate & {:keys [engine allow-write? admin?] :or {engine :postgres}}]
  (try
    (query-cache/validated-query engine allow-write? admin? native validate)
    (catch Exception e
      (ex-message e))))

(defn- random-sql []
  (str "SELECT '" (mt/random-name) "'"))

(deftest valid-result-is-cached-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native   (random-sql)
          calls    (atom 0)
          validate (counting-validate calls "SELECT 'validated'")]
      (is (= "SELECT 'validated'" (validated native validate)))
      (is (= "SELECT 'validated'" (validated native validate)))
      (is (= 1 @calls)))))

(deftest refusal-with-result-is-cached-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (doseq [[result reason] [[:unparseable nil] [:unvalidatable "large-literal-list"] [:invalid nil]]
            allow-write?    [false true]]
      (testing (str result " allow-write? " allow-write?)
        (let [native   (random-sql)
              refusal  (driver.sql/impersonated-query-refusal result native allow-write? reason)
              calls    (atom 0)
              validate (counting-validate calls refusal)]
          (is (= (ex-message refusal) (validated native validate :allow-write? allow-write?)))
          (let [replayed (try
                           (query-cache/validated-query :postgres allow-write? false native validate)
                           (catch clojure.lang.ExceptionInfo e e))]
            (is (= (ex-message refusal) (ex-message replayed)))
            (is (= (ex-data refusal) (ex-data replayed))))
          (is (= 1 @calls)))))))

(deftest refusal-without-result-is-not-cached-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native   (random-sql)
          calls    (atom 0)
          validate (counting-validate calls (ex-info "Boom" {}))]
      (is (= "Boom" (validated native validate)))
      (is (= "Boom" (validated native validate)))
      (is (= 2 @calls)))))

(deftest every-input-is-part-of-key-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native   (random-sql)
          calls    (atom 0)
          validate (counting-validate calls "SELECT 'validated'")]
      (validated native validate)
      (validated native validate :engine :mysql)
      (validated native validate :allow-write? true)
      (validated native validate :admin? true)
      (validated (str native " ") validate)
      (is (= 5 @calls)))))

(deftest other-version-is-not-read-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native   (random-sql)
          calls    (atom 0)
          validate (counting-validate calls "SELECT 'validated'")]
      (validated native validate)
      (t2/update! :model/ImpersonationQueryCache :input_query native {:input_version "v0.0.0 (other)"})
      (validated native validate)
      (is (= 2 @calls)))))

(deftest hash-collision-is-cache-miss-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native   (random-sql)
          calls    (atom 0)
          validate (counting-validate calls "SELECT 'validated'")]
      (validated native validate)
      (t2/update! :model/ImpersonationQueryCache :input_query native {:input_query "SELECT 'colliding'"
                                                                      :result_query "SELECT 'colliding'"})
      (testing "a row whose input_query differs is not used, and failing to insert over it does not fail the query"
        (is (= "SELECT 'validated'" (validated native validate)))
        (is (= 2 @calls))))))

(deftest cleanup-deletes-outdated-rows-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [current  (random-sql)
          old      (random-sql)
          outdated (random-sql)
          validate (constantly "SELECT 'validated'")]
      (doseq [native [current old outdated]]
        (validated native validate))
      (t2/update! :model/ImpersonationQueryCache :input_query old {:created_at (t/minus (t/offset-date-time) (t/days 31))})
      (t2/update! :model/ImpersonationQueryCache :input_query outdated {:input_version "v0.0.0 (other)"})
      (#'query-cache-cleanup/cleanup-query-cache!)
      (is (= #{current}
             (t2/select-fn-set :input_query :model/ImpersonationQueryCache
                               :input_query [:in [current old outdated]])))
      (is (= config/mb-version-string
             (t2/select-one-fn :input_version :model/ImpersonationQueryCache :input_query current))))))
