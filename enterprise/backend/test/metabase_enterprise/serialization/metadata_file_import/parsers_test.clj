(ns ^:parallel metabase-enterprise.serialization.metadata-file-import.parsers-test
  "Tests for the file-extension format dispatcher. Each test writes a temp file
  with the right extension, then asserts that streaming the file produces the
  expected batches."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.parsers :as parsers])
  (:import
   (java.io File)))

(defn- temp-file ^File [suffix content]
  (let [f (File/createTempFile "parsers-test-" suffix)]
    (.deleteOnExit f)
    (spit f content)
    f))

(defn- collect-batches [^File file array-key batch-size]
  (let [batches (atom [])]
    (parsers/stream-array-batches! file array-key batch-size
                                   (fn [batch] (swap! batches conj (vec batch))))
    @batches))

(deftest dispatches-json-extension-to-json-parser-test
  (testing ".json files are routed to the JSON streaming parser"
    (let [file (temp-file ".json" "{\"databases\":[{\"id\":17,\"name\":\"pg\",\"engine\":\"postgres\"}]}")]
      (try
        (is (= [[[1 {:id 17 :name "pg" :engine "postgres"}]]]
               (collect-batches file :databases 100)))
        (finally (.delete file))))))

(deftest dispatches-yaml-extension-to-yaml-parser-test
  (testing ".yaml files are routed to the YAML streaming parser"
    (let [file (temp-file ".yaml" "databases:\n- id: 17\n  name: pg\n  engine: postgres\n")]
      (try
        (is (= [[[1 {:id 17 :name "pg" :engine "postgres"}]]]
               (collect-batches file :databases 100)))
        (finally (.delete file))))))

(deftest dispatches-yml-extension-to-yaml-parser-test
  (testing ".yml is treated identically to .yaml"
    (let [file (temp-file ".yml" "xs:\n- v: 1\n- v: 2\n")]
      (try
        (is (= [[[1 {:v 1}] [2 {:v 2}]]]
               (collect-batches file :xs 100)))
        (finally (.delete file))))))

(deftest unknown-extension-throws-test
  (testing "a file with an unrecognized extension hard-fails with :kind :unknown_format"
    (let [file (temp-file ".xml" "<not-supported/>")]
      (try
        (try
          (collect-batches file :anything 10)
          (is false "should have thrown")
          (catch clojure.lang.ExceptionInfo e
            (is (= :unknown_format (:kind (ex-data e))))
            (is (string? (.getMessage e)))))
        (finally (.delete file))))))

(deftest extension-detection-is-case-insensitive-test
  (testing "uppercase / mixed-case extensions are accepted (e.g. .JSON, .Yaml)"
    (let [json-file (temp-file ".JSON" "{\"xs\":[{\"v\":1}]}")
          yaml-file (temp-file ".Yaml" "xs:\n- v: 1\n")]
      (try
        (is (= [[[1 {:v 1}]]] (collect-batches json-file :xs 100)))
        (is (= [[[1 {:v 1}]]] (collect-batches yaml-file :xs 100)))
        (finally
          (.delete json-file)
          (.delete yaml-file))))))

(deftest reader-is-closed-after-streaming-test
  (testing "the dispatcher manages the file lifecycle: the InputStream and Reader are
            closed after streaming completes (or throws). Verified by deleting the file
            afterward — on Windows a sharing violation would surface if the FD were leaked."
    (let [file (temp-file ".json" "{\"xs\":[]}")]
      (parsers/stream-array-batches! file :xs 10 (fn [_]))
      (is (.delete file)))))
