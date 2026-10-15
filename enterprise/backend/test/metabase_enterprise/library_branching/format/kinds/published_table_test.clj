(ns metabase-enterprise.library-branching.format.kinds.published-table-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.published-table :as published-table]
   [metabase-enterprise.library-branching.format.layout :as layout]
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
    :edits  [[:replace '[:table [:env id]] nil]]}])

(deftest published-table-mutations-test
  (mut/check mutations {:tests [#'refs-test]}))
