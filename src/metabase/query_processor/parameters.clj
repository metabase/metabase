(ns metabase.query-processor.parameters
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase.util :as u]))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           MBQL QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


(defn- merge-filter-clauses [base addtl]
  (cond
    (and (seq base)
         (seq addtl)) ["AND" base addtl]
    (seq base)        base
    (seq addtl)       addtl
    :else             []))

(defn- expand-params-mbql [query-dict [{:keys [field value], :as param} & rest]]
  (if param
    ;; NOTE: we always use a simple equals filter for parameters
    (if (and param field value)
      (let [filter-subclause ["=" field value]
            _                (log/info "adding parameter clause: " filter-subclause)
            query            (assoc-in query-dict [:query :filter] (merge-filter-clauses (get-in query-dict [:query :filter]) filter-subclause))]
        (expand-params-mbql query rest))
      (expand-params-mbql query-dict rest))
    query-dict))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           SQL QUERIES                                             |
;;; +-------------------------------------------------------------------------------------------------------+


(defn- substitute-param [param-name value query]
  ;; TODO: escaping and protection against SQL injection!
  (s/replace query (re-pattern (str "\\{\\{" param-name "\\}\\}")) value))

;; extract any double squares [[ ]] as clauses, find the independent clauses [ ], and within that find the actual params {{}}

;; substitute any variables
;; if any double bracket clauses exist with {{}} then pull it out
;; if any single bracket clauses exist with {{}} then pull it out

;; TODO: delegate this to drivers?
;; TODO: feature = :parameter-substitution
(defn- substitute-all-params [query-dict [{:keys [value], param-name :name, :as param} & rest]]
  (if param
    ;; NOTE: we always use a simple equals filter for parameters
    (if (and param param-name value)
      (let [query (update-in query-dict [:native :query] (partial substitute-param param-name value))]
        (substitute-all-params query rest))
      (substitute-all-params query-dict rest))
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
                                             (loop [sql                   q
                                                    [[orig stripped] & rest] single-clauses]
                                               (if orig
                                                 (recur (s/replace-first sql orig stripped) rest)
                                                 sql))))
    query-dict))

(defn- expand-params-native [query-dict params]
  (if (and params (not (empty? params)))
    (-> query-dict
        (substitute-all-params params)
        remove-incomplete-clauses
        process-multi-clauses
        process-single-clauses)
    query-dict))


(defn expand-parameters
  "Expand any :parameters set on the QUERY-DICT."
  [{:keys [parameters], :as query-dict}]
  (let [query (dissoc query-dict :parameters)]
    (if-not parameters
      query
      (if (= :query (keyword (:type query)))
        (expand-params-mbql query parameters)
        (expand-params-native query parameters)))))
