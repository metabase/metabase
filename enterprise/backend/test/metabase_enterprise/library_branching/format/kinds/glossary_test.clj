(ns metabase-enterprise.library-branching.format.kinds.glossary-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.glossary :as glossary]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.roots :as roots]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private churn-id "ChUrNgLoSsArYtErM0001")
(def ^:private other-id "AcHuRnGlOsSaRyTeRm002")

(def ^:private churn
  {:kind :glossary-term :name "Churn" :place nil :refs #{} :attrs {:definition "The share of customers who cancel."}})

(def ^:private churn-text
  "kind: glossary-term\nid: ChUrNgLoSsArYtErM0001\ndefinition: The share of customers who cancel.\nterm: Churn\n")

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- file-text [id item] (String. ^bytes (writer/write-yaml (codec/encode glossary/codec id item)) "UTF-8"))

(defn- decode-text [s] (codec/decode glossary/codec (codec/read-yaml (utf-8 s))))

(defn- invalid? [s]
  (try
    (decode-text s)
    false
    (catch clojure.lang.ExceptionInfo e
      (= ::codec/invalid (:type (ex-data e))))))

(defn- fits? [item] (mr/validate (codec/schema glossary/codec) item))

(deftest file-test
  (testing "a glossary term is the file glossary/<term>.term.yaml, with its term and its definition"
    (is (= {churn-id "glossary/churn.term.yaml"} (layout/layout kinds/codecs {churn-id churn})))
    (is (= churn-text (file-text churn-id churn))))
  (testing "the file decodes to the item"
    (is (= [churn-id churn] (decode-text churn-text))))
  (testing "of two terms with one slug, the least identity keeps the plain name"
    (is (= {other-id "glossary/churn.term.yaml"
            churn-id "glossary/churn~ChUrNgLoSsArYtErM0001.term.yaml"}
           (layout/layout kinds/codecs {churn-id churn other-id (assoc churn :name "CHURN")})))))

(deftest content-test
  (testing "the one content attribute of a glossary term is its definition, which it needs"
    (is (= #{:definition} (set (keys (:attrs glossary/spec)))))
    (is (fits? churn))
    (is (not (fits? (assoc churn :attrs {}))))
    (is (= :invalid (get-in (tree/decode-file {"glossary-term" glossary/codec}
                                              (utf-8 "kind: glossary-term\nid: ChUrNgLoSsArYtErM0001\nterm: Churn\n"))
                            [:finding :type]))))
  (testing "a term has 1 to 255 characters, as Metabase keeps it"
    (is (fits? (assoc churn :name (apply str (repeat 255 "é")))))
    (is (not (fits? (assoc churn :name (apply str (repeat 256 "a"))))))
    (is (not (fits? (assoc churn :name "")))))
  (testing "a glossary term has no place: an item with a place does not fit, and a file with a collection is invalid"
    (is (not (fits? (assoc churn :place "cOlQuErIeS0ExAmPlE2x1"))))
    (is (invalid? (str churn-text "collection: cOlQuErIeS0ExAmPlE2x1\n")))
    (is (invalid? (str churn-text "parent: cOlQuErIeS0ExAmPlE2x1\n"))))
  (testing "a glossary term has no references, whatever its definition says"
    (is (= #{} (kinds/refs :glossary-term churn-id {:definition "Uses {{snippet: Base}} and [Orders](card:1)."})))
    (is (not (fits? (assoc churn :refs #{[:card "IW8kbqZVaMxdGtCM2F4U6"]})))))
  (testing "Q5: the creator and the bookkeeping columns are not content"
    (doseq [k [:creator_id :created_at :updated_at :entity_id :name]]
      (is (not (fits? (assoc-in churn [:attrs k] "x"))) (str k))
      (is (invalid? (str churn-text (name k) ": x\n")) (str k)))))

(deftest root-test
  (testing "every glossary term is at the root level and is a fixed root"
    (is (= #{churn-id} (roots/root-ids {churn-id churn})))
    (is (= [] (validate/validate {churn-id churn} {:roots (roots/root-ids {churn-id churn})}))))
  (testing "the roots are an argument: without the glossary kind, a glossary term is not a root"
    (is (= #{} (roots/root-ids (update roots/roots :unplaced-kinds disj :glossary-term) {churn-id churn})))))

(deftest tree-test
  (testing "a tree of glossary terms decodes, also as a flat list of files"
    (let [s     {churn-id churn other-id (assoc churn :name "Retention" :attrs {:definition "Who stays."})}
          files (writer/encode-tree kinds/codecs s)]
      (is (= #{"glossary/churn.term.yaml" "glossary/retention.term.yaml" tree/format-path} (set (keys files))))
      (is (= {:snapshot s} (tree/decode-tree kinds/codecs (vals files)))))))

(def ^:private mutations
  [{:name   :not-in-glossary
    :doc    "A glossary term is written in library/, so a person does not find the glossary where the layout says."
    :target `glossary/home
    :edits  [[:replace '{:dir ["glossary"]} '{:dir ["library"]}]]}])

(deftest glossary-mutations-test
  (mut/check mutations {:tests [#'file-test #'tree-test]}))
