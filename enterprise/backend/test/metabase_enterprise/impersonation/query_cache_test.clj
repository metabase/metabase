(ns metabase-enterprise.impersonation.query-cache-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.impersonation.models.impersonation-query-cache :as impersonation-query-cache]
   [metabase-enterprise.impersonation.query-cache :as query-cache]
   [metabase-enterprise.impersonation.task.query-cache-cleanup :as query-cache-cleanup]
   [metabase.config.core :as config]
   [metabase.driver.sql :as driver.sql]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(deftest valid-result-is-cached-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native   (mt/random-name)
          calls    (atom 0)
          validate (fn [] (swap! calls inc) "SELECT 1")]
      (is (= "SELECT 1" (query-cache/validated-query :postgres false false native validate)))
      (is (= "SELECT 1" (query-cache/validated-query :postgres false false native validate)))
      (is (= 1 @calls)))))

(deftest refusal-with-result-is-cached-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (doseq [[result allow-write? reason message] [[:unparseable   false nil                  #"Unable to parse native query"]
                                                  [:invalid       false nil                  #"Must be a single select statement"]
                                                  [:invalid       true  nil                  #"Must be a single insert, update, or delete statement"]
                                                  [:unvalidatable false "large-literal-list" #"Unable to validate this native query"]]]
      (testing (str result " allow-write? " allow-write?)
        (let [native  (mt/random-name)
              refusal (driver.sql/impersonated-query-refusal result native allow-write? reason)]
          (is (thrown-with-msg? ExceptionInfo message
                                (query-cache/validated-query :postgres allow-write? false native #(throw refusal))))
          (is (thrown-with-msg? ExceptionInfo message
                                (query-cache/validated-query :postgres allow-write? false native (constantly "SELECT 1"))))
          (is (= (ex-data refusal)
                 (try
                   (query-cache/validated-query :postgres allow-write? false native (constantly "SELECT 1"))
                   (catch ExceptionInfo e
                     (ex-data e))))))))))

(deftest refusal-without-result-is-not-cached-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native   (mt/random-name)
          calls    (atom 0)
          validate (fn [] (swap! calls inc) (throw (ex-info "Boom" {})))]
      (is (thrown-with-msg? ExceptionInfo #"Boom" (query-cache/validated-query :postgres false false native validate)))
      (is (thrown-with-msg? ExceptionInfo #"Boom" (query-cache/validated-query :postgres false false native validate)))
      (is (= 2 @calls)))))

(deftest every-input-is-part-of-key-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native (mt/random-name)]
      (query-cache/validated-query :postgres false false native (constantly "SELECT 1"))
      (is (= "SELECT 2" (query-cache/validated-query :mysql false false native (constantly "SELECT 2"))))
      (is (= "SELECT 2" (query-cache/validated-query :postgres true false native (constantly "SELECT 2"))))
      (is (= "SELECT 2" (query-cache/validated-query :postgres false true native (constantly "SELECT 2"))))
      (is (= "SELECT 2" (query-cache/validated-query :postgres false false (str native " ") (constantly "SELECT 2")))))))

(deftest other-version-is-not-read-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native (mt/random-name)]
      (query-cache/validated-query :postgres false false native (constantly "SELECT 1"))
      (t2/update! :model/ImpersonationQueryCache :input_query native {:input_version "v0.0.0 (other)"})
      (is (= "SELECT 2" (query-cache/validated-query :postgres false false native (constantly "SELECT 2")))))))

(deftest hash-collision-is-replaced-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native (mt/random-name)]
      (query-cache/validated-query :postgres false false native (constantly "SELECT 1"))
      (t2/update! :impersonation_query_cache :input_query native {:input_query "SELECT 'colliding'"})
      (testing "row whose input_query differs is not used, and replacing it keeps surrounding transaction usable"
        (t2/with-transaction [_conn]
          (is (= "SELECT 2" (query-cache/validated-query :postgres false false native (constantly "SELECT 2"))))
          (is (= "SELECT 2" (t2/select-one-fn :result_query :model/ImpersonationQueryCache :input_query native))))))))

(deftest hash-follows-input-query-test
  (mt/with-model-cleanup [:model/ImpersonationQueryCache]
    (let [native  (mt/random-name)
          changed (mt/random-name)]
      (query-cache/validated-query :postgres false false native (constantly "SELECT 1"))
      (is (= (impersonation-query-cache/query-hash native)
             (t2/select-one-fn :input_query_hash :model/ImpersonationQueryCache :input_query native)))
      (t2/update! :model/ImpersonationQueryCache :input_query native {:input_query changed})
      (is (= (impersonation-query-cache/query-hash changed)
             (t2/select-one-fn :input_query_hash :model/ImpersonationQueryCache :input_query changed))))))

(deftest cleanup-deletes-outdated-rows-test
  (mt/with-temporary-setting-values [impersonation-query-cache-retention-days 7]
    (mt/with-model-cleanup [:model/ImpersonationQueryCache]
      (let [current  (mt/random-name)
            recent   (mt/random-name)
            old      (mt/random-name)
            outdated (mt/random-name)]
        (doseq [native [current recent old outdated]]
          (query-cache/validated-query :postgres false false native (constantly "SELECT 1")))
        (t2/update! :model/ImpersonationQueryCache :input_query recent {:created_at (t/minus (t/offset-date-time) (t/days 6))})
        (t2/update! :model/ImpersonationQueryCache :input_query old {:created_at (t/minus (t/offset-date-time) (t/days 8))})
        (t2/update! :model/ImpersonationQueryCache :input_query outdated {:input_version "v0.0.0 (other)"})
        (#'query-cache-cleanup/cleanup-query-cache!)
        (is (= #{current recent}
               (t2/select-fn-set :input_query :model/ImpersonationQueryCache
                                 :input_query [:in [current recent old outdated]])))
        (is (= config/mb-version-string
               (t2/select-one-fn :input_version :model/ImpersonationQueryCache :input_query current)))))))
