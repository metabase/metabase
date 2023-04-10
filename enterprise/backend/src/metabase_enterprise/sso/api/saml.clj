(ns metabase-enterprise.sso.api.saml
  "`/auth/saml` endpoints"
  (:require
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.models.setting :as setting]
   [metabase.util.schema :as su]
   [saml20-clj.core :as saml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api/defendpoint PUT "/settings"
  "Update SAML related settings. You must be a superuser to do this."
  [:as {settings :body}]
  {settings :map}
  (api/check-superuser)
  (let [filename (:saml-keystore-path settings)
        password (:saml-keystore-password settings)
        alias (:saml-keystore-alias settings)]
    (if (or (every? clojure.string/blank? [filename password alias])
            (saml/has-private-key? {:filename filename
                                    :password password
                                    :alias    alias}))
      (setting/set-many! settings)
      ;; test failed, return result message
      {:status 400
       :body   "Error finding private key in provided keystore and alias."})))

(api/define-routes)
