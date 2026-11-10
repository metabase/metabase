(ns metabase-enterprise.data-testing.expectations.empty
  "The `empty` expectation: a query over the output of the query under test returns no rows.

  The query is the author's own SQL, rewritten so the tables it names resolve to the run's temp
  tables rather than to the real ones."
  (:require
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.data-testing.expectations.report :as expectations.report]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Result schema -----------------------------------------

(def ^:private base
  "The shared result keys, pinned to this type."
  [:merge
   ::data-testing.schema/expectation-result.base
   [:map [:type [:= :empty]]]])

(def ^:private findings
  [:merge
   base
   [:map {:description "The rows the query returned, and the columns describing them."}
    [:columns   [:sequential ::data-testing.schema/result-column]]
    [:sample    [:sequential ::data-testing.schema/row]]
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

  (probes [_this {:keys [driver replacements output-token]}]
    {:violations {:query    (data-testing.compile/replace-tables driver sql replacements output-token)
                  :params   []
                  :max-rows expectations.report/row-cap}})

  (interpret [_this _context results]
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
  (mu/validate-throw ::data-testing.schema/expectation m)
  ;; The linter forbids this constructor everywhere, so that an expectation is only ever built from a
  ;; value the schema has passed. This is the one place it is the right call.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (->Empty :empty (:name m) (:sql m)))
