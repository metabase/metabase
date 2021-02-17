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

(defn add-names
  "Walk a MBQL snippet `x` and add comment forms with the names of the Fields referenced to any `:field-id` clauses
  encountered. Helpful for debugging!"
  [x]
  (walk/postwalk
   (fn [form]
     (mbql.u/replace form
       [:field-id id]
       [:field-id id (let [{field-name :name, table-id :table_id} (db/select-one [Field :name :table_id] :id id)]
                       (symbol (format "#_\"%s.%s\""
                                       (db/select-one-field :name Table :id table-id)
                                       field-name)))]))
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
      ((middleware
        (fn [query-after rff context]
          (when-not (= query-before query-after)
            (println (format "[pre] %s transformed query:" middleware-var))
            (print-diff query-before query-after))
          (when *validate-query?*
            (try
              (mbql.s/validate-query query-after)
              (catch Throwable e
                (throw (ex-info (format "%s middleware produced invalid query" middleware-var)
                                {:middleware middleware-var
                                 :before     query-before
                                 :query      query-after}
                                e)))))
          (next-middleware query-after rff context)))
       query-before rff context))))

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
         (rff metadata-before)))
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
          (rf result))
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
          (rf result row))))
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

  * `:print-names?` -- whether to print comments with the names of fields as part of `:field-id` forms

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
