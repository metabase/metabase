(ns metabase-enterprise.content-translation.embedding-routes
  "Enterprise endpoints that use [JSON web tokens](https://jwt.io/introduction/) to fetch data needed for embedded
  content translation. See the documentation for metabase.embedding.api.embed."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.content-translation.models :as ct]
   [metabase.embedding.jwt :as embedding.jwt]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru deferred-tru]]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Content translation --------------------------------------------

(api.macros/defendpoint :get "/dictionary/:token"
  "Fetch the content translation dictionary via a JSON Web Token signed with the `embedding-secret-key`."
  [{:keys [token]} :- [:map
                       [:token string?]]
   {:keys [locale]}]
  ;; this will error if bad
  (embedding.jwt/unsign token)
  (if locale
    {:data (ct/get-translations locale)}
    (throw (ex-info (str (tru "Locale is required.")) {:status-code 400}))))

(defn- +require-content-translation [handler]
  (fn [request respond raise]
    (if (premium-features/enable-content-translation?)
      (handler request respond raise)
      (respond {:status 402
                :body {:message (str (deferred-tru "Content translation"))}}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/embedded-content-translation` routes."
  (api.macros/ns-handler *ns* +require-content-translation))
