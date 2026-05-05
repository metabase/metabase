(ns ^:parallel metabase-enterprise.serialization.metadata-file-import.parsers.yaml-test
  "Tests for the streaming YAML parser. Same shape as the JSON parser tests:
  feed in-memory `StringReader`s and assert on the batches passed to
  `process-batch!`."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.metadata-file-import.parsers.yaml :as yaml])
  (:import
   (java.io StringReader)))

(defn- collect-batches
  [yaml-string array-key batch-size]
  (let [batches (atom [])]
    (with-open [r (StringReader. yaml-string)]
      (yaml/stream-array-batches! r array-key batch-size
                                  (fn [batch] (swap! batches conj (vec batch)))))
    @batches))

(deftest streams-rows-as-keyword-keyed-clojure-maps-with-coerced-scalars-test
  (testing "each item in the named array is a Clojure map with keyword keys; plain
            scalars are coerced — int strings to Long, true/false to Boolean, ~/null
            to nil. Quoted scalars stay String."
    (let [yaml    (str "databases:\n"
                       "- id: 17\n"
                       "  name: pg\n"
                       "  engine: postgres\n"
                       "- id: 18\n"
                       "  name: '18'\n"          ;; quoted — stays string
                       "  engine: h2\n")
          batches (collect-batches yaml :databases 100)]
      (is (= 1 (count batches)))
      (is (= [[1 {:id 17 :name "pg" :engine "postgres"}]
              [2 {:id 18 :name "18" :engine "h2"}]]
             (first batches))))))

(deftest line-numbers-are-1-indexed-across-batches-test
  (testing "line-num is 1-indexed and continues across batch boundaries"
    (let [yaml    (apply str "xs:\n"
                         (for [i (range 1 6)] (format "- v: %d\n" i)))
          batches (collect-batches yaml :xs 2)]
      (is (= 3 (count batches)))
      (is (= [[1 {:v 1}] [2 {:v 2}]]      (nth batches 0)))
      (is (= [[3 {:v 3}] [4 {:v 4}]]      (nth batches 1)))
      (is (= [[5 {:v 5}]]                  (nth batches 2))))))

(deftest empty-array-invokes-callback-zero-times-test
  (testing "empty named array → no callback invocations, no throw"
    (is (= [] (collect-batches "xs: []\n" :xs 100)))))

(deftest accepts-keyword-or-string-array-key-test
  (testing "array-key can be passed as keyword or string"
    (let [yaml "databases:\n- id: 1\n"]
      (is (= [[[1 {:id 1}]]] (collect-batches yaml :databases 10)))
      (is (= [[[1 {:id 1}]]] (collect-batches yaml "databases" 10))))))

(deftest missing-array-key-throws-shape-error-test
  (testing "missing target key throws ex-info with :kind :missing_key"
    (try
      (collect-batches "other: []\n" :databases 10)
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (is (= :missing_key (:kind (ex-data e))))
        (is (= "databases"  (:key (ex-data e))))))))

(deftest non-sequence-value-at-key-throws-shape-error-test
  (testing "if the value at the target key is a mapping (not a sequence), throws :bad_shape"
    (try
      (collect-batches "databases:\n  not: an array\n" :databases 10)
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (is (= :bad_shape (:kind (ex-data e))))))))

(deftest scalar-coercion-rules-test
  (testing "plain scalars coerce per YAML 1.1 rules; quoted scalars stay String"
    (let [yaml    (str "xs:\n"
                       "- int_val: 42\n"
                       "  neg_int: -7\n"
                       "  float_val: 3.14\n"
                       "  bool_t: true\n"
                       "  bool_f: false\n"
                       "  bool_upper: TRUE\n"
                       "  null_tilde: ~\n"
                       "  null_word: null\n"
                       "  null_empty:\n"
                       "  string_quoted: '42'\n"
                       "  string_plain: foo\n")
          [[_ row]] (first (collect-batches yaml :xs 10))]
      (is (= 42        (:int_val row)))
      (is (= -7        (:neg_int row)))
      (is (= 3.14      (:float_val row)))
      (is (= true      (:bool_t row)))
      (is (= false     (:bool_f row)))
      (is (= true      (:bool_upper row)))
      (is (nil?        (:null_tilde row)))
      (is (nil?        (:null_word row)))
      (is (nil?        (:null_empty row)))
      (is (= "42"      (:string_quoted row)) "quoted '42' stays String")
      (is (= "foo"     (:string_plain row))))))

(deftest aliases-rejected-test
  (testing "YAML aliases (anchors via *name) are not supported by our walker — they
            would let one file element refer to another and complicate the streaming
            invariant. Hard-fail with a clear error."
    (try
      (collect-batches (str "shared: &anchor\n"
                            "  k: v\n"
                            "xs:\n"
                            "- *anchor\n")
                       :xs 10)
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (is (= :unsupported_alias (:kind (ex-data e))))))))

(deftest skips-other-top-level-keys-before-target-test
  (testing "the walker advances past unrelated top-level keys (and their values) before
            reaching the target array"
    (let [yaml    (str "version: 1\n"
                       "unrelated_object:\n"
                       "  a: 1\n"
                       "  b:\n"
                       "  - 2\n"
                       "  - 3\n"
                       "unrelated_array:\n"
                       "- 4\n"
                       "- 5\n"
                       "databases:\n"
                       "- id: 99\n")
          batches (collect-batches yaml :databases 10)]
      (is (= [[[1 {:id 99}]]] batches)))))

(deftest exact-batch-size-emits-single-batch-test
  (testing "boundary: when item count equals batch size, callback fires exactly once"
    (let [yaml    "xs:\n- v: 1\n- v: 2\n"
          batches (collect-batches yaml :xs 2)]
      (is (= 1 (count batches)))
      (is (= 2 (count (first batches)))))))

(deftest single-item-with-batch-size-1-test
  (testing "boundary: batch size 1 fires the callback once per item"
    (let [yaml    "xs:\n- v: 1\n- v: 2\n- v: 3\n"
          batches (collect-batches yaml :xs 1)]
      (is (= 3 (count batches))))))
