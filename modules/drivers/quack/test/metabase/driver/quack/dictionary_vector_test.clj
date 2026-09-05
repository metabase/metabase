(ns metabase.driver.quack.dictionary-vector-test
  "Tests for DICTIONARY vector decoding — the vector-compression mode that
  didn't appear in live captures (the Quack server flattens everything to FLAT),
  so we synthesize the binary with the encoder and verify the decoder handles it.

  Run via the in-tree test runner (see modules/drivers/quack/README.md)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.quack.codec :as c]
   [metabase.driver.quack.wire :as wire])
  (:import [java.nio ByteBuffer ByteOrder]))

(set! *warn-on-reflection* true)

(defn- cat-bytes
  "Concatenate byte arrays (local copy of the codec's private cat)."
  ^bytes [& xs]
  (let [parts (filter some? xs)
        total (reduce + 0 (map alength parts))
        out   (byte-array total)]
    (loop [i 0 [x & rest] parts]
      (if-not x out
              (let [^bytes b x]
                (System/arraycopy b 0 out i (alength b))
                (recur (+ i (alength b)) rest))))))

(defn- lt-varchar
  "LogicalType object for VARCHAR (id 25, no type-info)."
  ^bytes [] (c/object (c/field 100 (c/varuint 25))))

(defn- flat-varchar-vec
  "FLAT VARCHAR vector with `values` (no nulls)."
  ^bytes [values]
  (let [list-bytes (reduce cat-bytes (c/varuint (count values)) (map c/string values))]
    (c/object
     (c/field 100 (c/bool false))           ; no validity
     (c/field 102 list-bytes))))

(defn- dict-vec
  "DICTIONARY vector: field 90=3, 91=sel_vector blob, 92=dict_count,
  then a bare FLAT child vector (the dictionary)."
  ^bytes [selection dictionary-values]
  (let [sel (byte-array (* 4 (count selection)))
        bb  (-> (ByteBuffer/wrap sel) (.order ByteOrder/LITTLE_ENDIAN))]
    (doseq [idx selection] (.putInt bb (int idx)))
    (c/object
     (c/field 90 (c/varuint 3))
     (c/field 91 (c/blob sel))
     (c/field 92 (c/varuint (count dictionary-values)))
     (flat-varchar-vec dictionary-values))))

(defn- prepare-with-dict
  "Minimal PREPARE_RESPONSE with one VARCHAR DICT column."
  ^bytes [selection dictionary]
  (let [chunk   (c/object
                 (c/field 100 (c/varuint (count selection)))
                 (c/field 101 (cat-bytes (c/varuint 1) (lt-varchar)))
                 (c/field 102 (cat-bytes (c/varuint 1) (dict-vec selection dictionary))))
        wrapper (cat-bytes (byte-array [(byte 1)]) (c/object (c/field 300 chunk)))
        body    (c/object
                 (c/field 1 (cat-bytes (c/varuint 1) (lt-varchar)))
                 (c/field 2 (cat-bytes (c/varuint 1) (c/string "colors")))
                 (c/field 3 (c/bool false))
                 (c/field 4 (cat-bytes (c/varuint 1) wrapper)))]
    (cat-bytes (c/header c/type-prepare-response) body)))

(deftest dictionary-vector-decode-test
  (testing "a DICTIONARY vector decodes to the projected values from the dictionary"
    (let [expected ["red" "blue" "red" "blue" "red"]
          resp     (wire/decode-response (prepare-with-dict [0 1 0 1 0] ["red" "blue"]))]
      (is (= :prepare-response (-> resp :header :type)))
      (let [chunk (-> resp :body :chunks first)]
        (is (= 5 (:rows chunk)))
        (is (= ["colors"] (-> resp :body :result-names)))
        (is (= expected (first (:column-values chunk)))
            "DICT vector projects selection onto dictionary correctly")))))

(deftest dictionary-vector-single-element-test
  (testing "a DICTIONARY vector with a single-element dictionary broadcasts correctly"
    (let [resp (wire/decode-response (prepare-with-dict [0 0 0] ["only"]))]
      (is (= ["only" "only" "only"]
             (first (:column-values (-> resp :body :chunks first))))))))
