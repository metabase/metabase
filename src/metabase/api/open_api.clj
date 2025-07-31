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
    `/api/user/` by the time we get to [[metabase.users.api]], etc."))

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

(mr/def ::spec.info
  [:map
   [:title   [:= "Metabase API"]]
   [:version [:= (:tag config/mb-version-info)]]])

(mr/def ::path
  :string)

(mr/def ::method
  [:enum :get :post :put :delete :patch])

(mr/def ::parameter.type
  [:enum :string :number :integer :boolean :null :object :array])

(mr/def ::parameter.in
  [:enum :query :header :path :cookie])

(mr/def ::parameter.schema.common
  [:map
   [:default     {:optional true} :any]
   [:description {:optional true} :string]
   [:optional    {:optional true} :boolean]])

(mr/def ::parameter.schema.typed.common
  [:merge
   ::parameter.schema.common
   [:map

    [:type ::parameter.type]
    ;; TODO -- I don't think `:null` can have `:enum`
    [:enum {:optional true} [:sequential :any]]]])

(mr/def ::parameter.schema.string
  [:merge
   ::parameter.schema.typed.common
   [:map

    [:type [:= :string]]
    [:format    {:optional true} [:enum :binary "binary" :byte "byte"]]
    [:minLength {:optional true} integer?]
    [:maxLength {:optional true} integer?]
    [:pattern   {:optional true} (ms/InstanceOfClass java.util.regex.Pattern)]]])

(mr/def ::parameter.schema.number
  [:merge
   ::parameter.schema.typed.common
   [:map

    [:type [:= :number]]
    [:minimum {:optional true} number?]
    [:maximum {:optional true} number?]]])

(mr/def ::parameter.schema.integer
  [:merge
   ::parameter.schema.typed.common
   [:map

    [:type [:= :integer]]
    [:minimum {:optional true} integer?]
    [:maximum {:optional true} integer?]]])

(mr/def ::parameter.schema.boolean
  [:merge
   ::parameter.schema.typed.common
   [:map

    [:type [:= :boolean]]]])

(mr/def ::parameter.schema.null
  [:merge
   ::parameter.schema.typed.common
   [:map

    [:type [:= :null]]]])

(mr/def ::parameter.schema.object
  [:merge
   ::parameter.schema.typed.common
   [:map
    [:type                 [:= :object]]
    [:properties           {:optional true} [:map-of :string [:ref ::parameter.schema]]]
    [:additionalProperties {:optional true} [:multi
                                             {:dispatch boolean?}
                                             [true  [:= false]]
                                             [false [:ref ::parameter.schema]]]]
    [:required             {:optional true} [:sequential :string]]
    [:definitions          {:optional true} [:map-of :string [:ref ::parameter.schema]]]]])

(mr/def ::parameter.schema.array
  [:merge
   ::parameter.schema.typed.common
   [:map

    [:type        [:= :array]]
    [:items           {:optional true} [:multi
                                        {:dispatch map?}
                                        [true [:ref ::parameter.schema]]
                                        ;; for a tuple. I don't think this is correct, I think you're supposed to use `prefixItems` -- see
                                        ;; https://stackoverflow.com/questions/57464633/how-to-define-a-json-array-with-concrete-item-definition-for-every-index-i-e-a
                                        [false [:sequential [:ref ::parameter.schema]]]]]
    [:uniqueItems     {:optional true} :boolean]
    [:additionalItems {:optional true} :boolean] ; for tuples
    [:minItems        {:optional true} integer?]
    [:maxItems        {:optional true} integer?]]])

(mr/def ::parameter.schema.typed
  [:and
   [:map
    [:type ::parameter.type]]
   [:multi
    {:dispatch :type}
    [:string  ::parameter.schema.string]
    [:number  ::parameter.schema.number]
    [:integer ::parameter.schema.integer]
    [:boolean ::parameter.schema.boolean]
    [:null    ::parameter.schema.null]
    [:object  ::parameter.schema.object]
    [:array   ::parameter.schema.array]]])

(mr/def ::parameter.schema.ref
  [:merge
   ::parameter.schema.common
   [:map

    [:$ref [:re
            {:description "string starting with '#/components/schemas/'"}
            #"^#/components/schemas/[^/]+$"]]
    [:definitions {:optional true} [:map-of :string [:ref ::parameter.schema]]]]])

(mr/def ::parameter.schema.or
  "Not sure what the difference is between `:oneOf` and `:anyOf` but they seem to both mean 'or'."
  [:multi
   {:dispatch (fn [x]
                (if (contains? x :anyOf)
                  :anyOf
                  :oneOf))}
   [:anyOf
    [:merge
     ::parameter.schema.common
     [:map

      [:anyOf [:sequential [:ref ::parameter.schema]]]]]]
   [:oneOf
    [:merge
     ::parameter.schema.common
     [:map

      [:oneOf [:sequential [:ref ::parameter.schema]]]]]]])

(mr/def ::parameter.schema.and
  [:merge
   ::parameter.schema.common
   [:map

    [:allOf [:sequential [:ref ::parameter.schema]]]]])

(mr/def ::parameter.schema.const
  [:merge
   ::parameter.schema.common
   [:map

    [:const :any]]])

(mr/def ::parameter.schema.untyped-enum
  [:merge
   ::parameter.schema.common
   [:map

    [:enum [:sequential :any]]]])

(mr/def ::parameter.schema.empty
  "These are mostly the result of `:fn` schemas which get translated to empty maps."
  ::parameter.schema.common)

(mr/def ::parameter.schema
  [:and
   :map
   [:multi
    {:dispatch (fn [x]
                 (cond
                   (not (map? x))       :invalid
                   (:type x)            :typed
                   (contains? x :$ref)  :ref
                   (contains? x :oneOf) :or
                   (contains? x :anyOf) :or
                   (contains? x :allOf) :and
                   (contains? x :const) :const
                   (:enum x)            :untyped-enum
                   :else                :empty))}
    [:invalid      :map]
    [:typed        ::parameter.schema.typed]
    [:ref          ::parameter.schema.ref]
    [:or           ::parameter.schema.or]
    [:and          ::parameter.schema.and]
    [:const        ::parameter.schema.const]
    [:untyped-enum ::parameter.schema.untyped-enum]
    [:empty        ::parameter.schema.empty]]])

(mr/def ::parameter
  "https://swagger.io/specification/#parameter-object"
  [:map
   [:name        string?]
   [:in          ::parameter.in]
   [:description {:optional true} :string]
   [:required    :boolean]
   [:schema      ::parameter.schema]])

(mr/def ::path-item.request-body
  [:map
   [:content [:map-of
              [:enum "application/json" "multipart/form-data"]
              [:map
               [:schema ::parameter.schema]]]]])

(mr/def ::path-item.responses
  [:map-of
   ;; can be exact status codes: "200" status code ranges: "5XX" and or "default"
   :string
   [:map
    [:description :string]
    [:content     {:optional true} [:map-of
                                    [:enum "application/json" "multipart/form-data"]
                                    [:map [:schema ::parameter.schema]]]]
    ;; TODO -- headers, links, etc.
    ]])

(mr/def ::path-item
  [:map
   [:summary     :string]
   [:description :string]
   [:parameters  [:sequential ::parameter]]
   [:requestBody {:optional true} ::path-item.request-body]
   [:tags        {:optional true} [:sequential :string]]
   [:responses   ::path-item.responses]])

(mr/def ::components
  [:map
   [:schemas [:map-of :string ::parameter.schema]]])

(mr/def ::spec
  "Based on https://swagger.io/specification/."
  [:map
   [:openapi    {:optional true} :string]
   [:info       {:optional true} ::spec.info]
   [:paths      [:map-of ::path [:map-of ::method ::path-item]]]
   [:components ::components]])

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
  (merge
   {:openapi "3.1.0"
    :info    {:title   "Metabase API"
              :version (:tag config/mb-version-info)}}
   (open-api-spec handler "/api")))

#_:clj-kondo/ignore
(comment
  (open-api-spec (metabase.api.macros/ns-handler 'metabase.geojson.api) "/api/geojson")
  (root-open-api-object (requiring-resolve 'metabase.api-routes.core/routes)))
