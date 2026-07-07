(ns metabase.dependencies.calculation
  "Upstream-dependency calculation for entities tracked in the dependency graph.

  OSS defines the [[calculate-deps*]] multimethod, the shared query helpers, and the
  `:transform` implementation (transform dependencies are tracked on all instances so that
  transform-job planning doesn't need to re-parse every transform's source on every read).
  Implementations for all other entity types live in `metabase-enterprise.dependencies.calculation`
  and are only exercised when the `:dependencies` premium feature is active."
  (:require
   [metabase.dependencies.native :as deps.native]
   [metabase.dependencies.schema :as deps.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmulti calculate-deps*
  "Implementation multimethod for [[calculate-deps]]. Dispatches on entity-type keyword.
  Prefer calling [[calculate-deps]] which validates the return value."
  {:arglists '([entity-type entity])}
  (fn [entity-type _entity] entity-type))

(mu/defn calculate-deps :- ::deps.schema/upstream-deps
  "Calculate upstream dependencies for a single entity.
  Returns a map of dependency-type -> set of entity IDs."
  [entity-type :- keyword?
   entity]
  (calculate-deps* entity-type entity))

;;; ------------------------------------------------ Helpers ------------------------------------------------

(mu/defn upstream-deps:mbql-query :- ::deps.schema/upstream-deps
  "Upstream deps of an MBQL query: source cards, measures, segments, and (source or implicitly
  joined) tables."
  [query :- ::lib.schema/query]
  {:card (or (lib/all-source-card-ids query) #{})
   :measure (or (lib/all-measure-ids query) #{})
   :segment (or (lib/all-segment-ids query) #{})
   :table (-> #{}
              (into (lib/all-source-table-ids query))
              (into (lib/all-implicitly-joined-table-ids query)))})

(mu/defn- upstream-deps:native-query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/native-only-query]
  (let [driver (:engine (lib.metadata/database query))
        deps   (deps.native/native-query-deps driver query)]
    ;; The deps are in #{{:table 7} ...} form and need conversion to ::deps.schema/upstream-deps form.
    (u/group-by ffirst (comp second first) conj #{} deps)))

(mu/defn upstream-deps:query :- ::deps.schema/upstream-deps
  "Upstream deps of any query, native or MBQL."
  [query :- ::lib.schema/query]
  (if (lib/native-only-query? query)
    (upstream-deps:native-query query)
    (upstream-deps:mbql-query query)))

(mu/defn- upstream-deps:python-transform :- ::deps.schema/upstream-deps
  [{{tables :source-tables} :source :as _py-transform}
   :- [:map [:source-tables {:optional true} [:sequential ::transforms-base.u/source-table-entry]]]]
  {:table (into #{} (keep :table_id) tables)})

;;; ------------------------------------------------ defmethods ------------------------------------------------

(defmethod calculate-deps* :transform
  [_ {{:keys [query]} :source :as transform}]
  (cond
    (transforms-base.u/query-transform? transform)  (upstream-deps:query query)
    (transforms-base.u/python-transform? transform) (upstream-deps:python-transform transform)
    :else (do (log/warnf "Don't know how to analyze the deps of Transform %d with source type '%s'"
                         (:id transform) (-> transform :source :type))
              {})))
