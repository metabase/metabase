(ns metabase.query-processor.parameters
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            [clj-time.core :as t]
            [clj-time.format :as tf]
            [medley.core :as m]))


(def ^:private ^:const relative-dates
  #{"today"
    "yesterday"
    "past7days"
    "past30days"})


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           MBQL QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


(defn- build-filter-clause [{param-type :type, :keys [field value]}]
  (if-not (= param-type "date")
    ;; default behavior is to use a simple equals filter
    ["=" field value]
    ;; otherwise we need to handle date filtering
    (if-not (contains? relative-dates value)
      ;; absolute date range such as: "2014-05-10,2014-05-16"
      (let [[start end] (s/split value #"," 2)]
        ["BETWEEN" field start end])
      ;; relative date range, so build appropriate MBQL clause
      (condp = value
        "past7days"  ["TIME_INTERVAL" field -7 "day"]
        "past30days" ["TIME_INTERVAL" field -30 "day"]
        "yesterday"  ["=" field ["relative_datetime" -1 "day"]]
        "today"      ["=" field ["relative_datetime" "current"]]))))

(defn- merge-filter-clauses [base addtl]
  (cond
    (and (seq base)
         (seq addtl)) ["AND" base addtl]
    (seq base)        base
    (seq addtl)       addtl
    :else             []))

(defn- expand-params-mbql [query-dict [{:keys [field value], :as param} & rest]]
  (if param
    (if (and param field value)
      (let [filter-subclause (build-filter-clause param)
            query            (assoc-in query-dict [:query :filter] (merge-filter-clauses (get-in query-dict [:query :filter]) filter-subclause))]
        (expand-params-mbql query rest))
      (expand-params-mbql query-dict rest))
    query-dict))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           SQL QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


(defn- extract-dates [value report-timezone]
  (if-not (contains? relative-dates value)
    ;; absolute date range such as: "2014-05-10,2014-05-16"
    ;; TODO: other absolute options?  year-quarter?  year-month?
    (zipmap [:start :end] (s/split value #"," 2))
    ;; relative date range
    (let [tz        (t/time-zone-for-id report-timezone)
          formatter (tf/formatter "YYYY-MM-dd" tz)
          today     (t/today-at-midnight tz)]
      (->> (condp = value
             "past7days"  {:end   (t/minus today (t/days 1))
                           :start (t/minus today (t/days 7))}
             "past30days" {:end   (t/minus today (t/days 1))
                           :start (t/minus today (t/days 30))}
             "yesterday"  {:end   (t/minus today (t/days 1))
                           :start (t/minus today (t/days 1))}
             "today"      {:end   today
                           :start today})
           ;; the above values are JodaTime objects, so unparse them to iso8601 strings
           (m/map-vals (partial tf/unparse formatter))))))

(defn- expand-date-range-param [report-timezone {param-name :name, param-type :type, param-value :value, :as param}]
  (if-not (= param-type "date")
    param
    (let [{:keys [start end]} (extract-dates param-value report-timezone)]
      [(assoc param :name (str param-name ":start"), :value start)
       (assoc param :name (str param-name ":end"),   :value end)])))

(defn- substitute-param [param-name value query]
  ;; TODO: escaping and protection against SQL injection!
  (s/replace query (re-pattern (str "\\{\\{" param-name "\\}\\}")) value))

(defn- substitute-all-params [query-dict [{:keys [value], param-name :name, :as param} & rest]]
  (if param
    (if-not (and param param-name value)
      (substitute-all-params query-dict rest)
      (let [query (update-in query-dict [:native :query] (partial substitute-param param-name value))]
        (substitute-all-params query rest)))
    query-dict))

(def ^:private ^:const outer-clause #"\[\[.*?\]\]")
(def ^:private ^:const outer-clause-prefix #"^\[\[(.*?)\s.*\]\]$")
(def ^:private ^:const incomplete-outer-clause #"\[\[.*?\{\{.*?\}\}.*?\]\]")
(def ^:private ^:const inner-clause #"<(.*?)>")
(def ^:private ^:const incomplete-inner-clause #"<.*?\{\{.*?\}\}.*?>")

(defn- remove-incomplete-clauses [query-dict]
  (let [find-and-replace (fn [sql]
                           (-> sql
                               (s/replace incomplete-outer-clause "")
                               (s/replace incomplete-inner-clause "")))]
    (update-in query-dict [:native :query] find-and-replace)))

(defn- conjoin-multi-clause [clause]
  (let [prefix (second (re-find outer-clause-prefix clause))]
    ;; re-seq produces a vector for each match like [matched-form grouping1] and we only want grouping1.
    (str prefix " " (s/join " AND " (map second (re-seq inner-clause clause))))))

(defn- process-multi-clauses [query-dict]
  (if-let [multi-clauses (re-seq outer-clause (get-in query-dict [:native :query]))]
    (update-in query-dict [:native :query] (fn [q]
                                             (loop [sql                   q
                                                    [multi-clause & rest] multi-clauses]
                                               (if multi-clause
                                                 (recur (s/replace-first sql multi-clause (conjoin-multi-clause multi-clause)) rest)
                                                 sql))))
    query-dict))

(defn- process-single-clauses [query-dict]
  (if-let [single-clauses (re-seq inner-clause (get-in query-dict [:native :query]))]
    (update-in query-dict [:native :query] (fn [q]
                                             (loop [sql                      q
                                                    [[orig stripped] & rest] single-clauses]
                                               (if orig
                                                 (recur (s/replace-first sql orig stripped) rest)
                                                 sql))))
    query-dict))

(defn- expand-params-native [query-dict params]
  (let [report-timezone (get-in query-dict [:settings :report-timezone])
        params          (flatten (map (partial expand-date-range-param report-timezone) params))]
    (-> (substitute-all-params query-dict params)
        remove-incomplete-clauses
        process-multi-clauses
        process-single-clauses)))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           PUBLIC API                                             |
;;; +-------------------------------------------------------------------------------------------------------+


;; TODO: feature = :parameter-substitution (at least for native queries)
(defn expand-parameters
  "Expand any :parameters set on the QUERY-DICT."
  [{:keys [parameters], :as query-dict}]
  (let [query (dissoc query-dict :parameters)]
    (if (= :query (keyword (:type query)))
      (expand-params-mbql query parameters)
      (expand-params-native query parameters))))
