(ns metabase-enterprise.library-branching.format.writer-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.writer :as writer]
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
  "Generates what `write-yaml` accepts: a document in which a set of scalars can stand for a vector."
  (gen/recursive-gen (fn [inner]
                       (gen/one-of [(gen/vector inner 0 4)
                                    (gen/set scalar-gen {:max-elements 4})
                                    (gen/map key-gen inner {:max-elements 4})]))
                     scalar-gen))

(defn- scramble
  "Equal to `x`, with every map and set built in a different order. A set becomes a sorted set in the reverse order of
  the written text of its elements; the order agrees with `=`, as `contains?` of a sorted set needs."
  [x]
  (cond
    (map? x)    (apply array-map (mapcat (fn [[k v]] [k (scramble v)]) (reverse (seq x))))
    (set? x)    (into (sorted-set-by #(compare (text (writer/write-yaml %2)) (text (writer/write-yaml %1)))) (map scramble) x)
    (vector? x) (mapv scramble x)
    :else       x))

;;; ------------------------------------------------------ Laws -------------------------------------------------------

(defspec read-inverts-write-test 300
  (prop/for-all [doc document-gen]
    (= doc (codec/read-yaml (writer/write-yaml doc)))))

(defspec canonical-bytes-test 300
  (prop/for-all [doc input-gen]
    (let [scrambled (scramble doc)]
      (and (= doc scrambled)
           (= (seq (writer/write-yaml doc)) (seq (writer/write-yaml scrambled)))))))

(defspec written-text-is-utf-8-with-final-newline-test 100
  (prop/for-all [doc (gen/map key-gen document-gen {:max-elements 4})]
    (let [b (writer/write-yaml doc)]
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
    (is (= golden-text (text (writer/write-yaml golden-doc))))
    (is (= golden-text (text (writer/write-yaml (scramble golden-doc))))))
  (testing "a file is in block style also when it holds only scalars; an empty map or vector is in flow style"
    (is (= "kind: leaf\nid: x\nname: Robin\n" (text (writer/write-yaml {:name "Robin" :id "x" :kind "leaf"}))))
    (is (= "- a\n- b\n" (text (writer/write-yaml ["a" "b"]))))
    (is (= "{}\n" (text (writer/write-yaml {})))))
  (testing "-0.0 and 0.0 are equal, so they give equal bytes"
    (is (= (seq (writer/write-yaml {:x 0.0})) (seq (writer/write-yaml {:x -0.0})))))
  (testing "a value outside the document model throws"
    (doseq [bad [{:k :keyword-value} {:k ##NaN} {:k ##Inf} {:k 1/3} {"k" 1} {:k \c} {:k (float 1.5)} {:k (Object.)}
                 {:k (list 1 2)}]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not in the document model" (writer/write-yaml bad))
          (pr-str bad)))))

(def ^:private writer-mutations
  [{:name   :unsorted-keys
    :doc    "The writer keeps the key order of the input map, so equal maps can give different bytes."
    :target `writer/canonical
    :edits  [[:replace '(sort-by (comp key-order key) (update-keys x key-name)) '(update-keys x key-name)]]}
   {:name   :unsorted-sets
    :doc    "The writer keeps the iteration order of a set, so equal sets can give different bytes."
    :target `writer/canonical
    :edits  [[:replace '(sort-by yaml-text (map canonical x)) '(map canonical x)]]}
   {:name   :signed-zero
    :doc    "The writer writes -0.0 as -0.0, so two equal doubles give different bytes."
    :target `writer/canonical
    :edits  [[:replace '(if (zero? x) 0.0 x) 'x]]}
   {:name   :literal-for-every-string
    :doc    "Every string is a literal block. The text is still canonical and still reads back, but it is not legible."
    :target `writer/scalar-style
    :edits  [[:replace '(str/includes? s "\n") true]]}])

(deftest writer-mutations-test
  (mut/check writer-mutations {:tests [#'write-yaml-test #'canonical-bytes-test]}))
