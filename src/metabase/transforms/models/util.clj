(ns metabase.transforms.models.util
  (:require
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn timestamp-constraint
  "Build a HoneySQL `[:and ...]` clause constraining `field-name` to the range expressed by `date-string`.
  `date-string` uses the same format as the query-processor date parameter (e.g. \"2025-01\", \"past7days\")."
  [field-name date-string]
  (let [{:keys [start end]}
        (try
          (params.dates/date-string->range date-string {:inclusive-end? false})
          (catch Exception e
            (throw (ex-info (tru "Failed to parse datetime value: {0}" date-string)
                            {:status-code 400}
                            e))))
        start (some-> start u.date/parse)
        end   (some-> end   u.date/parse)]
    (into [:and] (remove nil?)
          [(when start [:>= field-name start])
           (when end   [:<  field-name end])])))

(defn run-order-by
  "Standard `:order-by` clause for a paged listing of coordinated runs (job runs, DAG runs).
  Sorts by `sort-column` (`:start_time` or `:end_time`; anything else — including nil — falls back to
  ordering by start_time then end_time) in `sort-direction` (`:asc`/`:desc`, defaulting to `:desc`),
  with in-progress rows (null `end_time`) always ordered last."
  [sort-column sort-direction]
  (let [sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc) :nulls-last :nulls-first)]
    (case (keyword sort-column)
      :start_time [[:start_time sort-direction]]
      :end_time   [[:end_time sort-direction nulls-sort]]
      [[:start_time sort-direction]
       [:end_time   sort-direction nulls-sort]])))

(defn paged-run-listing
  "Run a paged listing of `model` filtered by `where` (a HoneySQL clause or nil) and ordered by
  `order-by`, returning the FE-conventional `{:data :limit :offset :total}` envelope. `offset`
  defaults to 0 and `limit` to 20."
  [model {:keys [offset limit]} order-by where]
  (let [offset     (or offset 0)
        limit      (or limit 20)
        query-opts (cond-> {:order-by order-by :offset offset :limit limit}
                     where (assoc :where where))
        count-opts (if where {:where where} {})]
    {:data   (t2/select model query-opts)
     :limit  limit
     :offset offset
     :total  (t2/count model count-opts)}))
