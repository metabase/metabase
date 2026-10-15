(ns metabase-enterprise.library-branching.format.kinds.published-table-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.published-table :as published-table]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private events [sd nil "EVENTS"])

(def ^:private attrs
  {:description "Raw events."
   :fields      {:ID      {:visibility_type "hidden"}
                 :PAYLOAD {:display_name "Payload"
                           :fields       {:user {:fk_target [sd "PUBLIC" "PEOPLE" "ID"]
                                                 :fields    {:email {:semantic_type "type/Email"}}}}}}})

(def ^:private item
  {:kind  :published-table
   :name  "Events"
   :place nil
   :refs  (kinds/refs :published-table events attrs)
   :attrs attrs})

(deftest refs-test
  (testing "a published table refers to its table, to each field with settings (nested fields by path), and to each
            foreign-key target"
    (is (= #{[:table [:env events]]
             [:field [:env [sd nil "EVENTS" "ID"]]]
             [:field [:env [sd nil "EVENTS" "PAYLOAD"]]]
             [:field [:env [sd nil "EVENTS" "PAYLOAD" "user"]]]
             [:field [:env [sd nil "EVENTS" "PAYLOAD" "user" "email"]]]
             [:fk-target [:env [sd "PUBLIC" "PEOPLE" "ID"]]]}
           (kinds/refs :published-table events attrs))))
  (testing "a table with no field settings refers to its table only"
    (is (= #{[:table [:env events]]} (kinds/refs :published-table events {})))))

(deftest encode-test
  (testing "the identity is the table key under id, and the name is the display name"
    (let [doc (codec/encode published-table/codec events item)]
      (is (= {:kind "published-table" :id events :display_name "Events" :description "Raw events."}
             (dissoc doc :fields)))
      (is (= [events item] (codec/decode published-table/codec doc))))))

(deftest schema-test
  (is (mr/validate (codec/schema published-table/codec) item))
  (testing "a field entry with no setting, or with a setting at nil, is not content"
    (doseq [fields [{:ID {}} {:ID {:display_name nil}} {:PAYLOAD {:fields {:user {}}}}]]
      (let [a (assoc attrs :fields fields)]
        (is (not (mr/validate (codec/schema published-table/codec)
                              (assoc item :attrs a :refs (kinds/refs :published-table events a))))
            (pr-str fields)))))
  (testing "a field setting outside the closed set is not content"
    (let [a (assoc attrs :fields {:ID {:colour "blue"}})]
      (is (not (mr/validate (codec/schema published-table/codec)
                            (assoc item :attrs a :refs (kinds/refs :published-table events a)))))))
  (testing "the references must name the item's own table"
    (is (not (mr/validate (codec/schema published-table/codec)
                          (update item :refs disj [:table [:env events]])))))
  (testing "a root-level published table is in library/"
    (is (= {events "library/events.table.yaml"} (layout/layout kinds/codecs {events item})))))

;;; ------------------------------------------- Visibility type and data layer ------------------------------------------

(defn- decode-bytes
  "What `tree/decode-file` gives for the canonical bytes of document `doc`."
  [doc]
  (tree/decode-file {"published-table" published-table/codec} (writer/write-yaml doc)))

(deftest data-layer-test
  (testing "the data layer of a table is content, with the values that Metabase stores as they are"
    (doseq [layer ["final" "internal" "hidden"]]
      (let [layered (assoc-in item [:attrs :data_layer] layer)]
        (is (mr/validate (codec/schema published-table/codec) layered) layer)
        (is (= {:item [events layered]} (decode-bytes (codec/encode published-table/codec events layered))) layer))))
  (testing "a data layer that Metabase stores as another value is not content"
    (doseq [layer ["gold" "copper" "Hidden" "visible"]]
      (is (not (mr/validate (codec/schema published-table/codec) (assoc-in item [:attrs :data_layer] layer))) layer)
      (is (= :invalid (get-in (decode-bytes (assoc (codec/encode published-table/codec events item) :data_layer layer))
                              [:finding :type]))
          layer)))
  (testing "the visibility type of a table is not content: Metabase derives it from the data layer"
    (is (not (mr/validate (codec/schema published-table/codec) (assoc-in item [:attrs :visibility_type] "hidden"))))
    (doseq [doc [{:visibility_type "hidden"} {:visibility_type "hidden" :data_layer "hidden"}]]
      (is (= :invalid (get-in (decode-bytes (merge (codec/encode published-table/codec events item) doc))
                              [:finding :type]))
          (pr-str doc))))
  (testing "a field keeps its own visibility type"
    (is (mr/validate (codec/schema published-table/codec) item))))

(def ^:private layer-document-gen
  "Generates the document of the table with one, both or neither of the visibility type and the data layer, each with
  a value that Metabase can store or a legacy one. The first choice of each is absent."
  (gen/let [visibility (gen/elements [nil "hidden" "technical"])
            layer      (gen/elements [nil "final" "internal" "hidden" "gold"])]
    (cond-> (codec/encode published-table/codec events item)
      visibility (assoc :visibility_type visibility)
      layer      (assoc :data_layer layer))))

(defspec layer-documents-test 100
  ;; The format accepts a document iff it has no visibility type and a data layer that Metabase stores as it is; an
  ;; accepted document decodes to an item that encodes to the same document.
  (prop/for-all [doc layer-document-gen]
    (let [result (decode-bytes doc)]
      (if (and (nil? (:visibility_type doc)) (not= "gold" (:data_layer doc)))
        (= doc (apply codec/encode published-table/codec (:item result)))
        (= :invalid (get-in result [:finding :type]))))))

;;; ---------------------------------------------------- Remappings ---------------------------------------------------

(def ^:private product-title [sd "PUBLIC" "PRODUCTS" "TITLE"])

(def ^:private remapped-attrs
  {:fields {:PRODUCT_ID {:remapping {:type "external" :name "Product" :field product-title}}
            :RATING     {:remapping {:type "internal" :name "Rating" :values [[1 "Bad"] [2 "Good"]]}}
            :STATUS     {:display_name "Status"
                         :remapping    {:type "internal" :name "Status"}}}})

(def ^:private remapped
  (assoc item :refs (kinds/refs :published-table events remapped-attrs) :attrs remapped-attrs))

(deftest remapping-refs-test
  (testing "a foreign-key remapping refers to its target field; an internal remapping refers to nothing more"
    (is (= #{[:table [:env events]]
             [:field [:env [sd nil "EVENTS" "PRODUCT_ID"]]]
             [:field [:env [sd nil "EVENTS" "RATING"]]]
             [:field [:env [sd nil "EVENTS" "STATUS"]]]
             [:remapping [:env product-title]]}
           (kinds/refs :published-table events remapped-attrs)))))

(deftest remapping-schema-test
  (is (mr/validate (codec/schema published-table/codec) remapped))
  (testing "a field entry with only a remapping is content"
    (is (mr/validate (codec/schema published-table/codec)
                     (let [a {:fields {:RATING {:remapping {:type "internal" :name "Rating"}}}}]
                       (assoc item :attrs a :refs (kinds/refs :published-table events a))))))
  (testing "a remapping of another shape is not content"
    (doseq [r [{:type "external" :name "Product"}
               {:type "external" :name "Product" :field product-title :values [[1 "x"]]}
               {:type "internal" :name "Rating" :field product-title}
               {:type "internal" :name "Rating" :values []}
               {:type "internal" :name "Rating" :values [[1]]}
               {:type "internal" :name "Rating" :values [[1 " "]]}
               {:type "internal" :name "Rating" :values [[1 2]]}
               {:type "internal" :name "Rating" :values [[{:a 1} "One"]]}
               {:type "internal" :values [[1 "Bad"]]}
               {:type "internal" :name "" :values [[1 "Bad"]]}
               {:type "other" :name "Rating"}]]
      (let [a {:fields {:RATING {:remapping r}}}]
        (is (not (mr/validate (codec/schema published-table/codec)
                              (assoc item :attrs a :refs (kinds/refs :published-table events a))))
            (pr-str r))))))

(deftest remapping-round-trip-test
  (testing "both kinds of remapping survive encode, the bytes and decode"
    (is (= {:item [events remapped]}
           (decode-bytes (codec/encode published-table/codec events remapped))))))

(def ^:private mutations
  [{:name   :no-field-refs
    :doc    "Field settings give no references, so semantic validation cannot find a removed column."
    :target `published-table/field-refs
    :edits  [[:replace '[:field [:env path]] nil]]}
   {:name   :no-nested-field-refs
    :doc    "Nested fields give no references."
    :target `published-table/field-refs
    :edits  [[:replace '(field-refs path (:fields entry)) nil]]}
   {:name   :no-fk-target-refs
    :doc    "A foreign-key target is no reference."
    :target `published-table/field-refs
    :edits  [[:replace '(:fk_target entry) nil]]}
   {:name   :no-table-ref
    :doc    "A published table does not refer to its table."
    :target `published-table/refs
    :edits  [[:replace '[:table [:env id]] nil]]}
   {:name   :no-remapping-refs
    :doc    "A foreign-key remapping is no reference, so semantic validation cannot find a removed target field."
    :target `published-table/field-refs
    :edits  [[:replace '(get-in entry [:remapping :field]) nil]]}])

(deftest published-table-mutations-test
  (mut/check mutations {:tests [#'refs-test #'remapping-refs-test]}))
