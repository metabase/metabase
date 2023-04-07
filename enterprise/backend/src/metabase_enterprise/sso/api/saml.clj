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

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/settings"
  "Update SAML related settings. You must be a superuser or have `setting` permission to do this."
  [:as {settings :body}]
  {settings su/Map}
  (api/check-superuser)
  (let [filename (:saml-keystore-path settings)
        password (:saml-keystore-password settings)
        alias (:saml-keystore-alias settings)]
    (if (or (every? empty? [filename password alias])
            (saml/has-private-key? {:filename filename
                                    :password password
                                    :alias    alias}))
      (t2/with-transaction [_conn]
        (setting/set-many! settings))
      ;; test failed, return result message
      {:status 500
       :body   "Error finding private key in provided keystore and alias."})))

(api/define-routes)
