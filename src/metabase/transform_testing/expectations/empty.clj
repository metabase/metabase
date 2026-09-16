(ns metabase.transform-testing.expectations.empty
  "The `empty` expectation: a query over the transform output returns no rows.

  The query is the author's own SQL, rewritten so the tables it names resolve to the run's temp
  tables rather than to the real ones."
  (:require
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase.transform-testing.expectations.report :as expectations.report]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Result schema -----------------------------------------

(def ^:private base
  "The shared result keys, pinned to this type."
  [:merge
   ::transform-testing.schema/expectation-result.base
   [:map [:type [:= :empty]]]])

(def ^:private findings
  [:merge
   base
   [:map {:description "The rows the query returned, and the columns describing them."}
    [:columns   [:sequential ::transform-testing.schema/result-column]]
    [:sample    [:sequential ::transform-testing.schema/row]]
    [:truncated :int]]])

(mr/def ::result
  "What an `empty` expectation found.

  A pass carries nothing beyond the shared keys. A failure adds the rows the query returned as
  `:sample`, with `:columns` describing them; the sample is capped, and `:truncated` is how many
  rows that cap dropped."
  [:multi {:dispatch :status}
   [:error  base]
   [:passed base]
   [:failed findings]])

(defrecord Empty [type name sql]
  expectations.protocol/Expectation
  (temp-tables [_this _context]
    {})

  (probes [_this {:keys [driver replacements]}]
    {:violations {:query    (transform-testing.compile/replace-tables driver sql replacements)
                  :params   []
                  :max-rows expectations.report/row-cap}})

  (interpret [_this results]
    (let [{:keys [rows columns]} (:violations results)
          rows                   (vec rows)
          [sample dropped]       (expectations.report/capped rows)
          column-names           (mapv :name columns)]
      (cond-> {:name name :type :empty :status (if (empty? rows) :passed :failed)}
        (seq rows)
        (assoc :sample    (mapv #(zipmap column-names (map expectations.report/cell %)) sample)
               :columns   (vec columns)
               :truncated dropped)))))

(defmethod expectations.protocol/build :empty
  [m]
  ;; The linter forbids this constructor everywhere, so that an expectation is only ever built from a
  ;; value the schema has passed. This is the one place it is the right call.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (->Empty :empty (:name m) (:sql m)))
