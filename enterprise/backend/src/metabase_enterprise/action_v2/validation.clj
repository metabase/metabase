(ns metabase-enterprise.action-v2.validation
  (:require
   [metabase-enterprise.action-v2.actions]
   [metabase.driver :as driver]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defmulti validation-fn
  (fn [ttype] ttype))

(defmethod validation-fn :default
  [_ttype]
  (constantly true))

(defmethod validation-fn :type/Number
  [_ttype]
  int?)

(validation-fn :type/Number)

(defmethod validation-fn :type/Text
  [_ttype]
  string?)

(defmethod validation-fn :type/Temporal
  [_ttype]
  ;; TODO
  (constantly true))

(defmethod validation-fn :type/Boolean
  [_ttype]
  boolean?)

(defmethod validation-fn :type/Collection
  [_ttype]
  ;; TODO
  (constantly true))

(defmethod validation-fn :Coercion/UNIXNanoSeconds->DateTime
  [_ttype]
  ;; TODO: we need  dateobject check
  (constantly true))

(defn validate
  "Validate a value given af field"
  [value field]
  (or ((validation-fn #p (:base_type field)) value)
      (and (nil? value) (not (:database_required field)))))

(defn- single-validate
  [row field-name->fields]
  (not-empty (reduce (fn [errors [column value]]
                       (if (and (get field-name->fields column)
                                (validate value (get field-name->fields column)))
                         errors
                         (into errors {column (format "Invalid value")})))
                     {}
                     row)))
(defn batch-validate
  "Validate rows of a given table"
  [table-id-or-fields rows]
  (let [fields #p (if (int? table-id-or-fields)
                    (t2/select-fn->fn :name identity [:model/Field :name :database_required :base_type] :table_id table-id-or-fields)
                    (u/index-by :name table-id-or-fields))]
    (not-empty (reduce (fn [errors row]
                         (if-let [error (single-validate row fields)]
                           (conj errors error)
                           errors)) [] rows))))
