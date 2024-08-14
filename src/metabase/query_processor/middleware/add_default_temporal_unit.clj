(ns metabase.query-processor.middleware.add-default-temporal-unit
  (:require
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]))

(defn add-default-temporal-unit
  "Add `:temporal-unit` `:default` to any temporal `:field` clauses that don't already have a `:temporal-unit`. This
  makes things more consistent because code downstream can rely on the key being present."
  [query]
  (lib.util.match/replace-in query [:query]
    [:field (_ :guard string?) (_ :guard (every-pred
                                          :base-type
                                          #(isa? (:base-type %) :type/Temporal)
                                          (complement :temporal-unit)))]
    (mbql.u/with-temporal-unit &match :default)

    [:field (id :guard integer?) (_ :guard (complement :temporal-unit))]
    (let [{:keys [base-type effective-type]} (lib.metadata/field (qp.store/metadata-provider) id)]
      (cond-> &match
        (isa? (or effective-type base-type) :type/Temporal) (mbql.u/with-temporal-unit :default)))))
