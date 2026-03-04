(ns metabase.api.macros.defendpoint.open-api
  "Implementation of OpenAPI spec generation for [[metabase.api.macros/defendpoint]].

  TODO -- I'm not convinced this should be a separate namespace versus merging it
  into [[metabase.api.macros/defendpoint]]."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [medley.core :as m]
   [metabase.api.open-api]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^:private ^:dynamic *definitions* nil)

(defn- sanitize-schema-name
  "Sanitize schema names to match OpenAPI's required pattern: ^[a-zA-Z0-9.\\-_]+$
   Only replaces characters that are invalid in OpenAPI schema names."
  [s]
  (-> s
      ;; ~1 is JSON Pointer encoding for / - decode first
      (str/replace "~1" "/")
      ;; Replace only invalid characters, keeping . and - which are valid
      (str/replace "!" "_BANG_")
      (str/replace "=" "_EQ_")
      (str/replace "<" "_LT_")
      (str/replace ">" "_GT_")
      (str/replace "*" "_STAR_")
      (str/replace "+" "_PLUS_")
      (str/replace "/" "_SLASH_")))

(defn- sanitize-ref
  "Sanitize $ref paths to use sanitized schema names."
  [schema]
  (cond-> schema
    (:$ref schema)
    (update :$ref (fn [r]
                    (str/replace r #"#/components/schemas/(.+)"
                                 (fn [[_ schema-name]]
                                   (str "#/components/schemas/" (sanitize-schema-name schema-name))))))))

(defn- path->operation-id
  "Generate an operationId from method and path, e.g. :get + '/api/action/{id}' -> 'get-api-action-id'"
  [method full-path]
  (str (name method)
       (-> full-path
           (str/replace #"[{}]" "")
           (str/replace #"/" "-"))))

(mu/defn- merge-required :- :metabase.api.open-api/parameter.schema.object
  [schema]
  (let [optional? (set (keep (fn [[k v]] (when (:optional v) k))
                             (:properties schema)))]
    (-> schema
        (m/update-existing :required #(into []
                                            (comp (map u/qualified-name)
                                                  (remove optional?))
                                            %))
        (m/update-existing :properties #(update-vals % (fn [v] (dissoc v :optional)))))))

(def ^:private file-schema (mjs/transform ms/File {::mjs/definitions-path "#/components/schemas/"}))

(mu/defn- fix-json-schema :- :metabase.api.open-api/parameter.schema
  "Clean-up JSON schema to make it more understandable for OpenAPI tools.

  Returns a new schema WITH an indicator if it's *NOT* required.

  NOTE: maybe instead of fixing it up later we should re-work Malli's json-schema transformation into a way we want it
  to be?"
  [schema :- :map]
  (try
    ;; Helper to recursively fix nested schemas and strip :optional (which is only
    ;; meaningful at the top level for parameter detection, not inside oneOf/anyOf/allOf)
    (let [fix-nested #(dissoc (fix-json-schema %) :optional)
          ;; Sanitize definition keys
          sanitize-definitions (fn [defs]
                                 (into {}
                                       (map (fn [[k v]]
                                              [(sanitize-schema-name k) (fix-nested v)]))
                                       defs))
          schema (-> schema
                     sanitize-ref
                     (m/update-existing :description str)
                     (m/update-existing :type keyword)
                     (m/update-existing :definitions sanitize-definitions)
                     (m/update-existing :oneOf #(mapv fix-nested %))
                     (m/update-existing :anyOf #(mapv fix-nested %))
                     (m/update-existing :allOf #(mapv fix-nested %))
                     (m/update-existing :additionalProperties (fn [additional-properties]
                                                                (cond-> additional-properties
                                                                  (map? additional-properties) fix-nested))))]
      (cond
        ;; this happens when we use `[:and ... [:fn ...]]`, the `:fn` schema gets converted into an empty object
        (:allOf schema)
        (let [schema (update schema :allOf (partial remove (partial = {})))]
          (if (= (count (:allOf schema)) 1)
            (fix-json-schema (merge (dissoc schema :allOf) (first (:allOf schema))))
            schema))

        (= (select-keys schema (keys file-schema)) file-schema)
        ;; I got this from StackOverflow and docs are not in agreement, but RapiDoc
        ;; shows file input, so... :)
        (merge {:type :string, :format :binary}
               (select-keys schema [:description :default]))

        (:properties schema)
        (merge-required
         (update schema :properties (fn [properties]
                                      (into (sorted-map)
                                            (map (fn [[k v]]
                                                   [(u/qualified-name k) (fix-json-schema v)]))
                                            properties))))

        (and (= (:type schema) :array) (:items schema))
        (update schema :items (fn [items]
                                ;; apparently `:tuple` creates multiple `:items` entries... I don't think this is
                                ;; correct. I think we're supposed to use `:prefixItems` instead. See
                                ;; https://stackoverflow.com/questions/57464633/how-to-define-a-json-array-with-concrete-item-definition-for-every-index-i-e-a
                                (if (sequential? items)
                                  (mapv fix-json-schema items)
                                  (fix-json-schema items))))

        (and (= (:type schema) :array) (false? (:items schema)))
        (dissoc schema :items)

        :else
        schema))
    (catch Throwable e
      (throw (ex-info (format "Error fixing schema: %s" (ex-message e))
                      {:schema schema}
                      e)))))

(defn- mjs-collect-definitions
  "We transform json-schema in a few different places, but we need to collect all definitions in a single one."
  [malli-schema]
  (let [jss (mjs/transform malli-schema {::mjs/definitions-path "#/components/schemas/"})]
    (when *definitions*
      (swap! *definitions* merge (:definitions (fix-json-schema jss))))
    (dissoc jss :definitions)))

(mu/defn- schema->params* :- [:sequential :metabase.api.open-api/parameter]
  [schema in-fn renames]
  (let [{:keys [properties required]} (mjs-collect-definitions schema)
        required                      (set required)]
    (for [[k param-schema] properties
          :let             [k (get renames k k)]
          :when            (in-fn k)
          :let             [schema    (fix-json-schema param-schema)
                            ;; if schema does not indicate it's optional, it's not :)
                            optional? (:optional schema)]]
      (cond-> {:in          (in-fn k)
               :name        (u/qualified-name k)
               :required    (and (contains? required k) (not optional?))
               :schema      (dissoc schema :optional :description)}
        (:description schema) (assoc :description (str (:description schema)))))))

(mu/defn- multipart-schema [form :- :metabase.api.macros/parsed-args]
  (when-let [request-schema (get-in form [:params :request :schema])]
    (let [schema (-> request-schema mr/resolve-schema mc/schema)]
      (when (= (mc/type schema) :map)
        (some (fn [[k _opts schema]]
                (when (= k :multipart-params)
                  schema))
              (mc/children schema))))))

(def ^:private default-response-schema
  "Default response schema for OpenAPI endpoints. This is used when the endpoint does not specify a response schema."
  {"2XX" {:description "Successful response"}
   "4XX" {:description "Client error response"}
   "5XX" {:description "Server error response"}})

(mu/defn- schema->response-obj :- [:maybe :metabase.api.open-api/path-item.responses]
  "Convert a Malli schema to an OpenAPI response schema.

  This is used to convert the `:response-schema` in [[metabase.api.macros/defendpoint]] to an OpenAPI response schema.

  If the schema has `:openapi/response-schema` in its properties (e.g., for streaming responses), that schema
  is used for documentation instead of the actual schema. This allows streaming endpoints to document the
  JSON content they return while validating that the return value is a StreamingResponse instance."
  [schema]
  (let [resolved-schema (mr/resolve-schema schema)
        ;; Check for :openapi/response-schema in the schema properties - used by server/streaming-response-schema
        content-schema  (or (-> resolved-schema mc/properties :openapi/response-schema)
                            schema)
        jss-schema      (mjs-collect-definitions content-schema)]
    {"2XX" (-> {:description (or (:description jss-schema) "Successful response")}
               (assoc :content {"application/json" {:schema (fix-json-schema jss-schema)}}))}))

(comment

  (mjs-collect-definitions :metabase.timeline.api.timeline/Timeline)
  (schema->response-obj :metabase.timeline.api.timeline/Timeline))

(mu/defn- path-item :- :metabase.api.open-api/path-item
  "Generate OpenAPI desc for `defendpoint` 2.0 ([[metabase.api.macros/defendpoint]]) handler.

  https://spec.openapis.org/oas/latest.html#path-item-object"
  [full-path :- string?
   form      :- :metabase.api.macros/parsed-args]
  (try
    (let [method          (:method form)
          route-params    (when-let [schema (get-in form [:params :route :schema])]
                            (schema->params* schema (constantly :path) nil))
          query-params    (when-let [schema (get-in form [:params :query :schema])]
                            (schema->params* schema (constantly :query) nil))
          params          (concat
                           (for [param route-params]
                             (assoc param :in :path))
                           query-params)
          ctype           (if (get-in form [:metadata :multipart])
                            "multipart/form-data"
                            "application/json")
          body-schema     (some-> (if (= ctype "multipart/form-data")
                                    (multipart-schema form)
                                    (get-in form [:params :body :schema]))
                                  mjs-collect-definitions
                                  fix-json-schema)
          response-schema (:response-schema form)
          deprecated?     (get-in form [:metadata :deprecated])]
      ;; summary is the string in the sidebar of Scalar
      (cond-> {:operationId (path->operation-id method full-path)
               :summary     (str (u/upper-case-en (name method)) " " full-path)
               :description (some-> (:docstr form) str)
               :parameters params
               :responses  default-response-schema}
        body-schema     (assoc :requestBody {:content {ctype {:schema body-schema}}})
        response-schema (update :responses merge (schema->response-obj response-schema))
        deprecated?     (assoc :deprecated true)))
    (catch Throwable e
      (throw (ex-info (str (format "Error creating OpenAPI spec for endpoint %s %s: %s"
                                   (:method form)
                                   (pr-str (get-in form [:route :path]))
                                   (ex-message e))
                           "\n\nDebug this with\n\n"
                           (pr-str (list
                                    'metabase.api.macros.defendpoint.open-api/path-item
                                    full-path
                                    (list :form
                                          (list 'metabase.api.macros/find-route
                                                (symbol "'my.namespace") ; so it prints as 'my.namespace
                                                (:method form)
                                                (get-in form [:route :path]))))))
                      {:full-path full-path, :form form, :definitions @*definitions*}
                      e)))))

(defn- strip-trailing-slash
  "Remove trailing slash from a string, but keep root paths like '/api' unchanged."
  [s]
  (str/replace s #"/$" ""))

(mu/defn open-api-spec :- :metabase.api.open-api/spec
  "Create an OpenAPI spec for then `endpoints` in a namespace. Note this returns an incomplete OpenAPI object;
  use [[metabase.api.open-api/root-open-api-object]] to get something complete."
  [endpoints :- :metabase.api.macros/ns-endpoints
   prefix    :- :string]
  (binding [*definitions* (atom (sorted-map))]
    {:paths (transduce
             (map (fn [endpoint]
                    (let [local-path (-> (get-in endpoint [:form :route :path])
                                         (str/replace #"/:([^/]+)" "/{$1}"))
                          full-path  (-> (str prefix local-path)
                                         strip-trailing-slash)
                          method     (get-in endpoint [:form :method])]
                      {full-path {method (assoc (path-item full-path (:form endpoint))
                                                :tags [prefix])}})))
             m/deep-merge
             (sorted-map)
             (vals endpoints))
     :components {:schemas @*definitions*}}))

#_:clj-kondo/ignore
(comment
  (open-api-spec (metabase.api.macros/ns-routes 'metabase.geojson.api) "/api/geojson")

  (metabase.api.macros.defendpoint.open-api/path-item
   "/api/card/:id/series"
   (:form (metabase.api.macros/find-route 'metabase.queries-rest.api.card :get "/:id/series")))

  (-> (mjs/transform :metabase.util.cron/CronScheduleString {::mjs/definitions-path "#/components/schemas/"})
      fix-json-schema))
