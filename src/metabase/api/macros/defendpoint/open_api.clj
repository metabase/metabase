(ns metabase.api.macros.defendpoint.open-api
  "Implementation of OpenAPI spec generation for [[metabase.api.macros/defendpoint]].

  TODO -- I'm not convinced this should be a separate namespace versus merging it
  into [[metabase.api.macros/defendpoint]]."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.api.open-api]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.json-schema :as mu.json-schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *definitions* nil)

(defn- path->operation-id
  "Generate an operationId from method and path, e.g. :get + '/api/action/{id}' -> 'get-api-action-id'"
  [method full-path]
  (str (name method)
       (-> full-path
           (str/replace #"[{}]" "")
           (str/replace #"/" "-"))))

(mu/defn- merge-required :- :metabase.api.open-api/parameter.schema
  [schema :- :metabase.api.open-api/parameter.schema]
  (let [optional? (set (keep (fn [[k v]] (when (or (:optional v) (contains? v :default)) k))
                             (:properties schema)))]
    (-> schema
        (m/update-existing :required #(into []
                                            (comp (map u/qualified-name)
                                                  (remove optional?))
                                            %))
        (m/update-existing :properties #(update-vals % (fn [v] (dissoc v :optional)))))))

(def ^:private file-schema
  (dissoc (mu.json-schema/transform ms/File {:definitions-path "#/components/schemas/"}) :definitions))

(mu/defn- fix-json-schema :- :metabase.api.open-api/parameter.schema
  "Clean-up JSON schema to make it more understandable for OpenAPI tools.

  Returns a new schema WITH an indicator if it's *NOT* required.

  NOTE: maybe instead of fixing it up later we should re-work Malli's json-schema transformation into a way we want it
  to be?"
  [schema :- :metabase.api.open-api/parameter.schema]
  (try
    ;; Helper to recursively fix nested schemas and strip :optional (which is only
    ;; meaningful at the top level for parameter detection, not inside oneOf/anyOf/allOf)
    (let [fix-nested #(dissoc (fix-json-schema %) :optional)
          schema (-> schema
                     (m/update-existing :description str)
                     (m/update-existing :type keyword)
                     (m/update-existing :definitions #(update-vals % fix-nested))
                     (m/update-existing :oneOf #(mapv fix-nested %))
                     (m/update-existing :anyOf #(mapv fix-nested %))
                     (m/update-existing :allOf #(mapv fix-nested %))
                     (m/update-existing :not fix-nested)
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

(defn- normalize-raw-json-schema
  "`malli.json-schema/transform`'s raw output has `:type` as a JSON Schema string and `:properties`/`:required`/
  `:definitions` keyed by the original schema's own (keyword) keys; normalize both up front so the rest of this
  namespace can treat every JSON Schema node as [[:metabase.api.open-api/parameter.schema]] throughout."
  [schema]
  (if-not (map? schema)
    schema
    (cond-> schema
      (:type schema)                 (update :type keyword)
      (:format schema)               (update :format keyword)
      (:description schema)          (update :description str)
      (:properties schema)           (update :properties (fn [props]
                                                           (into {}
                                                                 (map (fn [[k v]] [(u/qualified-name k) (normalize-raw-json-schema v)]))
                                                                 props)))
      (:definitions schema)          (update :definitions (fn [defs]
                                                            (into {}
                                                                  (map (fn [[k v]] [(u/qualified-name k) (normalize-raw-json-schema v)]))
                                                                  defs)))
      (:required schema)             (update :required (partial mapv u/qualified-name))
      (:items schema)                (update :items (fn [items]
                                                      (if (sequential? items)
                                                        (mapv normalize-raw-json-schema items)
                                                        (normalize-raw-json-schema items))))
      (:prefixItems schema)          (update :prefixItems (partial mapv normalize-raw-json-schema))
      (map? (:additionalProperties schema)) (update :additionalProperties normalize-raw-json-schema)
      (:oneOf schema)                 (update :oneOf (partial mapv normalize-raw-json-schema))
      (:anyOf schema)                 (update :anyOf (partial mapv normalize-raw-json-schema))
      (:allOf schema)                 (update :allOf (partial mapv normalize-raw-json-schema))
      (:not schema)                   (update :not normalize-raw-json-schema))))

(defn- mjs-collect-definitions
  "We transform json-schema in a few different places, but we need to collect all definitions in a single one."
  [malli-schema]
  (let [jss (normalize-raw-json-schema (mu.json-schema/transform malli-schema {:definitions-path "#/components/schemas/"}))]
    (when *definitions*
      (swap! *definitions* merge (:definitions (fix-json-schema jss))))
    (dissoc jss :definitions)))

(mu/defn- schema->params* :- [:sequential :metabase.api.open-api/parameter]
  [schema  :- :metabase.api.macros/schema-form-or-instance
   in-fn   :- ifn?
   renames :- [:maybe [:map-of :string :string]]]
  (let [{:keys [properties required]} (mjs-collect-definitions schema)
        required                      (set required)]
    (for [[k param-schema] properties
          :let             [k (get renames k k)]
          :when            (in-fn k)
          :let             [schema    (fix-json-schema param-schema)
                            ;; optional if flagged so, or if it carries a `:default` (a defaulted param is
                            ;; safe to omit, so it shouldn't be advertised as required)
                            optional? (or (:optional schema) (contains? schema :default))]]
      (cond-> {:in          (in-fn k)
               :name        (u/qualified-name k)
               :required    (and (contains? required k) (not optional?))
               :schema      (dissoc schema :optional :description)}
        (:description schema) (assoc :description (str (:description schema)))))))

(def ^:private default-response-schema
  "Default response schema for OpenAPI endpoints. This is used when the endpoint does not specify a response schema."
  {"2XX" {:description "Successful response"}
   "4XX" {:description "Client error response"}
   "5XX" {:description "Server error response"}})

(mr/def ::response-override
  "The `:openapi/response` property of a response schema.
  It describes the response on the wire, where that differs from the value the handler returns."
  [:map {:closed true}
   [:status      {:optional true} [:re #"^[1-5](\d\d|XX)$"]]
   [:description {:optional true} :string]
   [:content     {:optional true} [:map-of :string :metabase.api.macros/schema-form-or-instance]]])

(mu/defn- response-override->responses :- :metabase.api.open-api/path-item.responses
  "The OpenAPI responses map for one `::response-override`.
  Without a `:description`, it takes the description of the first body schema that has one."
  [{:keys [status description content]} :- ::response-override]
  (let [bodies (update-vals content mjs-collect-definitions)]
    {(or status "2XX")
     (cond-> {:description (or description (some :description (vals bodies)) "Successful response")}
       (seq bodies) (assoc :content (update-vals bodies (fn [body] {:schema (fix-json-schema body)}))))}))

(mu/defn- schema->response-obj :- [:maybe :metabase.api.open-api/path-item.responses]
  "The OpenAPI success response for the `:response-schema` of a [[metabase.api.macros/defendpoint]].
  It documents a JSON body matching the schema, unless one of two schema properties says otherwise.
  Neither property changes what is validated.

  - `:openapi/response` documents the whole response, as a `::response-override` map.
    Its `:status` is the status code, `\"2XX\"` by default.
    Its `:content` maps each media type to the schema of its body; without it the response has no body.
  - `:openapi/response-schema` documents a JSON body matching that schema instead.
    A streaming response uses it to describe the JSON it streams."
  [schema :- :metabase.api.macros/schema-form-or-instance]
  (let [properties (mc/properties (mr/resolve-schema schema))]
    (response-override->responses
     (or (:openapi/response properties)
         {:content {"application/json" (or (:openapi/response-schema properties) schema)}}))))

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
          body-schema     (some-> (get-in form [:params :body :schema])
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
        ;; the endpoint's own success response replaces the default `2XX` stub, even when it names an exact status
        response-schema (update :responses #(merge (dissoc % "2XX") (schema->response-obj response-schema)))
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

(comment
  (require '[metabase.api.macros])

  (open-api-spec (metabase.api.macros/ns-routes 'metabase.geojson.rest.api) "/api/geojson")

  (metabase.api.macros.defendpoint.open-api/path-item
   "/api/card/:id/series"
   (:form (metabase.api.macros/find-route 'metabase.queries-rest.api.card :get "/:id/series")))

  (-> (mu.json-schema/transform :metabase.util.cron/CronScheduleString {:definitions-path "#/components/schemas/"})
      fix-json-schema))
