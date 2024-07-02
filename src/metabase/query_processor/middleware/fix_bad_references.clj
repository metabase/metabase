(ns metabase.query-processor.middleware.fix-bad-references
  (:require
   [clojure.walk :as walk]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn- find-source-table [{:keys [source-table source-query]}]
  (or source-table
      (when source-query
        (recur source-query))))

(defn- find-join-against-table [{:keys [joins source-query]} table-id]
  (or (when source-query
        (find-join-against-table source-query table-id))
      (some (fn [join]
              (when (= (find-source-table join) table-id)
                join))
            joins)))

(defn- table [table-id]
  (when table-id
    (lib.metadata/table (qp.store/metadata-provider) table-id)))

(def ^:dynamic *bad-field-reference-fn*
  "A function to be called on each bad field found by this middleware. Not used except for in tests."
  (constantly nil))

(defn- fix-bad-references*
  ([inner-query]
   (fix-bad-references* inner-query inner-query (find-source-table inner-query)))

  ([inner-query form source-table & sources]
   (lib.util.match/replace form
     ;; don't replace anything inside source metadata.
     (_ :guard (constantly ((set &parents) :source-metadata)))
     &match

     ;; if we have entered a join map and don't have `join-source` info yet, determine that and recurse.
     (m :guard (every-pred map?
                           :condition
                           (fn [join]
                             (let [join-source (find-source-table join)]
                               (not (contains? (set sources) join-source))))))
     (apply fix-bad-references* inner-query m source-table (cons (find-source-table m) sources))

     ;; find Field ID fields whose Table IS NOT the source table (or not directly available in some `[:source-query+
     ;; :source-table]` path that do not have `:join-alias` info
     [:field
      (id :guard (every-pred integer? (fn [id]
                                        (let [{:keys [table-id]} (lib.metadata/field (qp.store/metadata-provider) id)]
                                          (not (some (partial = table-id)
                                                     (cons source-table sources)))))))
      (opts :guard (complement :join-alias))]
     (let [{:keys [table-id], :as field} (lib.metadata/field (qp.store/metadata-provider) id)
           {join-alias :alias}           (find-join-against-table inner-query table-id)]
       (log/warn (u/colorize :yellow (str
                                      (format
                                       "Bad :field clause %s for field %s at %s: clause should have a :join-alias."
                                       (pr-str &match)
                                       (pr-str (format "%s.%s" (:name (table table-id)) (:name field)))
                                       (pr-str &parents))
                                      " "
                                      (if join-alias
                                        (format "Guessing join %s" (pr-str join-alias))
                                        "Unable to infer an appropriate join. Query may not work as expected."))))
       (*bad-field-reference-fn* &match)
       (if join-alias
         [:field id (assoc opts :join-alias join-alias)]
         &match)))))

(defn fix-bad-references
  "Walk `query` and look for `:field` ID clauses without `:join-alias` information that reference Fields belonging to
  Tables other than the source Table (or an 'indirect' source Table that is available via source queries). Such
  references are technically disallowed. Since we are nice we will look thru joins and try to figure out a join that
  will work and add appropriate `:join-alias` information if we can.

  This middleware performs a best-effort DWIM transformation, and isn't smart enough to fix every broken query out
  there. If the query cannot be fixed, this log a warning and move on. See #19612 for more information."
  [query]
  (walk/postwalk
   (fn [form]
     (if (and (map? form)
              ((some-fn :source-query :source-table) form)
              (not (:condition form)))
       (fix-bad-references* form)
       form))
   query))
