(ns metabase-enterprise.library-branching.format.codec-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.toy-codec :as toy]
   [metabase-enterprise.library-branching.mutation.core :as mut]))

(set! *warn-on-reflection* true)

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))
(defn- text ^String [^bytes b] (String. b "UTF-8"))

;;; ---------------------------------------------------- Generators ----------------------------------------------------

(def ^:private code-point-string-gen
  "Strings of any code points but surrogates: control characters, line separators and characters outside the BMP."
  (gen/fmap (fn [cps] (let [sb (StringBuilder.)]
                        (doseq [^int cp cps] (.appendCodePoint sb cp))
                        (str sb)))
            (gen/vector (gen/frequency [[4 (gen/choose 0 0x7F)]
                                        [2 (gen/choose 0x80 0x7FF)]
                                        [1 (gen/elements [0x85 0xA0 0x2028 0x2029 0xFEFF 0xFFFD 0xFFFE 0xFFFF])]
                                        [1 (gen/choose 0x10000 0x10FFFF)]])
                        0 12)))

(def ^:private string-gen
  (gen/one-of [gen/string gen/string-alphanumeric code-point-string-gen
               (gen/elements ["" "null" "~" "true" "no" "123" "1.5" "2024-01-01" "a: b" "- x" "#c" "'" "\""
                              "line\n" "\nline" "a\n\nb\n" " lead" "trail " "\t" "x\r\ny" "*a" "&a" "!t" "%" "@"])]))

(def ^:private key-gen
  (gen/one-of [gen/keyword gen/keyword-ns (gen/fmap keyword string-gen)]))

(def ^:private scalar-gen
  (gen/one-of [string-gen
               gen/large-integer
               (gen/fmap #(* (bigint Long/MAX_VALUE) %) gen/large-integer)
               (gen/double* {:infinite? false :NaN? false})
               gen/boolean
               (gen/return nil)]))

(def document-gen
  "Generates documents: maps with keyword keys, vectors, strings, integers, finite doubles, booleans and nil."
  (gen/recursive-gen (fn [inner]
                       (gen/one-of [(gen/vector inner 0 4)
                                    (gen/map key-gen inner {:max-elements 4})]))
                     scalar-gen))

(def ^:private input-gen
  "Generates what `write-yaml` accepts: a document in which a set can stand for a vector."
  (gen/recursive-gen (fn [inner]
                       (gen/one-of [(gen/vector inner 0 4)
                                    (gen/set inner {:max-elements 4})
                                    (gen/map key-gen inner {:max-elements 4})]))
                     scalar-gen))

(defn- scramble
  "Equal to `x`, with every map and set built in a different order."
  [x]
  (cond
    (map? x)    (apply array-map (mapcat (fn [[k v]] [k (scramble v)]) (reverse (seq x))))
    (set? x)    (into (sorted-set-by #(compare (pr-str %2) (pr-str %1))) (map scramble) x)
    (vector? x) (mapv scramble x)
    :else       x))

;;; ------------------------------------------------------ Laws -------------------------------------------------------

(defspec read-inverts-write-test 300
  (prop/for-all [doc document-gen]
    (= doc (codec/read-yaml (codec/write-yaml doc)))))

(defspec canonical-bytes-test 300
  (prop/for-all [doc input-gen]
    (let [scrambled (scramble doc)]
      (and (= doc scrambled)
           (= (seq (codec/write-yaml doc)) (seq (codec/write-yaml scrambled)))))))

(defspec written-text-is-utf-8-with-final-newline-test 100
  (prop/for-all [doc (gen/map key-gen document-gen {:max-elements 4})]
    (let [b (codec/write-yaml doc)]
      (and (str/ends-with? (text b) "\n")
           (= (seq b) (seq (utf-8 (text b))))))))

;;; ---------------------------------------------------- The writer ---------------------------------------------------

(def ^:private golden-doc
  {:query   {:stages [{:source-table ["Sample Database" "PUBLIC" "ORDERS"]
                       :aggregation  [["sum" {} ["field" {:base-type "type/Float"} ["Sample Database" "PUBLIC" "ORDERS" "TOTAL"]]]]}]}
   :name    "Total Revenue"
   :id      "IW8kbqZVaMxdGtCM2F4U6"
   :kind    "metric"
   :tags    #{"b" "a"}
   :body    "import pandas as pd\n\ndef transform():\n    pass\n"
   :ratio   -0.0
   :count   12
   :public  false
   :note    nil
   :quoted  "123"
   :accents "Société générale"
   :lib/type "mbql/query"})

(def ^:private golden-text
  (str "kind: metric\n"
       "id: IW8kbqZVaMxdGtCM2F4U6\n"
       "accents: Société générale\n"
       "body: |\n"
       "  import pandas as pd\n"
       "\n"
       "  def transform():\n"
       "      pass\n"
       "count: 12\n"
       "lib/type: mbql/query\n"
       "name: Total Revenue\n"
       "note: null\n"
       "public: false\n"
       "query:\n"
       "  stages:\n"
       "  - aggregation:\n"
       "    - - sum\n"
       "      - {}\n"
       "      - - field\n"
       "        - {base-type: type/Float}\n"
       "        - [Sample Database, PUBLIC, ORDERS, TOTAL]\n"
       "    source-table: [Sample Database, PUBLIC, ORDERS]\n"
       "quoted: '123'\n"
       "ratio: 0.0\n"
       "tags: [a, b]\n"))

(deftest write-yaml-test
  (testing "the canonical text: kind and id first, then sorted keys; flow style for a collection of scalars; a
            literal block for text with a line break; a set as a sorted sequence; 0.0 for -0.0; UTF-8 with no escape"
    (is (= golden-text (text (codec/write-yaml golden-doc))))
    (is (= golden-text (text (codec/write-yaml (scramble golden-doc))))))
  (testing "-0.0 and 0.0 are equal, so they give equal bytes"
    (is (= (seq (codec/write-yaml {:x 0.0})) (seq (codec/write-yaml {:x -0.0})))))
  (testing "a value outside the document model throws"
    (doseq [bad [{:k :keyword-value} {:k ##NaN} {:k ##Inf} {:k 1/3} {"k" 1} {:k \c} {:k (float 1.5)} {:k (Object.)}
                 {:k (list 1 2)}]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not in the document model" (codec/write-yaml bad))
          (pr-str bad)))))

(def ^:private writer-mutations
  [{:name   :unsorted-keys
    :doc    "The writer keeps the key order of the input map, so equal maps can give different bytes."
    :target `codec/canonical
    :edits  [[:replace '(sort-by key key-order (update-keys x key-name)) '(update-keys x key-name)]]}
   {:name   :unsorted-sets
    :doc    "The writer keeps the iteration order of a set, so equal sets can give different bytes."
    :target `codec/canonical
    :edits  [[:replace '(sort-by pr-str (map canonical x)) '(map canonical x)]]}
   {:name   :signed-zero
    :doc    "The writer writes -0.0 as -0.0, so two equal doubles give different bytes."
    :target `codec/canonical
    :edits  [[:replace '(if (zero? x) 0.0 x) 'x]]}
   {:name   :literal-for-every-string
    :doc    "Every string is a literal block. The text is still canonical and still reads back, but it is not legible."
    :target `codec/scalar-style
    :edits  [[:replace '(str/includes? s "\n") true]]}])

(deftest writer-mutations-test
  (mut/check writer-mutations {:tests [#'write-yaml-test #'canonical-bytes-test]}))

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
    :edits  [[:replace ':allow-duplicate-keys false] [:replace 'false true]]}
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
