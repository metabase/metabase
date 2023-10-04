(ns metabase.automagic-dashboards.util
  (:require    [clojure.string :as str]
               [metabase.util :as u]))

(defn field-isa?
  "`isa?` on a field, checking semantic_type and then base_type"
  [{:keys [base_type semantic_type]} t]
  (or (isa? (keyword semantic_type) t)
      (isa? (keyword base_type) t)))

(defn key-col?
  "Workaround for our leaky type system which conflates types with properties."
  [{:keys [base_type semantic_type name]}]
  (and (isa? base_type :type/Number)
       (or (#{:type/PK :type/FK} semantic_type)
           (let [name (u/lower-case-en name)]
             (or (= name "id")
                 (str/starts-with? name "id_")
                 (str/ends-with? name "_id"))))))

(defn filter-tables
  "filter `tables` by `tablespec`, which is just an entity type (eg. :entity/GenericTable)"
  [tablespec tables]
  (filter #(-> % :entity_type (isa? tablespec)) tables))
