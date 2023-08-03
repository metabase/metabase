(ns metabase.lib.util.nest-query
  (:require
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.query-processor.util.add-alias-info :as-alias add]
   [metabase.util.malli :as mu]))

(defn- rewrite-references [stage query]
  (let [visible-columns     (lib.metadata.calculation/visible-columns query)
        ref->visible-column (into {} (map (juxt lib.ref/ref identity)) visible-columns)]
    (mbql.u.match/replace stage
      #{:expression :field}
      (let [metadata    (lib.metadata.calculation/metadata query &match)
            best-match  (lib.equality/find-closest-matching-ref (lib.ref/ref metadata) (keys ref->visible-column))
            metadata    (merge metadata (get ref->visible-column best-match))
            [_tag opts] &match]
        (when-let [field-name ((some-fn :lib/desired-column-alias :lib/source-column-alias :name) metadata)]
          [:field
           (merge (select-keys metadata [:base-type :effective-type])
                  (dissoc opts :temporal-unit :binning :join-alias :source-field ::add/desired-alias ::add/position ::add/source-table ::add/source-alias)
                  {:lib/uuid          (str (random-uuid))
                   ;; ::add/source-table ::add/source
                   })
           field-name])))))

(defn- update-penultimate-stage [stage query]
  (-> stage
      (select-keys [:lib/type :joins :expressions :source-table :source-card])
      (assoc :fields (mapv lib.ref/ref (let [query (lib.util/update-query-stage query -1 dissoc :aggregations)]
                                         (lib.metadata.calculation/visible-columns
                                          query -1 query
                                          {:include-implicitly-joinable? false}))))))

(defn- update-final-stage [stage query]
  (-> stage
      (dissoc :joins :expressions :source-table :source-card)
      (rewrite-references query)))

(mu/defn nest-expressions :- ::lib.schema/query
  "Pushes the `:source-table`/`:source-query`, `:expressions`, and `:joins` in the top-level of the query into a
  `:source-query` and updates `:expression` references and `:field` clauses with `:join-alias`es accordingly. See
  tests for examples. This is used by the SQL QP to make sure expressions happen in a subselect."
  [query :- ::lib.schema/query]
  (let [last-stage (lib.util/query-stage query -1)]
    (if-not (or (:expressions last-stage)
                (empty? (dissoc last-stage [:joins :expressions])))
      query
      (let [last-stage (lib.util/query-stage query -1)]
        (-> query
            (lib.util/update-query-stage -1 update-penultimate-stage query)
            lib.stage/append-stage
            (lib.util/update-query-stage -1 merge (update-final-stage last-stage query)))))))
