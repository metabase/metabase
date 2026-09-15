(ns metabase.transform-testing.expectations.empty
  "The `empty` expectation: a query over the transform output returns no rows.

  The query is the author's own SQL, rewritten so the tables it names resolve to the run's temp
  tables rather than to the real ones."
  (:require
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase.transform-testing.expectations.report :as expectations.report]))

(set! *warn-on-reflection* true)

(defrecord Empty [type name sql]
  expectations.protocol/Expectation
  (probes [_this {:keys [driver replacements]}]
    {:rows {:query    (transform-testing.compile/replace-tables driver sql replacements)
            :params   []
            :max-rows expectations.report/row-cap}})

  (interpret [_this results]
    (let [rows (vec (:rows results))
          [sample dropped] (expectations.report/capped rows)]
      (cond-> {:name name :type :empty :status (if (empty? rows) :passed :failed)}
        (seq rows)
        (assoc :sample    (mapv #(mapv expectations.report/cell %) sample)
               :truncated dropped)))))

(defn build
  "The record for an already-normalized, already-validated `empty` expectation."
  [m]
  ;; The linter forbids this constructor everywhere, so that nothing builds an expectation without
  ;; going through the front door. This is the one place it is the right call.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (->Empty :empty (:name m) (:sql m)))
