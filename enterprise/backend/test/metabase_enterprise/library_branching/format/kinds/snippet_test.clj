(ns metabase-enterprise.library-branching.format.kinds.snippet-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.snippet :as snippet]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]))

(set! *warn-on-reflection* true)

(def ^:private snippet-id "sNiPpEtsNiPpEtsNiPpE1")
(def ^:private base-id "bAsEbAsEbAsEbAsEbAsE1")
(def ^:private card-id "cArDcArDcArDcArDcArD1")

(def ^:private attrs
  {:content       "{{snippet: Base}} AND {{#1-orders}} AND {{min}}"
   :template_tags {(keyword "snippet: Base") {:type "snippet" :name "snippet: Base" :snippet-name "Base"
                                              :snippet-id base-id :id "8c0d2f0e-0a8b-4b55-9b8f-62e4d1c3a001"}
                   (keyword "#1-orders")     {:type "card" :name "#1-orders" :card-id card-id
                                              :id "8c0d2f0e-0a8b-4b55-9b8f-62e4d1c3a002"}
                   :min                      {:type "number" :name "min" :id "8c0d2f0e-0a8b-4b55-9b8f-62e4d1c3a003"}}})

(def ^:private item
  {:kind  :snippet :name "Filter" :place "snippetssnippetssnipp" :refs (kinds/refs :snippet snippet-id attrs)
   :attrs attrs})

(deftest template-tag-ids-round-trip-test
  ;; The remote-sync scenario of template tag ids that survive an export and an import: a changed tag id would show
  ;; as a false local change.
  (testing "a snippet with template tags decodes to the same tags, with their ids"
    (let [[id decoded] (codec/decode snippet/codec (codec/read-yaml (writer/write-yaml
                                                                     (codec/encode snippet/codec snippet-id item))))]
      (is (= snippet-id id))
      (is (= (:template_tags attrs) (get-in decoded [:attrs :template_tags])))
      (is (= item decoded)))))

(deftest refs-test
  (testing "a snippet refers to the snippets and cards of its template tags"
    (is (= #{[:snippet base-id] [:card card-id]} (kinds/refs :snippet snippet-id attrs))))
  (testing "a snippet with no template tags has no references"
    (is (= #{} (kinds/refs :snippet snippet-id {:content "x"})))))

(deftest home-test
  (testing "a snippet at the root of the Snippets area is in snippets/"
    (is (= {snippet-id "snippets/filter.snippet.yaml"} (layout/layout kinds/codecs {snippet-id item})))))

(def ^:private mutations
  [{:name   :tags-not-walked
    :doc    "The template tags give no references, so a snippet that uses a trashed snippet passes validation."
    :target `snippet/refs
    :edits  [[:replace '(portable/refs (:template_tags attrs)) #{}]]}])

(deftest snippet-mutations-test
  (mut/check mutations {:tests [#'refs-test]}))
