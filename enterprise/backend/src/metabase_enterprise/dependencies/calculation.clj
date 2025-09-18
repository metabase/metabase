(ns metabase-enterprise.dependencies.calculation
  (:require
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- upstream-deps:mbql-query [legacy-query]
  (lib.util/source-tables-and-cards [legacy-query]))

(defn- upstream-deps:native-query [metadata-provider query]
  (let [engine (:engine (lib.metadata/database metadata-provider))
        deps   (deps.native/native-query-deps engine metadata-provider query)]
    ;; The deps are in #{{:table 7} ...} form and need conversion to ::upstream-deps form.
    (u/group-by ffirst (comp second first) conj #{} deps)))

(mr/def ::upstream-deps
  [:map
   [:card      {:optional true} [:set ::lib.schema.id/card]]
   [:table     {:optional true} [:set ::lib.schema.id/table]]
   [:snippet   {:optional true} [:set ::lib.schema.id/snippet]]
   [:transform {:optional true} [:set ::lib.schema.id/transform]]])

(defn- upstream-deps:query [metadata-provider legacy-query]
  (case (:type legacy-query)
    (:query  "query")  (upstream-deps:mbql-query legacy-query)
    (:native "native") (upstream-deps:native-query metadata-provider legacy-query)
    (throw (ex-info "Unhandled kind of query" {:query legacy-query}))))

(mu/defn upstream-deps:card :- ::upstream-deps
  "Given a Toucan `:model/Card`, return its upstream dependencies as a map from the kind to a set of IDs."
  ([card] (upstream-deps:card (lib-be.metadata.jvm/application-database-metadata-provider (:database_id card))
                              card))
  ([metadata-provider                      :- ::lib.schema.metadata/metadata-provider
    {query :dataset_query :as _toucan-card}]
   (upstream-deps:query metadata-provider query)))

(mu/defn upstream-deps:transform :- ::upstream-deps
  "Given a Transform (in Toucan form), return its upstream dependencies."
  ([transform] (upstream-deps:transform nil transform))
  ([metadata-provider :- [:maybe ::lib.schema.metadata/metadata-provider]
    {{:keys [query type]} :source :as transform}]
   (if (#{"query" :query} type)
     (upstream-deps:query (or metadata-provider
                              (lib-be.metadata.jvm/application-database-metadata-provider (:database query)))
                          query)
     (do (log/warnf "Don't know how to analyze the deps of Transform %d with source type '%s'" (:id transform) type)
         {}))))

(mu/defn upstream-deps:snippet :- ::upstream-deps
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
