(ns metabase.query-processor.middleware.fix-bad-field-id-refs
  "Middleware that adds `:join-alias` info to `:field` clauses where needed."
  (:refer-clojure :exclude [get-in])
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [get-in]]))

(mu/defn- fix-bad-field-id-refs-in-stage :- [:maybe ::lib.schema/stage]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (let [first-stage-path (conj (pop (vec path)) 0)
        source-table     (:source-table (get-in query first-stage-path))
        update-fields    (fn update-fields [form]
                           (lib.util.match/replace form
                             ;; don't recurse into joins. But should we update conditions tho.
                             (join :guard (every-pred map? #(= (:lib/type %) :mbql/join)))
                             (update join :conditions update-fields)

                             [:field (_opts :guard (complement :join-alias)) (id :guard pos-int?)]
                             (or (when-let [col (lib.metadata/field query id)]
                                   (when-not (= (:table-id col) source-table)
                                     (when-let [resolved (lib.walk/apply-f-for-stage-at-path
                                                          lib.field.resolution/resolve-field-ref
                                                          query path &match)]
                                       (lib/ref resolved))))
                                 &match)))
        stage' (update-fields stage)]
    (when-not (= stage' stage)
      ;; normalizing the stage will remove any duplicate `:fields` or `:breakouts`
      (lib/normalize ::lib.schema/stage stage'))))

(mu/defn fix-bad-field-id-refs :- ::lib.schema/query
  "Fix any `:field` refs using an integer Field ID that in a stage where that Field's Table is not the
  `:source-table`. Convert them to Field name refs and add info like `:join-alias` as needed."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query fix-bad-field-id-refs-in-stage))
