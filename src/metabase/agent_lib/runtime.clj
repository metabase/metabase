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

(def ^{:doc "Trusted structured helper implementations keyed by operator symbol."}
  trusted-helper-bindings
  (merge capabilities/trusted-helper-bindings
         extra-helper-bindings))

(def ^{:doc "Top-level structured query-transform operator symbols."}
  query-transform-symbols
  capabilities/query-transform-symbols)

(def ^{:doc "All helper symbols accepted by the structured runtime."}
  helper-symbols
  (into capabilities/helper-symbols
        (keys extra-helper-bindings)))

(defn op-symbol
  "Normalize helper identifiers into canonical operator symbols."
  [op]
  (syntax/op-symbol op))

(defn build-runtime
  "Build the trusted structured-program runtime for a metadata provider and optional extra bindings."
  ([metadata-providerable]
   (build-runtime metadata-providerable nil))
  ([metadata-providerable extra-bindings]
   (let [metadata-provider (lib.metadata/->metadata-provider metadata-providerable)
         tables-by-name    (runtime.fields/build-table-lookup metadata-provider)
         fields-by-table   (runtime.fields/build-field-lookup metadata-provider tables-by-name)
         fields-by-id      (runtime.fields/build-field-id-lookup metadata-provider tables-by-name)
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
