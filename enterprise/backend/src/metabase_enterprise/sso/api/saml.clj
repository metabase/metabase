(ns metabase-enterprise.sso.api.saml
  "`/api/saml` endpoints"
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [saml20-clj.core :as saml]))

(set! *warn-on-reflection* true)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/settings"
  "Update SAML related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   settings :- [:map
                [:saml-identity-provider-issuer      {:optional true} :string]
                [:saml-identity-provider-uri         {:optional true} :string]
                [:saml-identity-provider-certificate {:optional true} :string]
                [:saml-application-name              {:optional true} [:maybe :string]]
                [:saml-attribute-email               {:optional true} [:maybe :string]]
                [:saml-attribute-firstname           {:optional true} [:maybe :string]]
                [:saml-attribute-group               {:optional true} [:maybe :string]]
                [:saml-attribute-group-mappings      {:optional true} [:maybe :map]]
                [:saml-attribute-lastname            {:optional true} [:maybe :string]]
                [:saml-enabled                       {:optional true} [:maybe :boolean]]
                [:saml-group-sync                    {:optional true} [:maybe :boolean]]
                [:saml-keystore-alias                {:optional true} [:maybe :string]]
                [:saml-keystore-password             {:optional true} [:maybe :string]]
                [:saml-user-provisioning-enabled?    {:optional true} [:maybe :boolean]]
                [:saml-keystore-path                 {:optional true} [:maybe :string]]]]
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
