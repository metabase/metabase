(ns metabase.api.macros.defendpoint.tools-manifest
  "Generate a tools manifest (JSON Schema 2020-12) from `defendpoint` endpoints annotated with `:tool` metadata.

  Parallel to [[metabase.api.macros.defendpoint.open-api]] — same endpoint data, different output format.

  The manifest describes MCP-compatible tools for LLM/agent consumers. Each tool has:
  - `name`, `description` — tool identity
  - `endpoint` — HTTP method + path
  - `inputSchema` — merged route + query + body parameters
  - `responseSchema` — from the endpoint's response schema
  - `annotations` — MCP ToolAnnotations (readOnlyHint, destructiveHint, etc.)"
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------------------ Description rewriting -------------------------------------------------

(defn rewrite-tool-descriptions
  "Walk a malli schema and replace `:description` with `:tool/description` where present.
  This way `malli.json-schema/transform` picks up tool-facing text without affecting OpenAPI."
  [schema]
  (mc/walk
   schema
   (fn [node _path children _options]
     (let [props (mc/properties node)]
       (if-let [tool-desc (:tool/description props)]
         (let [new-props (-> props
                             (assoc :description tool-desc)
                             (dissoc :tool/description))]
           (mc/into-schema (mc/type node) new-props children (mc/options node)))
         (if (seq children)
           (mc/into-schema (mc/type node) props children (mc/options node))
           node))))))

;;; ------------------------------------------------ JSON Schema generation ------------------------------------------------

(def ^:dynamic *definitions*
  "Dynamic var bound to an atom collecting `$defs` during manifest generation."
  nil)

(def ^:private sanitize-replacements
  {"~1" "_SLASH_"
   "!"  "_BANG_"
   "="  "_EQ_"
   "<"  "_LT_"
   ">"  "_GT_"
   "*"  "_STAR_"
   "+"  "_PLUS_"
   "/"  "_SLASH_"})

(def ^:private sanitize-pattern
  (re-pattern (str/join "|" (map #(java.util.regex.Pattern/quote %) (keys sanitize-replacements)))))

(defn- sanitize-def-name
  "Sanitize a definition name for use in JSON Schema `$defs`."
  [s]
  (str/replace s sanitize-pattern sanitize-replacements))

(defn- sanitize-ref [ref-str]
  (str/replace ref-str #"#/\$defs/(.+)"
               (fn [[_ name]]
                 (str "#/$defs/" (sanitize-def-name name)))))

(defn- walk-sanitize-refs
  "Recursively walk a JSON Schema structure (maps and vectors) and apply [[sanitize-ref]]
  to every `:$ref` value. This ensures nested `$ref`s inside `oneOf`, `anyOf`, definitions, etc.
  are properly sanitized."
  [schema]
  (cond
    (map? schema)    (into {} (map (fn [[k v]]
                                     (if (= k :$ref)
                                       [k (sanitize-ref v)]
                                       [k (walk-sanitize-refs v)])))
                           schema)
    (vector? schema) (mapv walk-sanitize-refs schema)
    :else            schema))

(defn mjs-collect-tool-definitions
  "Transform a malli schema to JSON Schema. Uses `#/$defs/` as the definitions path.
  Collects shared definitions into [[*definitions*]]."
  [malli-schema]
  (let [jss  (mjs/transform (rewrite-tool-descriptions malli-schema)
                            {::mjs/definitions-path "#/$defs/"})
        defs (:definitions jss)]
    (when (and *definitions* (seq defs))
      (swap! *definitions*
             (fn [existing]
               (let [sanitized (into {} (map (fn [[k v]]
                                               [(sanitize-def-name k) (walk-sanitize-refs v)]))
                                     defs)]
                 (doseq [[k v] sanitized
                         :let [prev (get existing k)]
                         :when (and prev (not= prev v))]
                   (throw (ex-info (str "Conflicting $defs for " (pr-str k))
                                   {:key k :existing prev :new v})))
                 (merge existing sanitized)))))
    (walk-sanitize-refs (dissoc jss :definitions))))

;;; ------------------------------------------------ Name inference --------------------------------------------------------

(defn infer-tool-name
  "Infer a tool name from HTTP method, API prefix, and route path.

  Logic:
  - Strip version prefix (e.g. `/v1/`)
  - Strip path params (`:id`, `:field-id`)
  - For GET: prefix with `get_` + remaining segments joined by `_`
  - For DELETE: prefix with `delete_` + remaining segments joined by `_`
  - For POST/PUT: just remaining segments joined by `_`
  - Convert to snake_case"
  [method prefix route-path]
  (let [full-path    (str prefix route-path)
        stripped     (str/replace full-path #".*/v\d+/" "")
        segments     (->> (str/split stripped #"/")
                          (remove str/blank?)
                          (drop-while #(= % "api"))
                          (remove #(str/starts-with? % ":")))
        base         (str/join "_" segments)
        with-prefix  (case method
                       :get    (str "get_" base)
                       :delete (str "delete_" base)
                       base)]
    (str/replace with-prefix #"-" "_")))

;;; ------------------------------------------------ Annotation inference --------------------------------------------------

(def ^:private annotation-key-mapping
  {:read-only?   :readOnlyHint
   :destructive? :destructiveHint
   :idempotent?  :idempotentHint
   :open-world?  :openWorldHint})

(defn- method-default-annotations
  "Infer default MCP ToolAnnotations from HTTP method."
  [method]
  (case method
    (:get :head) {:readOnlyHint   true
                  :idempotentHint true}
    :put         {:destructiveHint false
                  :idempotentHint  true}
    :delete      {:destructiveHint true
                  :idempotentHint  true}
    {}))

(defn infer-annotations
  "Build MCP ToolAnnotations from HTTP method defaults merged with explicit `:annotations` from `:tool` metadata."
  [method explicit-annotations]
  (let [defaults (method-default-annotations method)
        explicit (into {}
                       (keep (fn [[k v]]
                               (when-let [mcp-key (annotation-key-mapping k)]
                                 [mcp-key v])))
                       explicit-annotations)]
    (merge defaults explicit)))

;;; ------------------------------------------------ Schema merging --------------------------------------------------------

(defn- schema->json-schema
  "Convert a malli schema to JSON Schema, collecting definitions."
  [malli-schema]
  (when malli-schema
    (mjs-collect-tool-definitions malli-schema)))

(defn- schema->properties-and-required
  "Extract `:properties` and `:required` from a malli schema's JSON Schema.
  Returns nil if the schema doesn't have `:properties` (e.g., `:or`/`:oneOf`)."
  [malli-schema]
  (when-let [jss (schema->json-schema malli-schema)]
    (when (:properties jss)
      (select-keys jss [:properties :required]))))

(defn- merge-input-schemas
  "Merge route, query, and body param schemas into a single inputSchema object.
  Route params are always required. For body schemas that aren't simple maps (e.g. `:or`),
  the full JSON Schema is used directly."
  [form]
  (let [route-parts (schema->properties-and-required (get-in form [:params :route :schema]))
        query-parts (schema->properties-and-required (get-in form [:params :query :schema]))
        body-schema (get-in form [:params :body :schema])
        body-parts  (schema->properties-and-required body-schema)
        ;; If the body schema doesn't yield properties (e.g. :or), use its full JSON Schema
        body-full   (when (and body-schema (nil? body-parts))
                      (schema->json-schema body-schema))
        all-props   (merge (:properties route-parts)
                           (:properties query-parts)
                           (:properties body-parts))
        all-req     (into [] (comp cat (distinct))
                         [(:required route-parts)
                          (:required query-parts)
                          (:required body-parts)])]
    (cond
      (and body-full (empty? all-props)) body-full
      (seq all-props)                    (cond-> {:type "object" :properties all-props}
                                           (seq all-req) (assoc :required all-req)))))

;;; ------------------------------------------------ Response schema -------------------------------------------------------

(defn- response-schema->json-schema
  "Convert an endpoint's response schema to JSON Schema for the tools manifest."
  [response-schema]
  (when response-schema
    (let [resolved (mr/resolve-schema response-schema)
          content  (or (-> resolved mc/properties :openapi/response-schema)
                       response-schema)]
      (mjs-collect-tool-definitions content))))

;;; ------------------------------------------------ endpoint->tool-definition ---------------------------------------------

(defn- route-path->endpoint-path
  "Convert Clout-style route path (`:id`) to curly-brace path (`{id}`)."
  [path]
  (str/replace path #":([^/]+)" "{$1}"))

(defn endpoint->tool-definition
  "Convert a single endpoint info + prefix to a tool definition map."
  [prefix {:keys [form]}]
  (let [method       (:method form)
        route-path   (get-in form [:route :path])
        tool-md      (let [t (get-in form [:metadata :tool])]
                       (if (map? t) t {}))
        tool-name    (or (:name tool-md)
                         (infer-tool-name method prefix route-path))
        description  (or (:description tool-md)
                         (:docstr form))
        full-path    (str prefix (route-path->endpoint-path route-path))
        input-schema (merge-input-schemas form)
        resp-schema  (response-schema->json-schema (:response-schema form))
        annotations  (infer-annotations method (:annotations tool-md))
        task-support (:task-support tool-md)]
    (cond-> {:name        tool-name
             :description description
             :endpoint    {:method (str/upper-case (name method))
                           :path   full-path}}
      input-schema      (assoc :inputSchema input-schema)
      resp-schema       (assoc :responseSchema resp-schema)
      (seq annotations) (assoc :annotations annotations)
      task-support      (assoc :execution {:taskSupport (name task-support)}))))

;;; ------------------------------------------------ Top-level generation --------------------------------------------------

(defn check-tool-uniqueness
  "Throws if `tools` contains duplicate `:name` values. The exception message lists each
  conflicting name and the endpoints that share it."
  [tools]
  (let [dupes (into (sorted-map)
                    (comp (filter (fn [[_ tools]] (< 1 (count tools))))
                          (map (fn [[name tools]] [name (mapv :endpoint tools)])))
                    (group-by :name tools))]
    (when (seq dupes)
      (throw (ex-info (str "Duplicate tool names detected: "
                           (str/join ", " (map (fn [[name endpoints]]
                                                 (str name " -> " (pr-str endpoints)))
                                               dupes)))
                      {:duplicates dupes})))))

(defn generate-tools-manifest
  "Generate a tools manifest from all `:tool`-annotated endpoints.

  `namespace-prefixes` is a map of `{ns-symbol \"/api/agent\"}` — each namespace symbol maps
  to the URL prefix its endpoints are served under."
  [namespace-prefixes]
  (binding [*definitions* (atom (sorted-map))]
    (let [registry @api.macros/tool-endpoint-registry
          tools    (into []
                         (comp
                          (filter (fn [[ns-sym _]] (contains? namespace-prefixes ns-sym)))
                          (keep (fn [[ns-sym k]]
                                  (when-let [endpoint (get (api.macros/ns-routes ns-sym) k)]
                                    (endpoint->tool-definition (get namespace-prefixes ns-sym) endpoint)))))
                         registry)]
      (check-tool-uniqueness tools)
      (cond-> {:$schema "https://json-schema.org/draft/2020-12/schema"
               :version "1.0.0"
               :tools   (sort-by :name tools)}
        (seq @*definitions*) (assoc :$defs @*definitions*)))))
