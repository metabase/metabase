(ns metabase-enterprise.transforms-python.bound-secrets-test
  "The Python runner token and the S3 keys are self-addressed: their destination comes from settings, never from a
  request. These tests pin that each sink opens the stored bound Secret against that destination, and refuses one
  bound somewhere else. Deliberately not gated on localstack or a running runner: nothing here touches the network."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.test :as mt]
   [metabase.util.secret :as u.secret])
  (:import
   (clojure.lang ExceptionInfo)
   (software.amazon.awssdk.auth.credentials AwsCredentials AwsCredentialsProvider)))

(set! *warn-on-reflection* true)

(defn- bound-elsewhere
  "A Secret whose audience names a destination other than the one the settings describe."
  [value audience]
  (u.secret/secret value {:audience-schema (into [:map] (map (fn [k] [k {:optional true} :string])) (keys audience))
                          :audience        audience}))

(deftest authorization-headers-open-the-stored-token-test
  (mt/with-premium-features #{:transforms-python}
    (mt/with-temporary-setting-values [python-runner-url       "http://runner.example.com:5001"
                                       python-runner-api-token "runner-secret"]
      (is (= {"Authorization" "Bearer runner-secret"}
             (#'python-runner/authorization-headers))))))

(deftest authorization-headers-refuse-a-token-bound-elsewhere-test
  (mt/with-premium-features #{:transforms-python}
    (mt/with-temporary-setting-values [python-runner-url "http://runner.example.com:5001"]
      (let [secret (bound-elsewhere "runner-secret" {:python-runner-url "http://other.example.com:5001"})]
        (mt/with-dynamic-fn-redefs [transforms-python.settings/python-runner-api-token (constantly secret)]
          (is (thrown-with-msg? ExceptionInfo #"not bound to the requested audience"
                                (#'python-runner/authorization-headers))))))))

(deftest s3-credentials-open-the-stored-keys-test
  (mt/with-premium-features #{:transforms-python}
    (mt/with-temporary-setting-values [python-storage-s-3-endpoint   "http://s3.example.com:4566"
                                       python-storage-s-3-region     "us-east-1"
                                       python-storage-s-3-bucket     "artifacts"
                                       python-storage-s-3-access-key "AKIAEXAMPLE"
                                       python-storage-s-3-secret-key "s3-secret"]
      (let [^AwsCredentialsProvider provider (#'s3/maybe-with-credentials* identity)
            ^AwsCredentials         creds    (.resolveCredentials provider)]
        (is (= "AKIAEXAMPLE" (.accessKeyId creds)))
        (is (= "s3-secret" (.secretAccessKey creds)))))))

(deftest s3-credentials-refuse-a-key-bound-elsewhere-test
  (mt/with-premium-features #{:transforms-python}
    (mt/with-temporary-setting-values [python-storage-s-3-endpoint   "http://s3.example.com:4566"
                                       python-storage-s-3-region     "us-east-1"
                                       python-storage-s-3-bucket     "artifacts"
                                       python-storage-s-3-access-key "AKIAEXAMPLE"]
      (let [secret (bound-elsewhere "s3-secret" {:python-storage-s-3-endpoint "http://s3.example.com:4566"
                                                 :python-storage-s-3-region   "us-east-1"
                                                 :python-storage-s-3-bucket   "someone-elses-bucket"})]
        (mt/with-dynamic-fn-redefs [transforms-python.settings/python-storage-s-3-secret-key (constantly secret)]
          (is (thrown-with-msg? ExceptionInfo #"not bound to the requested audience"
                                (#'s3/maybe-with-credentials* identity))))))))
