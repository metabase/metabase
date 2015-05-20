(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into korma SQL forms."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.config :as config]
            [metabase.db :refer :all]
            [metabase.driver.query-processor :as qp]
            (metabase.driver.generic-sql [native :as native]
                                         [util :refer :all])
            [metabase.driver.generic-sql.query-processor.annotate :as annotate]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])))


(declare apply-form
         log-query)

;; # INTERFACE

(defn process
  "Convert QUERY into a korma `select` form."
  [{{:keys [source_table] :as query} :query}]
  (when-not (zero? source_table)
    (let [forms (->> (map apply-form query)                    ; call `apply-form` for each clause and strip out nil results
                     (filter identity)
                     (mapcat (fn [form] (if (vector? form) form ; some `apply-form` implementations return a vector of multiple korma forms; if only one was
                                           [form])))           ; returned wrap it in a vec so `mapcat` can build a flattened sequence of forms
                     doall)]
      (when (config/config-bool :mb-db-logging)
        (log-query query forms))
      `(let [entity# (table-id->korma-entity ~source_table)]
         (select entity# ~@forms)))))


(defn process-structured
  "Convert QUERY into a korma `select` form, execute it, and annotate the results."
  [query]
  {:pre [(integer? (:database query)) ; double check that the query being passed is valid
         (map? (:query query))
         (= (name (:type query)) "query")]}
  (try
    (->> (process query)
         eval
         (annotate/annotate query))
    (catch java.sql.SQLException e
      (let [^String message (or (->> (.getMessage e)                            ; error message comes back like "Error message ... [status-code]" sometimes
                                          (re-find  #"(?s)(^.*)\s+\[[\d-]+\]$") ; status code isn't useful and makes unit tests hard to write so strip it off
                                          second)                               ; (?s) = Pattern.DOTALL - tell regex `.` to match newline characters as well
                                (.getMessage e))]
        (throw (Exception. message))))))


(defn process-and-run
  "Process and run a query and return results."
  [{:keys [type] :as query}]
  ;; we know how to handle :native and :query (structured) type queries
  (case (keyword type)
      :native (native/process-and-run query)
      :query  (process-structured query)))


;; ## Debugging Functions (Internal)

(defn- log-query
  "Log QUERY Dictionary and the korma form and SQL that the Query Processor translates it to."
  [{:keys [source_table] :as query} forms]
  (when-not qp/*disable-qp-logging*
    (log/debug
     "\n********************"
     "\nSOURCE TABLE: " source_table
     "\nQUERY ->"      (with-out-str (clojure.pprint/pprint query))
     "\nKORMA FORM ->" (with-out-str (clojure.pprint/pprint `(select (table-id->korma-entity ~source_table) ~@forms)))
     "\nSQL ->"        (eval `(let [entity# (table-id->korma-entity ~source_table)]
                                (sql-only (select entity# ~@forms))))
     "\n********************\n")))
