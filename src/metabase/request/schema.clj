(ns metabase.request.schema
  (:require
   [metabase.server.streaming-response]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (metabase.server.streaming_response StreamingResponse)))

(comment metabase.server.streaming-response/keep-me)

;;; TODO (Cam 8/13/25) -- should this map be closed, that way we can make sure all the keys we might be using are
;;; enumerated here?
(mr/def ::current-user-info
  [:map {:closed true, :probe/id "src/metabase/request/schema.clj:14"}
   [:metabase-user-id   {:optional true} pos-int?]
   [:is-superuser?      {:optional true} :boolean]
   [:is-data-analyst?   {:optional true} :boolean]
   [:user-locale        {:optional true} [:maybe string?]]
   [:is-group-manager?  {:optional true} :boolean]
   [:permissions-set    {:optional true} [:set :string]]
   [:auth-provider      {:optional true} [:maybe :string]]
   [:settings           {:optional true} [:maybe [:or ms/UserSettings :string]]]
   [:token-scopes       {:optional true} [:maybe [:set [:or :keyword :string]]]]
   [:token-scopes-checked {:optional true} :boolean]])

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
  [:map {:closed true, :probe/id "src/metabase/request/schema.clj:39"}
   [:filename     :string]
   [:content-type :string]
   [:tempfile     (ms/InstanceOfClass java.io.File)]
   [:size         :int]])

(mr/def ::cookie-attrs
  "One `:cookies` entry of a request or response: a cookie's value and its attributes."
  [:map {:closed true, :probe/id "src/metabase/request/schema.clj:47"}
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
  [:map {:closed true, :probe/id "src/metabase/request/schema.clj:59"}
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
   [:headers                 {:optional true} [:map-of :string [:maybe :string]]]
   [:body                    {:optional true} [:maybe [:or (ms/InstanceOfClass java.io.InputStream) ms/RingRequestBody]]]
   [:query-params            {:optional true} [:map-of :string [:maybe [:or :string [:sequential :string]]]]]
   [:form-params             {:optional true} [:map-of :string [:or :string [:sequential :string]]]]
   [:multipart-params        {:optional true} [:map-of :string [:or :string ::multipart-file]]]
   [:route-params            {:optional true} ms/RingRequestParams]
   [:cookies                 {:optional true} [:map-of :string ::cookie-attrs]]
   [:route-metadata          {:optional true} [:maybe :metabase.api.macros/route-metadata]]
   [:compojure/path          {:optional true} :string]
   [:compojure/route-context {:optional true} [:maybe :string]]
   [:context                 {:optional true} [:maybe :string]]
   [:character-encoding      {:optional true} [:maybe :string]]
   [:content-type            {:optional true} [:maybe :string]]
   [:content-length          {:optional true} [:maybe :int]]
   [:params                  {:optional true} ms/RingRequestParams]
   [:metabase-session-key    {:optional true} [:maybe :string]]
   [:metabase-session-type   {:optional true} [:maybe :keyword]]
   [:anti-csrf-token         {:optional true} [:maybe :string]]
   [:metabase-user-id        {:optional true} [:maybe :int]]
   [:metabase-request-id     {:optional true} [:maybe :string]]
   [:request-id              {:optional true} [:maybe [:or :uuid :string]]]
   [:browser-id              {:optional true} [:maybe :string]]
   [:static-metabase-api-key {:optional true} [:maybe :string]]
   [:nonce                   {:optional true} [:maybe :string]]
   [:is-superuser?           {:optional true} :boolean]
   [:is-data-analyst?        {:optional true} :boolean]
   [:is-group-manager?       {:optional true} :boolean]
   [:user-locale             {:optional true} [:maybe :string]]
   [:embedding/auth-method   {:optional true} [:maybe :string]]
   [:token-exchange?         {:optional true} :boolean]
   [:metabase.server.middleware.offset-paging/limit  {:optional true} [:maybe :int]]
   [:metabase.server.middleware.offset-paging/offset {:optional true} [:maybe :int]]
   [:accept                  {:optional true} [:maybe :string]]
   [:redirect-strategy       {:optional true} [:maybe :keyword]]
   [:method                  {:optional true} [:maybe :keyword]]
   [:compojure/route         {:optional true} [:maybe [:tuple :keyword :string]]]
   [:remember                {:optional true} [:maybe :string]]
   [:slack/validated?        {:optional true} :boolean]
   [:token-scopes            {:optional true} [:maybe [:set [:or :keyword :string]]]]
   [:token-scopes-checked    {:optional true} :boolean]
   [:mcp-ui-session-id       {:optional true} [:maybe :string]]
   [:mcp-ui-credential       {:optional true} [:maybe
                                               [:map {:closed true, :probe/id "src/metabase/request/schema.clj:112"}
                                                [:v            :int]
                                                [:uid          :int]
                                                [:sid          :string]
                                                [:exp          :int]
                                                [:scp          {:optional true} [:sequential :string]]
                                                [:unr          {:optional true} :boolean]
                                                [:token-scopes {:optional true} [:maybe [:set [:or :string :keyword]]]]]]]])

(mr/def ::response
  "What an endpoint handler can return: JSON-shaped data, a full Ring response map, or a file/stream for downloads."
  [:or
   ms/RingResponseBody
   [:map {:closed true, :probe/id "src/metabase/request/schema.clj:125"} [:id :string]]
   [:map {:closed true, :probe/id "src/metabase/request/schema.clj:126"} [:success :boolean] [:session_id :string]]
   [:map {:closed true, :probe/id "src/metabase/request/schema.clj:127"}
    [:status  {:optional true} :int]
    [:headers {:optional true} [:map-of :string :string]]
    [:cookies {:optional true} [:map-of :string ::cookie-attrs]]
    [:body    {:optional true} [:maybe [:or ms/RingResponseBody
                                        (ms/InstanceOfClass java.io.File)
                                        (ms/InstanceOfClass java.io.InputStream)]]]]
   (ms/InstanceOfClass java.io.File)
   (ms/InstanceOfClass java.io.InputStream)
   (ms/InstanceOfClass StreamingResponse)])
