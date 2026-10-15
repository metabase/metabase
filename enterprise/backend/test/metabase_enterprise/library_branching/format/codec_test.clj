(ns metabase-enterprise.library-branching.format.codec-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.toy-codec :as toy]
   [metabase-enterprise.library-branching.mutation.core :as mut]))

(set! *warn-on-reflection* true)

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

;;; ---------------------------------------------------- The reader ---------------------------------------------------

(defn- unreadable? [s]
  (try (codec/read-yaml (if (string? s) (utf-8 s) s)) false
       (catch clojure.lang.ExceptionInfo e (= ::codec/unreadable (:type (ex-data e))))))

(deftest read-yaml-test
  (testing "a document reads to maps with keyword keys, vectors and scalars"
    (is (= {:a 1 :b ["x" nil true] :c {:d "e"} :lib/type "mbql"}
           (codec/read-yaml (utf-8 "a: 1\nb: [x, null, true]\nc: {d: e}\nlib/type: mbql\n"))))
    (is (= [1 2] (codec/read-yaml (utf-8 "- 1\n- 2\n")))))
  (testing "a text that is not exactly one document of the model is unreadable"
    (are [s] (unreadable? s)
      ""
      "a: 1\n---\nb: 2\n"
      "a: 1\na: 2\n"
      "1: x\n"
      "a: 2024-01-01\n"
      "a: !!binary AAc=\n"
      "a: !!set {x, y}\n"
      "a: .nan\n"
      "a: [unclosed\n"
      "a: !java.io.File /etc/passwd\n"
      (byte-array [0x61 0x3A 0x20 0xC3 0x28 0x0A]))))

(def ^:private reader-mutations
  [{:name   :duplicate-keys-allowed
    :doc    "The reader takes the last of two equal keys, so a file with a hand-edit conflict reads without a finding."
    :target `codec/parse
    :edits  [[:replace 'false true {:nth 1}]]}
   {:name   :first-document-only
    :doc    "The reader reads the first document of a text with several, and ignores the rest."
    :target `codec/read-yaml
    :edits  [[:replace '(= 1 (count docs)) true]]}])

(deftest reader-mutations-test
  (mut/check reader-mutations {:tests [#'read-yaml-test]}))

;;; ---------------------------------------------------- by-kind ------------------------------------------------------

(deftest by-kind-test
  (testing "by-kind maps each kind to its codec"
    (is (= (set toy/kinds) (set (keys (codec/by-kind toy/codecs)))))
    (is (= :leaf (codec/kind (get (codec/by-kind toy/codecs) :leaf)))))
  (testing "two codecs of one kind throw"
    (is (thrown? clojure.lang.ExceptionInfo (codec/by-kind (conj toy/codecs (first toy/codecs)))))))
