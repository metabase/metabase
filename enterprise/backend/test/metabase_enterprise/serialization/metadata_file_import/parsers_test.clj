(ns ^:parallel metabase-enterprise.serialization.metadata-file-import.parsers-test
  "Tests for the streaming JSON parser. Each test writes a temp file, then
  asserts on the batches passed to `process-batch!`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.parsers :as parsers])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- temp-json-file ^File [^String content]
  (let [f (File/createTempFile "parsers-test-" ".json")]
    (.deleteOnExit f)
    (spit f content)
    f))

(defn- collect-batches!
  "Stream `json-string` through the parser and return a vector of all batches that
  the callback received, in order. Each batch is a vector of `[line-num row]` tuples."
  [json-string array-key batch-size]
  (let [file    (temp-json-file json-string)
        batches (atom [])]
    (try
      (parsers/stream-array-batches! file array-key batch-size
                                     (fn [batch] (swap! batches conj (vec batch))))
      @batches
      (finally (.delete file)))))

(deftest streams-rows-as-keyword-keyed-clojure-maps-test
  (testing "each item in the named array is parsed into a Clojure map with keyword keys
            (not LinkedHashMap with string keys), wrapped in a [line-num row] tuple"
    (let [batches (collect-batches!
                   "{\"databases\":[{\"id\":17,\"name\":\"pg\",\"engine\":\"postgres\"},
                                    {\"id\":18,\"name\":\"h2\",\"engine\":\"h2\"}]}"
                   :databases 100)]
      (is (= 1 (count batches)))
      (is (= [[1 {:id 17 :name "pg" :engine "postgres"}]
              [2 {:id 18 :name "h2" :engine "h2"}]]
             (first batches))))))

(deftest line-numbers-are-1-indexed-across-batches-test
  (testing "line-num is 1-indexed and continues across batch boundaries — so the third
            item in the source array is `line-num 3`, regardless of which batch it lands in"
    (let [json    (str "{\"xs\":["
                       (str/join "," (for [i (range 1 6)] (format "{\"v\":%d}" i)))
                       "]}")
          batches (collect-batches! json :xs 2)]
      (is (= 3 (count batches)))                                ;; 2 + 2 + 1
      (is (= [[1 {:v 1}] [2 {:v 2}]]      (nth batches 0)))
      (is (= [[3 {:v 3}] [4 {:v 4}]]      (nth batches 1)))
      (is (= [[5 {:v 5}]]                  (nth batches 2))))))

(deftest empty-array-invokes-callback-zero-times-test
  (testing "if the named array is empty, the callback is not invoked at all — caller
            sees no batches, but the parser does not throw"
    (is (= [] (collect-batches! "{\"xs\":[]}" :xs 100)))))

(deftest accepts-keyword-or-string-array-key-test
  (testing "array-key may be passed as a Clojure keyword or as a string; both forms
            normalize to the same JSON key lookup"
    (let [json "{\"databases\":[{\"id\":1}]}"]
      (is (= [[[1 {:id 1}]]] (collect-batches! json :databases 10)))
      (is (= [[[1 {:id 1}]]] (collect-batches! json "databases" 10))))))

(deftest missing-array-key-throws-shape-error-test
  (testing "a top-level object that doesn't contain the requested key throws ex-info with
            :kind :missing-key"
    (try
      (collect-batches! "{\"other\":[]}" :databases 10)
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (is (= :missing-key (:kind (ex-data e))))
        (is (= "databases" (:key (ex-data e))))))))

(deftest non-array-value-at-key-throws-shape-error-test
  (testing "a top-level key whose value is not an array throws ex-info with :kind :bad-shape"
    (try
      (collect-batches! "{\"databases\":{\"not\":\"an array\"}}" :databases 10)
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (is (= :bad-shape (:kind (ex-data e))))))))

(deftest non-object-top-level-throws-shape-error-test
  (testing "a document that doesn't begin with a top-level object throws"
    (try
      (collect-batches! "[1, 2, 3]" :anything 10)
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (is (= :bad-shape (:kind (ex-data e))))))))

(deftest skips-other-top-level-keys-before-target-test
  (testing "the parser advances past unrelated top-level keys (and their values, including
            nested structures) before reaching the target array"
    (let [json    (str "{\"version\":1,"
                       "\"unrelated_object\":{\"a\":1,\"b\":[2,3]},"
                       "\"unrelated_array\":[4,5,6],"
                       "\"databases\":[{\"id\":99}]}")
          batches (collect-batches! json :databases 10)]
      (is (= [[[1 {:id 99}]]] batches)))))

(deftest exact-batch-size-emits-single-batch-test
  (testing "boundary: when item count exactly equals batch size, callback fires once"
    (let [json    "{\"xs\":[{\"v\":1},{\"v\":2}]}"
          batches (collect-batches! json :xs 2)]
      (is (= 1 (count batches)))
      (is (= 2 (count (first batches)))))))

(deftest single-item-with-batch-size-1-test
  (testing "boundary: batch size 1 fires the callback once per item"
    (let [json    "{\"xs\":[{\"v\":1},{\"v\":2},{\"v\":3}]}"
          batches (collect-batches! json :xs 1)]
      (is (= 3 (count batches)))
      (is (= [[1 {:v 1}]] (nth batches 0)))
      (is (= [[2 {:v 2}]] (nth batches 1)))
      (is (= [[3 {:v 3}]] (nth batches 2))))))

(deftest file-handle-is-closed-after-streaming-test
  (testing "the parser manages the file lifecycle: the InputStream and Reader are
            closed after streaming completes (or throws). On Windows a sharing
            violation would surface if the FD were leaked."
    (let [file (temp-json-file "{\"xs\":[]}")]
      (parsers/stream-array-batches! file :xs 10 (fn [_]))
      (is (.delete file)))))
