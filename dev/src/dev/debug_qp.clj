(ns dev.debug-qp
  (:require [clojure.data :as data]
            [clojure.pprint :as pprint]
            [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models :refer [Field Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.util :as u]
            [toucan.db :as db]))

;; see docstring for `process-query-debug` for descriptions of what these do.

(def ^:private ^:dynamic *print-full?*     true)
(def ^:private ^:dynamic *print-metadata?* false)
(def ^:private ^:dynamic *print-names?*    true)
(def ^:private ^:dynamic *validate-query?* false)

(defn- remove-metadata
  "Replace field metadata in `x` with `...`."
  [x]
  (walk/prewalk
   (fn [form]
     (if (map? form)
       (reduce
        (fn [m k]
          (m/update-existing m k (constantly '...)))
        form
        [:cols :results_metadata :source-metadata])
       form))
   x))

(defn- add-name-to-field-id [id]
  (when id
    (let [{field-name :name, table-id :table_id} (db/select-one [Field :name :table_id] :id id)]
      (symbol (format "#_%s.%s"
                      (db/select-one-field :name Table :id table-id)
                      field-name)))))

(defn add-names
  "Walk a MBQL snippet `x` and add comment forms with the names of the Fields referenced to any `:field-id` clauses
  encountered. Helpful for debugging!"
  [x]
  (walk/postwalk
   (fn [form]
     (mbql.u/replace form
       [:field (id :guard integer?) opts]
       [:field id (add-name-to-field-id id) (cond-> opts
                                              (integer? (:source-field opts))
                                              (update :source-field (fn [source-field]
                                                                      (symbol (format "(do %s %d)"
                                                                                      (add-name-to-field-id source-field)
                                                                                      source-field)))))]

       (m :guard (every-pred map? (comp integer? :source-table)))
       (update m :source-table (fn [table-id]
                                 (symbol (format "(do #_%s %d)"
                                                 (db/select-one-field :name Table :id table-id)
                                                 table-id))))))
   x))

(defn- format-output [x]
  (cond-> x
    (not *print-metadata?*) remove-metadata
    *print-names?*          add-names))

(defn- print-diff [before after]
  (assert (not= before after))
  (let [before                         (format-output before)
        after                          (format-output after)
        [only-in-before only-in-after] (data/diff before after)]
    (when *print-full?*
      (println (u/pprint-to-str 'cyan (format-output after))))
    (when (seq only-in-before)
      (println (u/colorize 'red (str "-\n" (u/pprint-to-str only-in-before)))))
    (when (seq only-in-after)
      (println (u/colorize 'green (str "+\n" (u/pprint-to-str only-in-after)))))))

(defn- debug-query-changes [middleware-var middleware]
  (fn [next-middleware]
    (fn [query-before rff context]
      (try
        ((middleware
          (fn [query-after rff context]
            (when-not (= query-before query-after)
              (println (format "[pre] %s transformed query:" middleware-var))
              (print-diff query-before query-after))
            (when *validate-query?*
              (try
                (mbql.s/validate-query query-after)
                (catch Throwable e
                  (when (::our-error? (ex-data e))
                    (throw e))
                  (throw (ex-info (format "%s middleware produced invalid query" middleware-var)
                                  {::our-error? true
                                   :middleware  middleware-var
                                   :before      query-before
                                   :query       query-after}
                                  e)))))
            (next-middleware query-after rff context)))
         query-before rff context)
        (catch Throwable e
          (when (::our-error? (ex-data e))
            (throw e))
          (println (format "Error pre-processing query in %s:\n%s"
                           middleware-var
                           (u/pprint-to-str 'red (Throwable->map e))))
          (throw (ex-info "Error pre-processing query"
                          {::our-error? true
                           :middleware  middleware-var
                           :query       query-before}
                          e)))))))

(defn- debug-rffs [middleware-var middleware before-rff-xform after-rff-xform]
  (fn [next-middleware]
    (fn [query rff-after context]
      ((middleware
        (fn [query rff-before context]
          (next-middleware query (before-rff-xform rff-before) context)))
       query (after-rff-xform rff-after) context))))

(defn- debug-metadata-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rffs
     middleware-var
     middleware
     (fn before-rff-xform [rff]
       (fn [metadata-before]
         (reset! before metadata-before)
         (try
           (rff metadata-before)
           (catch Throwable e
             (when (::our-error? (ex-data e))
               (throw e))
             (println (format "Error post-processing result metadata in %s:\n%s"
                              middleware-var
                              (u/pprint-to-str 'red (Throwable->map e))))
             (throw (ex-info "Error post-processing result metadata"
                             {::our-error? true
                              :middleware  middleware-var
                              :metadata    metadata-before}
                             e))))))
     (fn after-rff-xform [rff]
       (fn [metadata-after]
         (when-not (= @before metadata-after)
           (println (format "[post] %s transformed metadata:" middleware-var))
           (print-diff @before metadata-after))
         (rff metadata-after))))))

(defn- debug-rfs [middleware-var middleware before-xform after-xform]
  (debug-rffs
   middleware-var
   middleware
   (fn before-rff-xform [rff]
     (fn [metadata]
       (let [rf (rff metadata)]
         (before-xform rf))))
   (fn after-rff-xform [rff]
     (fn [metadata]
       (let [rf (rff metadata)]
         (after-xform rf))))))

(defn- debug-result-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rfs
     middleware-var
     middleware
     (fn before-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (reset! before result)
          (try
            (rf result)
            (catch Throwable e
              (when (::our-error? (ex-data e))
                (throw e))
              (println (format "Error post-processing result in %s:\n%s"
                               middleware-var
                               (u/pprint-to-str 'red (Throwable->map e))))
              (throw (ex-info "Error post-processing result"
                              {::our-error? true
                               :middleware  middleware-var
                               :result      result}
                              e)))))
         ([result row] (rf result row))))
     (fn after-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (when-not (= @before result)
            (println (format "[post] %s transformed result:" middleware-var))
            (print-diff @before result))
          (rf result))
         ([result row] (rf result row)))))))

(defn- debug-row-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rfs
     middleware-var
     middleware
     (fn before-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result row]
          (reset! before row)
          (try
            (rf result row)
            (catch Throwable e
              (when (::our-error? (ex-data e))
                (throw e))
              (println (format "Error reducing row in %s:\n%s"
                               middleware-var
                               (u/pprint-to-str 'red (Throwable->map e))))
              (throw (ex-info "Error reducing row"
                              {::our-error? true
                               :middleware  middleware-var
                               :result      result
                               :row         row}
                              e)))))))
     (fn after-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result row]
          (when-not (= @before row)
            (println (format "[post] %s transformed row" middleware-var))
            (print-diff @before row))
          (rf result row)))))))

(defn process-query-debug
  "Process a query using a special QP that wraps all of the normal QP middleware and prints any transformations done
  during pre or post-processing.

  Options:

  * `:print-full?` -- whether to print the entire query/result/etc. after each transformation

  * `:print-metadata?` -- whether to print metadata columns such as `:cols`or `:source-metadata`
    in the query/results

  * `:print-names?` -- whether to print comments with the names of fields/tables as part of `:field` forms and
    for `:source-table`

  * `:validate-query?` -- whether to validate the query after each preprocessing step, so you can figure out who's
    breaking it. (TODO -- `mbql-to-native` middleware currently leaves the old mbql `:query` in place,
    which cases query to fail at that point -- manually comment that behavior out if needed"
  [query & {:keys [print-full? print-metadata? print-names? validate-query? context]
            :or   {print-full? true, print-metadata? false, print-names? true, validate-query? false}}]
  (binding [*print-full?*               print-full?
            *print-metadata?*           print-metadata?
            *print-names?*              print-names?
            *validate-query?*           validate-query?
            pprint/*print-right-margin* 80]
    (let [middleware (for [middleware-var qp/default-middleware
                           :when          middleware-var]
                       (->> middleware-var
                            (debug-query-changes middleware-var)
                            (debug-metadata-changes middleware-var)
                            (debug-result-changes middleware-var)
                            (debug-row-changes middleware-var)))
          qp         (qp.reducible/sync-qp (#'qp/base-qp middleware))]
      (if context
        (qp query context)
        (qp query)))))
