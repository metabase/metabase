(ns metabase.api.open-api
  "Protocols and schemas for OpenAPI schema generation.

  Actual implementation for [[metabase.api.macros/defendpoint]] endpoints lives
  in [[metabase.api.macros.defendpoint.open-api]]. "
  (:require
   [metabase.config.core :as config]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]
   [pretty.core :as pretty]))

(set! *warn-on-reflection* true)

(p/defprotocol+ OpenAPISpec
  ;; TODO -- context map instead of prefix?
  (open-api-spec [this prefix]
    "Get the OpenAPI spec base object (as a Clojure data structure) associated with a Ring handler. `prefix` is the
    route prefix in the Compojure `context` sense, e.g. `/api/` for [[metabase.api-routes.core/routes]], or
    `/api/user/` by the time we get to [[metabase.users-rest.api]], etc."))

(extend-protocol OpenAPISpec
  nil
  (open-api-spec [_nil _prefix] nil)

  Object
  (open-api-spec [this _prefix]
    (throw (ex-info (format "Handler does not implement OpenAPISpec: did you forget to wrap it in %s?"
                            `handler-with-open-api-spec)
                    {:handler this})))

  clojure.lang.Var
  (open-api-spec [this prefix]
    (open-api-spec (var-get this) prefix)))

(declare ->HandlerWithOpenAPISpec)

(p/deftype+ HandlerWithOpenAPISpec [^clojure.lang.IFn handler spec-fn metadata]
  clojure.lang.IFn
  (invoke [_this request respond raise]
    (.invoke handler request respond raise))

  OpenAPISpec
  (open-api-spec [_this prefix]
    (spec-fn prefix))

  clojure.lang.IObj
  (meta [_this]
    metadata)
  (withMeta [_this new-metadata]
    (->HandlerWithOpenAPISpec handler spec-fn new-metadata))

  Object
  (equals [_this another]
    (and (instance? HandlerWithOpenAPISpec another)
         (= (.handler ^HandlerWithOpenAPISpec another) handler)))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `handler-with-open-api-spec handler spec-fn)))

(mr/def ::spec.info.license
  [:map {:closed true}
   [:name :string]
   [:url  {:optional true} :string]])

(mr/def ::spec.info
  [:map {:closed true}
   [:title   [:= "Metabase API"]]
   [:version :string]
   [:license {:optional true} ::spec.info.license]])

(mr/def ::path
  :string)

(mr/def ::method
  [:enum :get :post :put :delete :patch])

(mr/def ::parameter.type
  (ms/enum-decode-keyword [:string :number :integer :boolean :null :object :array]))

(mr/def ::parameter.in
  [:enum :query :header :path :cookie])

(mr/def ::parameter.schema
  "A JSON Schema node as [[metabase.api.macros.defendpoint.open-api]] builds it: any combination of JSON Schema keywords."
  [:map {:closed true}
   [:type                 {:optional true} ::parameter.type]
   [:$ref                 {:optional true} [:re
                                            {:description "string starting with '#/components/schemas/'"}
                                            #"^#/components/schemas/[^/]+$"]]
   [:description          {:optional true} :string]
   [:title                {:optional true} :string]
   [:optional             {:optional true} :boolean]
   [:default              {:optional true} [:or :keyword ms/JSONSchemaLiteral]]
   [:examples             {:optional true} [:sequential ms/JSONSchemaLiteral]]
   [:nullable             {:optional true} :boolean]
   [:deprecated           {:optional true} :boolean]
   [:const                {:optional true} [:or :keyword ms/JSONSchemaLiteral]]
   [:enum                 {:optional true} [:sequential [:or :keyword ms/JSONSchemaLiteral]]]
   [:format               {:optional true} (ms/enum-decode-keyword [:binary :byte :uuid :date-time :date :time :email :uri])]
   [:pattern              {:optional true} [:or :string (ms/InstanceOfClass java.util.regex.Pattern)]]
   [:minLength            {:optional true} integer?]
   [:maxLength            {:optional true} integer?]
   [:minimum              {:optional true} number?]
   [:maximum              {:optional true} number?]
   [:exclusiveMinimum     {:optional true} [:or number? :boolean]]
   [:exclusiveMaximum     {:optional true} [:or number? :boolean]]
   [:multipleOf           {:optional true} number?]
   [:properties           {:optional true} [:map-of :string [:ref ::parameter.schema]]]
   [:required             {:optional true} [:sequential :string]]
   [:additionalProperties {:optional true} [:or :boolean [:ref ::parameter.schema]]]
   [:minProperties        {:optional true} integer?]
   [:maxProperties        {:optional true} integer?]
   [:items                {:optional true} [:or :boolean [:ref ::parameter.schema] [:sequential [:ref ::parameter.schema]]]]
   [:prefixItems          {:optional true} [:sequential [:ref ::parameter.schema]]]
   [:additionalItems      {:optional true} :boolean]
   [:uniqueItems          {:optional true} :boolean]
   [:minItems             {:optional true} integer?]
   [:maxItems             {:optional true} integer?]
   [:oneOf                {:optional true} [:sequential [:ref ::parameter.schema]]]
   [:anyOf                {:optional true} [:sequential [:ref ::parameter.schema]]]
   [:allOf                {:optional true} [:sequential [:ref ::parameter.schema]]]
   [:definitions          {:optional true} [:map-of :string [:ref ::parameter.schema]]]])

(mr/def ::parameter
  "https://swagger.io/specification/#parameter-object"
  [:map {:closed true}
   [:name        string?]
   [:in          ::parameter.in]
   [:description {:optional true} :string]
   [:required    :boolean]
   [:schema      ::parameter.schema]])

(mr/def ::path-item.request-body
  [:map {:closed true}
   [:content [:map-of
              [:enum "application/json" "multipart/form-data"]
              [:map {:closed true}
               [:schema ::parameter.schema]]]]])

(mr/def ::path-item.responses
  [:map-of
   ;; can be exact status codes: "200" status code ranges: "5XX" and or "default"
   :string
   [:map {:closed true}
    [:description :string]
    [:content     {:optional true} [:map-of
                                    [:enum "application/json" "multipart/form-data"]
                                    [:map {:closed true} [:schema ::parameter.schema]]]]
    ;; TODO -- headers, links, etc.
    ]])

(mr/def ::path-item
  [:map {:closed true}
   [:operationId :string]
   [:summary     :string]
   [:description :string]
   [:parameters  [:sequential ::parameter]]
   [:requestBody {:optional true} ::path-item.request-body]
   [:tags        {:optional true} [:sequential :string]]
   [:deprecated  {:optional true} :boolean]
   [:responses   ::path-item.responses]])

(mr/def ::security-scheme
  [:map {:closed true}
   [:type :string]
   [:in {:optional true} :string]
   [:name {:optional true} :string]
   [:description {:optional true} :string]])

(mr/def ::components
  [:map {:closed true}
   [:schemas [:map-of :string ::parameter.schema]]
   [:securitySchemes {:optional true} [:map-of :string ::security-scheme]]])

(mr/def ::security-requirement
  [:map-of :string [:sequential :string]])

(mr/def ::spec
  "Based on https://swagger.io/specification/."
  [:map {:closed true}
   [:openapi    {:optional true} :string]
   [:info       {:optional true} ::spec.info]
   [:paths      [:map-of ::path [:map-of ::method ::path-item]]]
   [:components ::components]
   [:security   {:optional true} [:sequential ::security-requirement]]])

(defn handler-with-open-api-spec
  "Attach `spec-fn`, which has the signature

    (spec-fn prefix) => open-api-spec

  to a Ring `handler`."
  [handler spec-fn]
  (->HandlerWithOpenAPISpec handler spec-fn (meta handler)))

(mu/defn root-open-api-object :- ::spec
  "Generate base object for OpenAPI (/paths and /components/schemas)

  https://spec.openapis.org/oas/latest.html#openapi-object"
  [handler :- [:=> [:cat :map fn? fn?] any?]]
  {:closed true}
  (let [base-spec (open-api-spec handler "/api")]
    (-> base-spec
        (assoc :openapi "3.1.0"
               :info    {:title   "Metabase API"
                         :version (:tag config/mb-version-info)
                         :license {:name "AGPL-3.0"
                                   :url  "https://www.gnu.org/licenses/agpl-3.0.html"}}
               ;; Apply API key authentication to all endpoints by default
               :security [{"ApiKeyAuth" []}])
        (assoc-in [:components :securitySchemes]
                  {"ApiKeyAuth" {:type        "apiKey"
                                 :in          "header"
                                 :name        "X-API-Key"
                                 :description "API key for authentication"}}))))

;; REPL example; api-routes is cross-module, resolved at runtime
#_{:clj-kondo/ignore [:metabase/modules]}
(comment
  (require '[metabase.api.macros])

  (open-api-spec (metabase.api.macros/ns-handler 'metabase.geojson.api) "/api/geojson")
  (root-open-api-object (requiring-resolve 'metabase.api-routes.core/routes)))
