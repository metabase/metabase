(ns metabase-enterprise.embed.content-translation.api
  "Enterprise endpoints that use [JSON web tokens](https://jwt.io/introduction/) to fetch data needed for embedded
  content translation. See the documentation for metabase.embedding.api.embed."
  (:require
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase.api.macros :as api.macros]
   [metabase.content-translation.models :as ct]
   [metabase.embedding.jwt :as embedding.jwt]
   [metabase.util.i18n :refer [tru deferred-tru]]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Content translation --------------------------------------------

(api.macros/defendpoint :get "/dictionary/:token"
  ;; TODO: This needs a unit test!
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
  (ee.api.common/+require-premium-feature :content-translation (deferred-tru "Content translation") handler))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/embed/content-translation` routes."
  (api.macros/ns-handler *ns* +require-content-translation))
