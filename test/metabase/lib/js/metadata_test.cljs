(ns metabase.lib.js.metadata-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.js.metadata :as lib.js.metadata]
   [metabase.lib.metadata :as lib.metadata]))

(deftest ^:parallel parse-fields-test
  (let [metadata-fragment #js {:fields #js {"card__1234:5678" #js {:id 0}
                                            "5678" #js {:id 1}
                                            "8765" #js {:id 2}
                                            "card__1234:4321" #js {:id 3}}}
        parsed-fragment (lib.js.metadata/parse-objects :field metadata-fragment)]
    (is (every? delay? (vals parsed-fragment)))
    (is (= {4321 {:lib/type :metadata/column, :id 3}
            5678 {:lib/type :metadata/column, :id 1}
            8765 {:lib/type :metadata/column, :id 2}}
           (update-vals parsed-fragment deref)))))

(def ^:private mock-field-metadata-with-external-remap
  #js {"id"               36
       "name"             "CATEGORY_ID"
       "has_field_values" "none"
       "dimensions"       #js [{"id"                      72
                                "field_id"                36
                                "name"                    "Category ID [external remap]"
                                "type"                    "external"
                                "human_readable_field_id" 67}]})

(deftest ^:parallel parse-field-with-external-remap-test
  (let [metadata          #js {:fields #js {"36" mock-field-metadata-with-external-remap}}
        metadata-provider (lib.js.metadata/metadata-provider 1 metadata)]
    (is (= {:lib/type           :metadata/column
            :id                 36
            ;; This is a bit busted because of the partial metadata, but it's still there.
            ;; No DB or table names, so those are blank.
            :ident              "field____!noschema!____CATEGORY_ID"
            :name               "CATEGORY_ID"
            :has-field-values   :none
            :lib/external-remap {:lib/type :metadata.column.remapping/external
                                 :id       72
                                 :name     "Category ID [external remap]"
                                 :field-id 67}}
           (lib.metadata/field metadata-provider 36)))))

(def ^:private mock-field-metadata-with-internal-remap
  #js {"id"               33
       "name"             "ID"
       "has_field_values" "none"
       "dimensions"       #js [{"id"                      66
                                "field_id"                33
                                "name"                    "ID [internal remap]"
                                "type"                    "internal"
                                "human_readable_field_id" nil}]})

(deftest ^:parallel parse-field-with-internal-remap-test
  (let [metadata          #js {:fields #js {"33" mock-field-metadata-with-internal-remap}}
        metadata-provider (lib.js.metadata/metadata-provider 1 metadata)]
    (is (= {:lib/type           :metadata/column
            :id                 33
            ;; This is a bit busted because of the partial metadata, but it's still there.
            ;; No DB or table names, so those are blank.
            :ident              "field____!noschema!____ID"
            :name               "ID"
            :has-field-values   :none
            :lib/internal-remap {:lib/type :metadata.column.remapping/internal
                                 :id       66
                                 :name     "ID [internal remap]"}}
           (lib.metadata/field metadata-provider 33)))))

(def ^:private mock-metadata-with-generic-tables-and-fields
  #js {:databases #js {"1" #js {:id 1
                                :name "fake DB"}}
       :tables    #js {"6" #js {:id     6
                                :name   "basic_table"
                                :db_id  1
                                :fields #js {}}
                       "7" #js {:id     7
                                :name   "another_table"
                                :schema "SomeSchema"
                                :db_id  1
                                :fields #js {}}}
       :fields    #js {"600" #js {:id   600
                                  :table_id 6
                                  :name "one_field"}
                       "700" #js {:id   700
                                  :table_id 7
                                  :name "two_field"}}})

(deftest ^:parallel idents-test
  (let [mp (lib.js.metadata/metadata-provider 1 mock-metadata-with-generic-tables-and-fields)]
    (is (= "field__fake DB__!noschema!__basic_table__one_field"
           (:ident (lib.metadata/field mp 600))))
    (is (= "field__fake DB__SomeSchema__another_table__two_field"
           (:ident (lib.metadata/field mp 700))))))
