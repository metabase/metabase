(ns metabase.mbql.generate.data
  (:require
   [clojure.test.check.generators :as gens]
   [metabase.models :refer [Field Table]]
   [metabase.util :as u]
   [toucan.db :as db]))

(defn source-table-id-generator [database-or-id]
  (let [table-ids (db/select-ids Table :db_id (u/the-id database-or-id))]
    (assert (seq table-ids))
    (gens/elements table-ids)))

(defn field-generator [table-or-id]
  (gens/let [field      (gens/elements (db/select Field :table_id (u/the-id table-or-id)))
             id-or-name (gens/elements [(:id field)
                                        (:name field)])
             options    (gens/return {:-id       (:id field)
                                      :-name     (:name field)
                                      :base-type (:base_type field)})]
    [:field id-or-name options]))

(defn numeric-field-generator [field-generator]
  (gens/such-that
   (fn [[_ _ {:keys [base-type]}]]
     (isa? base-type :type/Number))
   field-generator
   1000))
