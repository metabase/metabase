(ns metabase.query-processor.middleware.validate-temporal-bucketing
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.temporal-bucket :as qp.u.temporal-bucket]
   [metabase.util.i18n :refer [tru]]))

(defn validate-temporal-bucketing
  "Make sure temporal bucketing of Fields (i.e., `:datetime-field` clauses) in this query is valid given the combination
  of Field base-type and unit. For example, you should not be allowed to bucket a `:type/Date` Field by `:minute`."
  [query]
  (doseq [[_ id-or-name {:keys [temporal-unit base-type]} :as clause] (lib.util.match/match (:query query) [:field _ (_ :guard :temporal-unit)])]
    (let [base-type (if (integer? id-or-name)
                      (:base-type (lib.metadata/field (qp.store/metadata-provider) id-or-name))
                      base-type)
          valid-units (qp.u.temporal-bucket/valid-units-for-base-type base-type)]
      (when-not (valid-units temporal-unit)
        (throw (ex-info (tru "Unsupported temporal bucketing: You can''t bucket a {0} Field by {1}."
                             base-type temporal-unit)
                        {:type        qp.error-type/invalid-query
                         :field       clause
                         :base-type   base-type
                         :unit        temporal-unit
                         :valid-units valid-units})))))
  query)
