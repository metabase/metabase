(ns metabase-enterprise.transforms-python.base-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.base :as base]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.util :as u])
  (:import
   (java.io ByteArrayInputStream File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- jsonl-temp-file
  ^File [^String contents]
  (let [path (Files/createTempFile "transforms-python-base-test-" ".jsonl"
                                   (u/varargs FileAttribute))
        f    (.toFile path)]
    (.deleteOnExit f)
    (spit f contents)
    f))

(deftest count-jsonl-rows-test
  (testing "counts data lines"
    (is (== 3 (#'base/count-jsonl-rows
               (jsonl-temp-file "{\"a\":1}\n{\"a\":2}\n{\"a\":3}\n")))))
  (testing "treats the python runner's empty-DataFrame placeholder (a single blank line) as zero rows"
    (is (== 0 (#'base/count-jsonl-rows
               (jsonl-temp-file "\n")))))
  (testing "counts the final line even without a trailing newline"
    (is (== 2 (#'base/count-jsonl-rows
               (jsonl-temp-file "{\"a\":1}\n{\"a\":2}")))))
  (testing "skips interleaved blank lines"
    (is (== 2 (#'base/count-jsonl-rows
               (jsonl-temp-file "{\"a\":1}\n\n{\"a\":2}\n"))))))

(defn- closeable-deref
  "A reify of (IDeref + Closeable) so a mocked `s3/open-shared-storage!` survives the production `with-open`/`@`."
  ^java.io.Closeable [value]
  (reify
    clojure.lang.IDeref
    (deref [_] value)
    java.io.Closeable
    (close [_])))

(deftest run-python-transform-impl!-augments-response-with-row-count-test
  (testing "run-python-transform-impl! sets `:rows-affected` on the python-runner response, sourced from the JSONL output row count"
    (let [jsonl              "{\"a\":1}\n{\"a\":2}\n{\"a\":3}\n"
          stub-storage       (closeable-deref {:s3-client nil :bucket-name "test" :objects {}})
          recorded-rows      (atom :unset)
          stub-message-log   (base/empty-message-log)
          cancel-chan        (a/promise-chan)
          fake-output-stream #(ByteArrayInputStream. (.getBytes ^String jsonl))]
      (with-redefs-fn
        {#'transforms-base.u/resolve-source-tables             (constantly [])
         #'s3/open-shared-storage!                             (constantly stub-storage)
         #'python-runner/copy-tables-to-s3!                    (constantly nil)
         #'python-runner/execute-python-code-http-call!        (constantly {:status 200 :body {:exit_code 0}})
         #'python-runner/read-output-manifest                  (constantly {:fields [{:name "a" :base_type "Integer"}]})
         #'python-runner/read-events                           (constantly [])
         #'python-runner/open-output                           (fn [_] (fake-output-stream))
         #'transforms.instrumentation/record-data-transfer!    (fn [_run-id _stage _bytes rows]
                                                                 (reset! recorded-rows rows))
         #'base/start-cancellation-process!                    (constantly nil)
         #'base/transfer-file-to-db                            (constantly nil)}
        (fn []
          (let [response (#'base/run-python-transform-impl!
                          {:source {:source-tables [] :body "stub"}
                           :target {:type "table"}
                           :id     7}
                          {:engine :h2 :id 1}
                          42
                          cancel-chan
                          stub-message-log
                          {})]
            (testing "response gains `:rows-affected` equal to the JSONL row count"
              (is (= 3 (:rows-affected response)))
              (is (= 200 (:status response))
                  "existing keys on the response are preserved"))
            (testing "record-data-transfer! receives the same row count instead of the historical hardcoded nil"
              (is (= 3 @recorded-rows)))))))))
