(ns metabase-enterprise.sso.api.saml
  "`/api/saml` endpoints"
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.setting :as setting]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]
   [saml20-clj.core :as saml]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :put "/settings"
  "Update SAML related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   settings :- :map]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-saml (tru "SAML-based authentication"))
  (let [filename (:saml-keystore-path settings)
        password (:saml-keystore-password settings)
        alias (:saml-keystore-alias settings)]
    (if (or (every? str/blank? [filename password alias])
            (saml/has-private-key? {:filename filename
                                    :password password
                                    :alias    alias}))
      (setting/set-many! settings)
      ;; test failed, return result message
      {:status 400
       :body   "Error finding private key in provided keystore and alias."})))
