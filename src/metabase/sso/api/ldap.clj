(ns metabase.sso.api.ldap
  "/api/ldap endpoints"
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.settings.core :as setting]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.schema :as sso.schema]
   [metabase.sso.settings :as sso.settings]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- bind-password-to-test
  "The bind password to test with: the stored Secret when the client echoed back the mask, otherwise the supplied
  value (nil clears it)."
  [new-password]
  (if (setting/obfuscated-value? new-password)
    (sso.settings/ldap-password)
    new-password))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/settings"
  "Update LDAP related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   settings :- [:map {:closed true}
                [:ldap-port                    {:optional true} [:maybe
                                                                 ;; treat empty string as nil
                                                                 {:decode/api (fn [x]
                                                                                (when-not (= x "")
                                                                                  x))}
                                                                 pos-int?]]
                [:ldap-password                {:optional true} [:maybe :string]]
                [:ldap-host                    {:optional true} [:maybe :string]]
                [:ldap-enabled                 {:optional true} [:maybe :boolean]]
                [:ldap-security                {:optional true} [:maybe [:enum "none" "ssl" "starttls"]]]
                [:ldap-bind-dn                 {:optional true} [:maybe :string]]
                [:ldap-user-base               {:optional true} [:maybe :string]]
                [:ldap-user-filter             {:optional true} [:maybe :string]]
                [:ldap-attribute-email         {:optional true} [:maybe :string]]
                [:ldap-attribute-firstname     {:optional true} [:maybe :string]]
                [:ldap-attribute-lastname      {:optional true} [:maybe :string]]
                [:ldap-group-sync              {:optional true} [:maybe :boolean]]
                [:ldap-group-base              {:optional true} [:maybe :string]]
                [:ldap-group-membership-filter {:optional true} [:maybe :string]]
                [:ldap-group-mappings          {:optional true} [:maybe ::sso.schema/group-mappings]]]]
  (api/check-superuser)
  (let [ldap-settings (-> settings
                          (update :ldap-password bind-password-to-test)
                          (dissoc :ldap-enabled))
        ldap-details  (set/rename-keys ldap-settings ldap/mb-settings->ldap-details)
        results       (ldap/test-ldap-connection ldap-details)]
    (if (= :SUCCESS (:status results))
      (t2/with-transaction [_conn]
        ;; We need to update the ldap settings before we update ldap-enabled, as the ldap-enabled setter tests the ldap
        ;; settings. A reused password is already stored, and there is no plaintext up here to write it with anyway.
        (setting/set-many! (cond-> ldap-settings
                             (u.secret/secret? (:ldap-password ldap-settings)) (dissoc :ldap-password)))
        (setting/set-value-of-type! :boolean :ldap-enabled (boolean (:ldap-enabled settings))))
      ;; test failed, return result message
      {:status 500
       :body   (ldap/humanize-error-messages results)})))
