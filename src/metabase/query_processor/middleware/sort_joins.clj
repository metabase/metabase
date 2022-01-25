(ns metabase.query-processor.middleware.sort-joins
  (:require [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as error-type]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]))

(defn- join-dependencies
  "Set of aliases of other joins that this join depends on. (Joins can depend on other joins inside of their
  `:condition`.)"
  [{:keys [condition], join-alias :alias}]
  (not-empty (into #{} (mbql.u/match condition
                         [:field _ (opts :guard (fn [opts]
                                                  (not= (:join-alias opts) join-alias)))]
                         (:join-alias opts)))))

(defn- sort-joins-by-dependency-order
  "Sort `joins` in order so joins that depend on others come after the ones they depend on. (Joins can depend on other
  joins inside of their `:condition`.)"
  [joins]
  (log/tracef "Sorting joins %s" (pr-str (mapv :alias joins)))
  (let [join->info (into {}
                         (map-indexed (fn [i join]
                                        [(:alias join) {:deps     (join-dependencies join)
                                                        :position i}]))
                         joins)]
    (log/tracef "Info: %s" (u/pprint-to-str join->info))
    (u/prog1 (sort-by
              identity
              (fn [{alias-1 :alias} {alias-2 :alias}]
                (let [{position-1 :position, deps-1 :deps} (join->info alias-1)
                      {position-2 :position, deps-2 :deps} (join->info alias-2)]
                  ;; make sure there are no circular references.
                  (when (and (contains? deps-1 alias-2)
                             (contains? deps-2 alias-1))
                    (throw (ex-info (tru "Circular references between joins: join {0} depends on {1} and join {2} depends on {3}"
                                         (pr-str alias-1) (pr-str deps-1)
                                         (pr-str alias-2) (pr-str deps-2))
                                    {:type  error-type/invalid-query
                                     :joins joins})))
                  (cond
                    (and (some? deps-1) (nil? deps-2)) 2  ; join-1 has deps but join-2 does not: sort join-2 first
                    (and (nil? deps-1) (some? deps-2)) -2 ; join-2 has deps but join-1 does not: sort join-1 first
                    (contains? deps-1 alias-2)         1  ; join-1 depends on join-2: sort join-2 first
                    (contains? deps-2 alias-1)         -1 ; join-2 depends on join-1: sort join-1 first

                    ;; otherwise prefer preserving existing order.
                    :else
                    (- position-1 position-2))))
              joins)
      (log/tracef "=> %s" (pr-str (mapv :alias <>))))))

(defn- sort-joins*
  [query]
  (walk/postwalk
   (fn [form]
     (if (and (map? form)
              ((some-fn :source-table :source-query) form)
              (seq (:joins form)))
       (update form :joins sort-joins-by-dependency-order)
       form))
   query))

(defn sort-joins
  "Sort joins in the query in dependency order if needed (joins can refer to other joins inside their `:condition`, but
  must come after those joins). Throw an Exception if circular references between joins are detected."
  [qp]
  (fn [query rff context]
    (qp (sort-joins* query) rff context)))
