(ns metabase.agent-lib.runtime
  "Trusted MBQL helper runtime for structured MBQL program evaluation."
  (:require
   [metabase.agent-lib.capabilities :as capabilities]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.agent-lib.runtime.bindings :as runtime.bindings]
   [metabase.agent-lib.runtime.fields :as runtime.fields]
   [metabase.agent-lib.syntax :as syntax]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

;; Ensure all defmethod registrations are loaded.
(comment lib/keep-me)

(set! *warn-on-reflection* true)

(def ^:private extra-helper-bindings
  {;; Query-introspection helpers exposed through the shared runtime.
   'suggested-join-conditions lib/suggested-join-conditions
   'joinable-columns          lib/join-fieldable-columns
   'joins                     lib/joins
   'visible-columns           lib/visible-columns
   'filterable-columns        lib/filterable-columns
   'breakoutable-columns      lib/breakoutable-columns
   'aggregable-columns        lib/aggregable-columns
   'orderable-columns         lib/orderable-columns
   'expressionable-columns    lib/expressionable-columns

   ;; Query-dependent refs are wired at runtime build time.
   'aggregation-ref           nil})

(def trusted-helper-bindings
  "Trusted structured helper implementations keyed by operator symbol."
  (merge capabilities/trusted-helper-bindings
         extra-helper-bindings))

(def query-transform-symbols
  "Top-level structured query-transform operator symbols."
  capabilities/query-transform-symbols)

(def helper-symbols
  "All helper symbols accepted by the structured runtime."
  (into capabilities/helper-symbols
        (keys extra-helper-bindings)))
(defn op-symbol
  "Normalize helper identifiers into canonical operator symbols."
  [op]
  (syntax/op-symbol op))

(defn- resolve-in-scope-table-ids
  "Default fallback when no in-scope table set is provided: load every table in the database.
  Used by tests and any code path that hasn't yet plumbed in a scoped runtime."
  [metadata-provider]
  (into #{} (map :id) (lib.metadata/tables metadata-provider)))

(defn build-runtime
  "Build the trusted structured-program runtime for a metadata provider.

  Options:
    :in-scope-table-ids — set of table-ids the runtime should expose for name-based lookups
                           and FK chain resolution. Defaults to every table in the database
                           (used by tests and legacy callers); production should always pass
                           the scoped set derived from the program references.
    :extra-bindings     — additional runtime bindings merged on top of the standard ones."
  ([metadata-providerable]
   (build-runtime metadata-providerable nil))
  ([metadata-providerable {:keys [in-scope-table-ids extra-bindings]}]
   (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
         table-ids         (or in-scope-table-ids
                               (resolve-in-scope-table-ids metadata-provider))
         tables-by-name    (runtime.fields/build-table-lookup metadata-provider table-ids)
         {:keys [fields-by-table fields-by-id]}
         (runtime.fields/build-field-lookups metadata-provider tables-by-name)
         bindings          (merge (assoc trusted-helper-bindings
                                         'expression-ref mbql/expression-ref-or-current-stage-column
                                         'aggregation-ref mbql/aggregation-ref-or-current-stage-column
                                         'skip-join? (fn [query operation]
                                                       (mbql/redundant-implicit-join? fields-by-id query operation)))
                                  (runtime.bindings/make-context-bindings metadata-provider
                                                                          tables-by-name
                                                                          fields-by-table
                                                                          fields-by-id)
                                  extra-bindings)]
     {:metadata-provider metadata-provider
      :tables-by-name    tables-by-name
      :fields-by-table   fields-by-table
      :fields-by-id      fields-by-id
      :bindings          bindings})))

(defn bindings-map
  "Return the runtime bindings map."
  [runtime]
  (:bindings runtime))

(defn helper-fn
  "Look up a helper implementation from a runtime by operator.
  Throws when the binding is nil so callers get a clear error instead of an NPE."
  [runtime op]
  (let [sym (op-symbol op)
        f   (get (:bindings runtime) sym)]
    (when-not f
      (throw (ex-info (str "No runtime binding for operator: " sym)
                      {:operator sym})))
    f))
