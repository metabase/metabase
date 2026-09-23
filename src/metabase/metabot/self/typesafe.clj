(ns metabase.metabot.self.typesafe
  "TypeSafe adapter, serving the Jev System One model. Its models answer typed questions rather than chat, so this
  adapter only backs the admin Connect round trip; asking Jev questions goes through [[metabase.jev.client]].

  https://docs.typesafe.ai/api"
  (:require
   [metabase.metabot.self.core :as core]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private models-path "/v1/models")

(defn- typesafe-error-msg
  "Canonical, status-specific TypeSafe error message. 529 is TypeSafe's own overloaded status."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "TypeSafe API key expired or invalid")
      403 (tru "TypeSafe denied access — check the API key permissions")
      404 (tru "TypeSafe API endpoint was not found — check the base URL")
      429 (tru "TypeSafe has rate limited us")
      500 (tru "TypeSafe returned an internal server error")
      529 (tru "TypeSafe is overloaded and is asking us to wait")
      (tru "TypeSafe API error (HTTP {0})" status))))

(defn- auth
  [{:keys [api-key base-url]} ai-proxy?]
  (when ai-proxy?
    (throw (ex-info (tru "AI proxy is not supported for TypeSafe")
                    {:api-error  true
                     :error-code :proxy-unsupported})))
  (core/resolve-auth "typesafe" "TypeSafe"
                     (when-let [k (not-empty api-key)]
                       {:url     base-url
                        :headers {"Authorization" (str "Bearer " k)}})
                     ai-proxy?))

(defn list-models
  "Verify the credentials against TypeSafe's model catalog and return no models.

  The catalog is fetched only because it is the credential round trip behind the admin Connect button. Its models are
  deliberately not offered: System One models cannot serve Metabot, so there is nothing to pick them for."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy?]}]
   (try
     (core/request (auth credentials ai-proxy?)
                   {:method  :get
                    :url     models-path
                    :as      :string
                    :headers {"Content-Type" "application/json"}})
     {:models []}
     (catch Exception e
       (core/rethrow-api-error! "typesafe" typesafe-error-msg e)))))
