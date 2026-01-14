(ns metabase.sso.api.ldap
  "/api/ldap endpoints"
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.settings.core :as setting]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.settings :as sso.settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- update-password-if-needed
  "Do not update password if `new-password` is an obfuscated value of the current password."
  [new-password]
  (let [current-password (sso.settings/ldap-password)]
    (if (= (setting/obfuscate-value current-password) new-password)
      current-password
      new-password)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/settings"
  "Update LDAP related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   settings :- [:map
                [:ldap-port    {:optional true} [:maybe
                                                 ;; treat empty string as nil
                                                 {:decode/api (fn [x]
                                                                (when-not (= x "")
                                                                  x))}
                                                 pos-int?]]
                [:ldap-password {:optional true} [:maybe :string]]
                [:ldap-host {:optional true} [:maybe :string]]
                [:ldap-enabled {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (let [ldap-settings (-> settings
                          (update :ldap-password update-password-if-needed)
                          (dissoc :ldap-enabled))
        ldap-details  (set/rename-keys ldap-settings ldap/mb-settings->ldap-details)
        results       (ldap/test-ldap-connection ldap-details)]
    (if (= :SUCCESS (:status results))
      (t2/with-transaction [_conn]
       ;; We need to update the ldap settings before we update ldap-enabled, as the ldap-enabled setter tests the ldap
       ;; settings
        (setting/set-many! ldap-settings)
        (setting/set-value-of-type! :boolean :ldap-enabled (boolean (:ldap-enabled settings))))
      ;; test failed, return result message
      {:status 500
       :body   (ldap/humanize-error-messages results)})))
