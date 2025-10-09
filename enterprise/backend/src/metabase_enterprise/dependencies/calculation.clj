(ns metabase-enterprise.dependencies.calculation
  (:require
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase-enterprise.dependencies.schema :as deps.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn- upstream-deps:mbql-query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/query]
  {:card  (or (lib/all-source-card-ids query)  #{})
   :table (or (lib/all-source-table-ids query) #{})})

(mu/defn- upstream-deps:native-query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/native-only-query]
  (let [driver (:engine (lib.metadata/database query))
        deps   (deps.native/native-query-deps driver query)]
    ;; The deps are in #{{:table 7} ...} form and need conversion to ::deps.schema/upstream-deps form.
    (u/group-by ffirst (comp second first) conj #{} deps)))

(mu/defn- upstream-deps:query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/query]
  (if (lib/native-only-query? query)
    (upstream-deps:native-query query)
    (upstream-deps:mbql-query query)))

(mu/defn upstream-deps:card :- ::deps.schema/upstream-deps
  "Given a Toucan `:model/Card`, return its upstream dependencies as a map from the kind to a set of IDs."
  [{query :dataset_query :as _toucan-card} :- ::queries.schema/card]
  (upstream-deps:query query))

(mu/defn upstream-deps:transform :- ::deps.schema/upstream-deps
  "Given a Transform (in Toucan form), return its upstream dependencies."
  [{{:keys [query], source-type :type} :source :as transform} :- [:map
                                                                  [:source [:map
                                                                            [:query ::lib.schema/query]]]]]
  (if (= (keyword source-type) :query)
    (upstream-deps:query query)
    (do (log/warnf "Don't know how to analyze the deps of Transform %d with source type '%s'" (:id transform) source-type)
        {})))

(mu/defn upstream-deps:snippet :- ::deps.schema/upstream-deps
  "Given a native query snippet, return its upstream dependencies in the usual `{entity-type #{1 2 3}}` format."
  [{:keys [template_tags] :as _snippet}]
  (let [type->id-key {:card :card-id, :snippet :snippet-id}
        dependencies (keep (fn [tag]
                             (let [entity-type (:type tag)]
                               (when-let [id-key (type->id-key entity-type)]
                                 (when-let [entity-id (id-key tag)]
                                   [entity-type entity-id]))))
                           (vals template_tags))]
    (u/group-by first second conj #{} dependencies)))
