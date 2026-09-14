(ns metabase.request.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; TODO (Cam 8/13/25) -- should this map be closed, that way we can make sure all the keys we might be using are
;;; enumerated here?
(mr/def ::current-user-info
  [:map {:closed true}
   [:metabase-user-id   {:optional true} pos-int?]
   [:is-superuser?      {:optional true} :boolean]
   [:is-data-analyst?   {:optional true} :boolean]
   [:user-locale        {:optional true} [:maybe string?]]
   [:is-group-manager?  {:optional true} :boolean]
   [:permissions-set    {:optional true} [:set :string]]])

(mr/def ::json-value
  "A JSON-shaped value: a scalar, a sequence of JSON values, or a string-keyed JSON object."
  [:or
   :string
   :keyword
   number?
   :boolean
   :nil
   [:sequential [:ref ::json-value]]
   [:map-of :string [:ref ::json-value]]])

(mr/def ::multipart-file
  "One `:multipart-params` entry for an uploaded file, as `ring.middleware.multipart-params` builds it."
  [:map {:closed true}
   [:filename     :string]
   [:content-type :string]
   [:tempfile     (ms/InstanceOfClass java.io.File)]
   [:size         :int]])

(mr/def ::cookie-attrs
  "One `:cookies` entry of a request or response: a cookie's value and its attributes."
  [:map {:closed true}
   [:value     {:optional true} :string]
   [:path      {:optional true} :string]
   [:domain    {:optional true} :string]
   [:max-age   {:optional true} :int]
   [:expires   {:optional true} :string]
   [:secure    {:optional true} :boolean]
   [:http-only {:optional true} :boolean]
   [:same-site {:optional true} [:enum :strict :lax :none]]])

(mr/def ::request
  "A Ring request map, including the keys Metabase's own middleware stack adds."
  [:map {:closed true}
   [:server-port             {:optional true} :int]
   [:server-name             {:optional true} :string]
   [:remote-addr             {:optional true} :string]
   [:uri                     {:optional true} :string]
   [:path-info               {:optional true} :string]
   [:query-string            {:optional true} [:maybe :string]]
   [:scheme                  {:optional true} :keyword]
   [:request-method          {:optional true} :keyword]
   [:protocol                {:optional true} :string]
   [:ssl-client-cert         {:optional true} [:maybe (ms/InstanceOfClass java.security.cert.X509Certificate)]]
   [:headers                 {:optional true} [:map-of :string :string]]
   [:body                    {:optional true} [:maybe [:or (ms/InstanceOfClass java.io.InputStream) ::json-value]]]
   [:query-params            {:optional true} [:map-of :string [:or :string [:sequential :string]]]]
   [:form-params             {:optional true} [:map-of :string [:or :string [:sequential :string]]]]
   [:multipart-params        {:optional true} [:map-of :string [:or :string ::multipart-file]]]
   [:route-params            {:optional true} [:map-of :string :string]]
   [:cookies                 {:optional true} [:map-of :string ::cookie-attrs]]
   ;; a literal keyword rather than a require, to avoid a cycle: `metabase.api.macros` requires this namespace.
   [:route-metadata          {:optional true} [:maybe :metabase.api.macros/route-metadata]]
   [:compojure/path          {:optional true} :string]
   [:metabase-session-key    {:optional true} [:maybe :string]]
   [:metabase-session-type   {:optional true} [:maybe :keyword]]
   [:anti-csrf-token         {:optional true} [:maybe :string]]
   [:metabase-user-id        {:optional true} [:maybe :int]]
   [:metabase-request-id     {:optional true} [:maybe :string]]
   [:request-id              {:optional true} [:maybe :string]]
   [:browser-id              {:optional true} [:maybe :string]]
   [:static-metabase-api-key {:optional true} [:maybe :string]]
   [:nonce                   {:optional true} [:maybe :string]]])

(mr/def ::response
  "What an endpoint handler can return: JSON-shaped data, a full Ring response map, or a file/stream for downloads."
  [:or
   ::json-value
   [:map {:closed true}
    [:status  {:optional true} :int]
    [:headers {:optional true} [:map-of :string :string]]
    [:cookies {:optional true} [:map-of :string ::cookie-attrs]]
    [:body    {:optional true} [:maybe [:or ::json-value
                                        (ms/InstanceOfClass java.io.File)
                                        (ms/InstanceOfClass java.io.InputStream)]]]]
   (ms/InstanceOfClass java.io.File)
   (ms/InstanceOfClass java.io.InputStream)])
