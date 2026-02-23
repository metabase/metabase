;; This is a driver test currently to benefit from the localstack S3 setup in driver tests.
;; Perhaps we should create a new testing category?
;; This code otherwise runs in the appdb section, but it does not touch the appdb.
(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.s3-test
  "Tests for S3 operations in transforms-python module."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.test :as mt]
   [metabase.util.log :as log])
  (:import
   (java.net ConnectException)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (software.amazon.awssdk.services.s3 S3Client)))

(set! *warn-on-reflection* true)

(comment
  (remove-ns (ns-name *ns*)))

(defn- s3-endpoint-running? []
  (try
    (http/head (transforms-python.settings/python-runner-url) {:throw-exceptions false})
    (catch ConnectException _
      false)))

;; TODO remove this once CI situation is resolved
(use-fixtures :each (fn [thunk]
                      (if (s3-endpoint-running?)
                        (thunk)
                        (log/warn "Skipping S3 tests because localstack isn't running"))))

(deftest s3-read-write-test
  (testing "We can open an s3 connection, and read and write things"
    (with-open [s3-client (s3/create-s3-client)]
      (is (instance? S3Client s3-client))
      (let [bucket (transforms-python.settings/python-storage-s-3-bucket)
            key    (str "test-object-" (random-uuid) ".txt")
            body   (str "Hello, S3! My secret is:" (random-uuid))]

        (is (nil? (s3/read-to-string s3-client bucket key)))
        (is (= :default (s3/read-to-string s3-client bucket key :default)))

        (let [tmp-file (Files/createTempFile "s3-test" ".txt" (into-array FileAttribute []))]
          (try
            (spit (.toFile tmp-file) body)

            (is (s3/upload-file s3-client bucket key (.toFile tmp-file)))

            (is (= body (s3/read-to-string s3-client bucket key)))
            (is (= body (s3/read-to-string s3-client bucket key :default)))

            (s3/delete s3-client bucket key)

            (is (nil? (s3/read-to-string s3-client bucket key)))
            (is (= :default (s3/read-to-string s3-client bucket key :default)))

            (finally
              (Files/deleteIfExists tmp-file))))))))

(deftest open-s3-shared-storage-test
  (testing "open-s3-shared-storage! returns closeable derefable"
    (mt/with-premium-features #{:transforms-python :transforms}
      (let [table-name->id {"users" 1}
            storage-ref    (s3/open-shared-storage! table-name->id)
            {:keys [s3-client bucket-name objects]} @storage-ref]
        (testing "can be dereferenced"
          (doseq [[k {:keys [method path url]}] objects
                  :let [url (str/replace url "localstack" "localhost")]]
            (testing (format "%s (%s)" k method)
              (is (= :not-created (s3/read-to-string s3-client bucket-name path :not-created)))
              (let [content (str (random-uuid))]
                (case method
                  ;; Files that we should write, and python-runner should fetch
                  :get (let [tmp-file (Files/createTempFile "s3-test" ".txt" (into-array FileAttribute []))]
                         (try
                           (spit (.toFile tmp-file) content)
                           (is (s3/upload-file s3-client bucket-name path (.toFile tmp-file)))
                           (finally
                             (Files/deleteIfExists tmp-file)))
                         (is (= content (s3/read-to-string s3-client bucket-name path :not-created)))
                         (is (= content (:body (http/get url)))))
                  ;; Files that python-runner should post, and we should fetch
                  :put (do
                         (is (http/put url {:body content}))
                         (is (= content (s3/read-to-string s3-client bucket-name path :not-created)))))))))

        (testing "closing the ref deletes the files"
          (.close storage-ref)
          (doseq [[k {:keys [path]}] objects]
            (testing (str k)
              (is (= :not-created (s3/read-to-string s3-client bucket-name path :not-created))))))))))
