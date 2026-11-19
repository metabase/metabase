(ns metabase.lib.cte
  "Accessors for the `:ctes` key on a query — named, query-scoped common table expressions."
  (:refer-clojure :exclude [mapv not-empty select-keys])
  (:require
   [medley.core :as m]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf :refer [mapv not-empty select-keys]]))

(mu/defn ctes :- [:maybe [:ref ::lib.schema/ctes]]
  "The CTEs declared on `query`."
  [query :- ::lib.schema/query]
  (:ctes query))

(mu/defn cte-by-name :- [:maybe [:ref ::lib.schema/cte-definition]]
  "The CTE with `cte-name`, or nil."
  [query    :- ::lib.schema/query
   cte-name :- :string]
  (perf/some #(when (= (:cte-name %) cte-name) %) (ctes query)))

(defn- find-cte-in-tree
  "Walk the tree rooted at `query-like` to find the CTE with `cte-uuid`."
  [query-like cte-uuid]
  (when query-like
    (or (perf/some #(when (= (:lib/uuid %) cte-uuid) %) (:ctes query-like))
        (perf/some #(find-cte-in-tree (:query %) cte-uuid) (:ctes query-like))
        (perf/some (fn [stage]
                     (perf/some #(find-cte-in-tree % cte-uuid) (:joins stage)))
                   (:stages query-like)))))

(mu/defn find-cte :- [:maybe [:ref ::lib.schema/cte-definition]]
  "The CTE with `cte-uuid`, found by walking the tree rooted at `query-like`."
  [query-like :- [:maybe [:ref ::lib.util/query-like]]
   cte-uuid   :- :string]
  (find-cte-in-tree query-like cte-uuid))

(defn- cte-by-name-or-throw [query cte-name]
  (or (cte-by-name query cte-name)
      (throw (ex-info (i18n/tru "No CTE named {0} declared on query" (pr-str cte-name))
                      {:cte-name      cte-name
                       :declared-ctes (mapv :cte-name (:ctes query))}))))

(mu/defn cte-metadata :- [:ref ::lib.schema/cte-definition]
  "Return the CTE declared on `query` with name `cte-name`. The returned value can be used anywhere a source table or
  card is used — e.g. passed to [[metabase.lib.core/returned-columns]] or [[metabase.lib.core/join-clause]]."
  [query    :- ::lib.schema/query
   cte-name :- :string]
  (cte-by-name-or-throw query cte-name))

(mu/defn with-source-cte :- ::lib.schema/query
  "Replace stage 0 of `query` with a stage that reads from the CTE named `cte-name` (which must be declared on `query`),
  dropping any later stages."
  [query    :- ::lib.schema/query
   cte-name :- :string]
  (let [cte (cte-by-name-or-throw query cte-name)]
    (assoc query :stages [{:lib/type   :mbql.stage/mbql
                           :source-cte (:lib/uuid cte)}])))

(mu/defn wrap-as-cte :- ::lib.schema/query
  "Return a new query whose stage 0 reads from `query` registered as a CTE named `cte-name`.

  Pre-existing CTEs on `query` are carried forward on the result."
  [query    :- ::lib.schema/query
   cte-name :- :string]
  (let [cte-uuid (str (random-uuid))
        cte      {:lib/type :mbql/cte
                  :lib/uuid cte-uuid
                  :cte-name cte-name
                  :query    (dissoc query :ctes :lib/metadata :database)}]
    (-> {:lib/type :mbql/query
         :database (:database query)
         :ctes     (conj (vec (:ctes query)) cte)
         :stages   [{:lib/type   :mbql.stage/mbql
                     :source-cte cte-uuid}]}
        (m/assoc-some :lib/metadata (:lib/metadata query)))))

(defn- source-cte-uuids
  "Set of `:source-cte` UUIDs referenced anywhere inside `query-like`."
  [query-like]
  (let [acc  (volatile! (transient #{}))
        walk (fn walk [q]
               (doseq [stage (:stages q)]
                 (when-some [cte-uuid (:source-cte stage)]
                   (vswap! acc conj! cte-uuid))
                 (doseq [join (:joins stage)]
                   (walk join)))
               (doseq [cte (:ctes q)]
                 (walk (:query cte))))]
    (walk query-like)
    (persistent! @acc)))

(defn- compute-transitive-cte-deps
  [outer-query cte]
  ;; `frontier` is kept as a persistent set throughout and only extended via `into`, so sibling expansions that both
  ;; discover the same dependency fuse into one entry. Combined with the `(remove seen')` filter, each uuid is
  ;; dequeued and expanded exactly once.
  (loop [frontier (source-cte-uuids (:query cte))
         seen     #{}]
    (if-some [cte-uuid (first frontier)]
      (let [frontier (disj frontier cte-uuid)
            seen'    (conj seen cte-uuid)]
        (if-some [dep-cte (find-cte-in-tree outer-query cte-uuid)]
          (recur (into frontier (remove seen') (source-cte-uuids (:query dep-cte)))
                 seen')
          (recur frontier seen')))
      seen)))

(mu/defn transitive-cte-deps :- [:set :string]
  "The set of CTE `:lib/uuid`s that `cte`'s body transitively references via `:source-cte`, resolved against the CTEs
  declared on `outer-query`. Does not include `cte` itself; assumes the CTE graph is acyclic.

  Memoized by `:lib/uuid` on the query's metadata provider cache when it supports [[CachedMetadataProvider]] with a
  cache."
  [outer-query :- ::lib.schema/query
   cte         :- [:ref ::lib.schema/cte-definition]]
  (let [mp         (:lib/metadata outer-query)
        cacheable? (and mp (lib.metadata.protocols/cached-metadata-provider-with-cache? mp))
        ;; CTE bodies are immutable once created and `:lib/uuid` identifies each one globally, so the result is stable
        ;; across every call that sees the same CTE.
        cache-key  [::transitive-cte-deps (:lib/uuid cte)]
        cached     (when cacheable?
                     (lib.metadata.protocols/cached-value mp cache-key ::miss))]
    (if (and cacheable? (not (identical? cached ::miss)))
      cached
      (let [deps (compute-transitive-cte-deps outer-query cte)]
        (when cacheable?
          (lib.metadata.protocols/cache-value! mp cache-key deps))
        deps))))

(mu/defn query-for-cte-body :- ::lib.schema/query
  "A workable query whose shape is the body of `cte` executed in the scope of `outer-query`. Carries forward only the
  CTEs the body transitively depends on, so the result is independently resolvable without any ambient CTE context."
  [outer-query :- ::lib.schema/query
   cte         :- [:ref ::lib.schema/cte-definition]]
  (let [deps     (transitive-cte-deps outer-query cte)
        dep-ctes (filterv (comp deps :lib/uuid) (:ctes outer-query))]
    (-> (merge (select-keys outer-query [:database :lib/metadata]) (:query cte))
        (m/assoc-some :ctes (not-empty dep-ctes)))))

(mu/defmethod lib.metadata.calculation/returned-columns-method :mbql/cte :- ::lib.metadata.calculation/returned-columns
  [outer-query  :- ::lib.schema/query
   _stage-number :- :int
   cte          :- [:ref ::lib.schema/cte-definition]
   options      :- [:maybe ::lib.metadata.calculation/visible-columns.options]]
  (let [cte-name (:cte-name cte)]
    (mapv #(assoc % :lib/source :source/cte, :lib/cte-name cte-name)
          (lib.metadata.calculation/returned-columns (query-for-cte-body outer-query cte) -1 -1 options))))
