(ns metabase.driver.sql.query-processor.preprocess.schemas
  (:require [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.schema.helpers :as mbql.s.helpers]
            [metabase.util.schema :as su]
            [potemkin :as p]
            [schema.core :as s]
            [schema.spec.core :as schema.spec]
            [schema.spec.variant :as schema.variant]
            schema.utils))

(def SelectInfo
  {:clause      mbql.s/FieldOrAggregationReference
   :alias       su/NonBlankString
   ;; :table-alias su/NonBlankString
   s/Keyword    s/Any
   ;; TODO -- :source ?
   })

(p/defrecord+ ^:private Some [schema]
  s/Schema
  (spec [this]
    (schema.variant/variant-spec
     schema.spec/+no-precondition+
     [{:schema schema}]
     nil
     (fn [x]
       (when (nil? x)
         (schema.utils/error (list 'some? x))))))
  (explain [this]
    (list `->Some (s/explain schema))))

(def SelectInfos
  (->Some (mbql.s.helpers/distinct [SelectInfo])))

;; (def ^{:arglists '([select-infos])} validate-SelectInfos
;;   (s/validator SelectInfos))

;; (defn require-select-infos [schema]
;;   (s/constrained schema
;;                  (comp validate-SelectInfos :sql.qp/select)
;;                  "query must have valid :sql.qp/select info"))

(def FieldReference
  "Schema for information about Fields that are visible at the current level that come from something other than the
  `:source-table`."
  {s/Keyword s/Any}
  #_{(s/optional-key :id) mbql.s.helpers/IntGreaterThanZero
     :name                mbql.s.helpers/NonBlankString
     ;; :database-type su/NonBlankString
     ;; :base-type     su/FieldType
     :alias               su/NonBlankString
     :table-alias         su/NonBlankString
     ;; :options             (s/maybe mbql.s/FieldOptions)
     s/Keyword            s/Any}

  )

(defn non-nil? [schema])

(def FieldReferences
  (->Some {mbql.s/FieldOrAggregationReference FieldReference})
  #_(->Some (mbql.s.helpers/distinct [FieldReference])))

(defn- check-preprocessed [{:sql.qp/keys [select references], :keys [fields aggregation source-query joins]}]
  (or (when-let [err (s/check SelectInfos select)]
        {:sql.qp/select err})
      (when-let [err (s/check FieldReferences references)]
        {:sql.qp/references err})
      (when (seq fields)
        {:fields ":fields should be removed"})
      (when (seq aggregation)
        {:aggregation "should be removed"})
      (when source-query
        (when-let [err (check-preprocessed source-query)]
          {:source-query err}))
      (some
       (fn [join]
         (when-let [err (check-preprocessed join)]
           {:joins [err]}))
       joins)))

(p/defrecord+ ^:private FnConstrained [schema f message]
  s/Schema
  (spec [this]
    (schema.variant/variant-spec
     schema.spec/+no-precondition+
     [{:schema schema}]
     nil
     (fn [x]
       (some-> (f x) schema.utils/error))))
  (explain [this]
    (list `->FnConstrained (s/explain schema) f message)))

(def PreprocessedInnerQuery
  (->FnConstrained
   mbql.s/MBQLQuery
   check-preprocessed
   "preprocessed inner query"))
