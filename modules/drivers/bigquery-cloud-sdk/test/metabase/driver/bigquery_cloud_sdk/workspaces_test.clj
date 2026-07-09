(ns metabase.driver.bigquery-cloud-sdk.workspaces-test
  "Pure-logic unit tests for the BigQuery workspace pre-flight helpers. These
   don't talk to GCP — see `workspace-isolation-test` for the live driver
   suite that exercises the same code paths against a real BigQuery project."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk.workspaces :as bigquery.ws])
  (:import
   (com.google.cloud.bigquery Acl Acl$IamMember Acl$Role Acl$User BigQueryException)))

(set! *warn-on-reflection* true)

(def ^:private sa-email "ws-admin@my-proj.iam.gserviceaccount.com")

(deftest acl-list-permits-update?-test
  (let [permits? #'bigquery.ws/acl-list-permits-update?]
    (testing "OWNER grant via Acl$User matches"
      (is (true? (permits? [(Acl/of (Acl$User. sa-email) Acl$Role/OWNER)] sa-email))))
    (testing "WRITER grant via Acl$User matches"
      (is (true? (permits? [(Acl/of (Acl$User. sa-email) Acl$Role/WRITER)] sa-email))))
    (testing "READER grant does not permit ACL update"
      (is (false? (permits? [(Acl/of (Acl$User. sa-email) Acl$Role/READER)] sa-email))))
    (testing "OWNER grant for a different user does not match"
      (is (false? (permits? [(Acl/of (Acl$User. "someone-else@example.com") Acl$Role/OWNER)]
                            sa-email))))
    (testing "IamMember-style serviceAccount: grant matches (false-negative fix)"
      (is (true? (permits? [(Acl/of (Acl$IamMember. (str "serviceAccount:" sa-email)) Acl$Role/OWNER)]
                           sa-email))))
    (testing "IamMember without serviceAccount: prefix does not match"
      (is (false? (permits? [(Acl/of (Acl$IamMember. sa-email) Acl$Role/OWNER)]
                            sa-email))))
    (testing "Empty ACL list never permits"
      (is (false? (permits? [] sa-email))))))

(deftest throw-get-dataset-exception!-test
  (let [throw-exc! #'bigquery.ws/throw-get-dataset-exception!
        project    "my-proj"
        dataset    "my_ds"]
    (testing "403 maps to :dataset-unreadable 412"
      (let [bqe    (BigQueryException. 403 "Permission denied on dataset")
            thrown (try (throw-exc! bqe project dataset sa-email)
                        nil
                        (catch clojure.lang.ExceptionInfo e e))]
        (is (some? thrown))
        (is (= {:status-code 412
                :schema      dataset
                :project     project
                :admin-user  sa-email
                :cause-type  :dataset-unreadable}
               (ex-data thrown)))
        (is (= bqe (ex-cause thrown)))
        (is (re-find #"dataViewer" (ex-message thrown)))))
    (testing "404 maps to :dataset-missing 412 (not dataViewer remediation)"
      (let [bqe    (BigQueryException. 404 "Not found: Dataset my-proj:my_ds")
            thrown (try (throw-exc! bqe project dataset sa-email)
                        nil
                        (catch clojure.lang.ExceptionInfo e e))]
        (is (some? thrown))
        (is (= :dataset-missing (:cause-type (ex-data thrown))))
        (is (= 412 (:status-code (ex-data thrown))))
        (is (not (re-find #"dataViewer" (ex-message thrown))))
        (is (re-find #"Confirm the dataset name" (ex-message thrown)))))
    (testing "503 (and other transient codes) rethrow the original BigQueryException"
      (let [bqe    (BigQueryException. 503 "Service unavailable")
            thrown (try (throw-exc! bqe project dataset sa-email)
                        nil
                        (catch Throwable t t))]
        (is (identical? bqe thrown))))
    (testing "0 (network/auth wrapped) rethrows untouched"
      (let [bqe    (BigQueryException. 0 "Connection reset")
            thrown (try (throw-exc! bqe project dataset sa-email)
                        nil
                        (catch Throwable t t))]
        (is (identical? bqe thrown))))
    (testing "nil .getReason falls back rather than rendering literal \"null\""
      ;; BigQueryException(int, String) sets message; getReason returns nil.
      (let [bqe    (BigQueryException. 403 "permission denied")
            thrown (try (throw-exc! bqe project dataset sa-email)
                        nil
                        (catch clojure.lang.ExceptionInfo e e))]
        (is (some? thrown))
        (is (not (re-find #"null" (ex-message thrown))))
        (is (re-find #"permission denied" (ex-message thrown)))))))

(deftest check-can-grant-blank-dataset-test
  (testing "Blank dataset name in `schemas` throws 412-style ex-info before any GCP call"
    ;; Call the defmethod fn directly so we don't need the driver hierarchy
    ;; loaded just to exercise the pure blank-guard branch.
    (let [check  (get-method driver/check-can-grant-workspace-access! :bigquery-cloud-sdk)
          thrown (try
                   (check :bigquery-cloud-sdk
                          {:id 42 :details {} :engine :bigquery-cloud-sdk}
                          [""])
                   nil
                   (catch clojure.lang.ExceptionInfo e e))]
      (is (some? thrown))
      (is (= {:database-id 42 :step :grant} (ex-data thrown))))))

(deftest check-can-grant-empty-schemas-test
  (testing "Empty `schemas` is a no-op (no GCP client constructed)"
    (let [check (get-method driver/check-can-grant-workspace-access! :bigquery-cloud-sdk)]
      (is (nil? (check :bigquery-cloud-sdk
                       {:id 42 :details {} :engine :bigquery-cloud-sdk}
                       []))))))
