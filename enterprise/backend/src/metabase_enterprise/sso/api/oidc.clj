(ns metabase-enterprise.sso.api.oidc
  "Admin-only CRUD endpoints for managing OIDC providers at `/api/ee/sso/oidc`."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.sso.oidc.check :as oidc.check]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Schema --------------------------------------------------

(def ^:private oidc-provider-create-schema
  [:map {:closed true}
   [:name :string]
   [:display-name :string]
   [:issuer-uri :string]
   [:client-id :string]
   [:client-secret :string]
   [:scopes {:optional true} [:sequential :string]]
   [:enabled {:optional true} :boolean]
   [:auto-provision {:optional true} :boolean]
   [:attribute-map {:optional true} [:map-of :string :string]]
   [:group-sync {:optional true} [:map {:closed true}
                                  [:enabled {:optional true} :boolean]
                                  [:group-attribute {:optional true} :string]
                                  [:group-mappings {:optional true} [:map-of :string [:sequential :int]]]]]
   [:icon-url {:optional true} [:maybe :string]]
   [:button-color {:optional true} [:maybe :string]]
   [:display-order {:optional true} :int]])

(def ^:private oidc-provider-update-schema
  [:map {:closed true}
   [:display-name {:optional true} :string]
   [:issuer-uri {:optional true} :string]
   [:client-id {:optional true} :string]
   [:client-secret {:optional true} :string]
   [:scopes {:optional true} [:sequential :string]]
   [:enabled {:optional true} :boolean]
   [:auto-provision {:optional true} :boolean]
   [:attribute-map {:optional true} [:map-of :string :string]]
   [:group-sync {:optional true} [:map {:closed true}
                                  [:enabled {:optional true} :boolean]
                                  [:group-attribute {:optional true} :string]
                                  [:group-mappings {:optional true} [:map-of :string [:sequential :int]]]]]
   [:icon-url {:optional true} [:maybe :string]]
   [:button-color {:optional true} [:maybe :string]]
   [:display-order {:optional true} :int]])

(def ^:private oidc-provider-response-schema
  [:map {:closed true}
   [:name :string]
   [:display-name :string]
   [:issuer-uri :string]
   [:client-id :string]
   [:client-secret :string]
   [:scopes {:optional true} [:sequential :string]]
   [:enabled {:optional true} :boolean]
   [:auto-provision {:optional true} :boolean]
   [:attribute-map {:optional true} [:map-of :string :string]]
   [:group-sync {:optional true} [:map {:closed true}
                                  [:enabled {:optional true} :boolean]
                                  [:group-attribute {:optional true} :string]
                                  [:group-mappings {:optional true} [:map-of :string [:sequential :int]]]]]
   [:icon-url {:optional true} [:maybe :string]]
   [:button-color {:optional true} [:maybe :string]]
   [:display-order {:optional true} :int]])

;;; -------------------------------------------------- Helpers --------------------------------------------------

(defn- sanitize-provider
  "Remove sensitive fields from a provider for API responses."
  [provider]
  (cond-> provider
    (:client-secret provider)  (update :client-secret setting/obfuscate-value)
    (:attribute-map provider)  (update :attribute-map walk/stringify-keys)))

(defn- check-oidc-connection!
  "Run OIDC configuration check and throw a 400 if it fails. Returns the check result on success."
  [issuer-uri client-id client-secret]
  (let [result (oidc.check/check-oidc-configuration issuer-uri client-id client-secret)]
    (api/check-400 (:ok result)
                   (or (get-in result [:credentials :error])
                       (get-in result [:discovery :error])
                       "OIDC configuration check failed"))
    result))

;;; -------------------------------------------------- Endpoints --------------------------------------------------

;; GET /api/ee/sso/oidc
(api.macros/defendpoint :get "/" :- [:sequential oidc-provider-response-schema]
  "List all OIDC providers (with client secrets masked)."
  []
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (mapv sanitize-provider (sso-settings/oidc-providers)))

;; GET /api/ee/sso/oidc/:slug
(api.macros/defendpoint :get "/:slug" :- oidc-provider-response-schema
  "Get a single OIDC provider by slug (with client secret masked)."
  [{:keys [slug]} :- [:map [:slug :string]]]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [provider (sso-settings/get-oidc-provider slug)]
    (api/check-404 provider)
    (sanitize-provider provider)))

;; POST /api/ee/sso/oidc
(api.macros/defendpoint :post "/" :- oidc-provider-response-schema
  "Create a new OIDC provider."
  [_route-params
   _query-params
   body :- oidc-provider-create-schema]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [slug (:name body)]
    (api/check-400 (u/valid-slug? slug) "Provider name must be a URL-safe slug (lowercase letters, numbers, hyphens, must start with letter or number)")
    (api/check-400 (nil? (sso-settings/get-oidc-provider slug)) (format "An OIDC provider with name %s already exists" slug))
    (check-oidc-connection! (:issuer-uri body) (:client-id body) (:client-secret body))
    (let [providers (sso-settings/oidc-providers)
          new-provider (merge {:enabled false
                               :scopes ["openid" "email" "profile"]}
                              body)]
      (sso-settings/oidc-providers! (conj (vec providers) new-provider))
      (sanitize-provider new-provider))))

;; PUT /api/ee/sso/oidc/:slug
(api.macros/defendpoint :put "/:slug" :- oidc-provider-response-schema
  "Update an existing OIDC provider."
  [{:keys [slug]} :- [:map [:slug :string]]
   _query-params
   body :- oidc-provider-update-schema]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [providers (sso-settings/oidc-providers)
        idx       (some (fn [[i p]] (when (= (:name p) slug) i))
                        (map-indexed vector providers))]
    (api/check-404 idx)
    (let [existing  (nth providers idx)
          ;; If client-secret is the mask or not provided, keep the existing one
          body      (if (or (not (:client-secret body))
                            (= (:client-secret body) (setting/obfuscate-value (:client-secret body))))
                      (dissoc body :client-secret)
                      body)
          updated   (merge existing body)]
      (check-oidc-connection! (:issuer-uri updated) (:client-id updated) (:client-secret updated))
      (let [providers (assoc (vec providers) idx updated)]
        (sso-settings/oidc-providers! providers)
        (sanitize-provider updated)))))

;; POST /api/ee/sso/oidc/check
(def ^:private oidc-check-request-schema
  [:map {:closed true}
   [:issuer-uri :string]
   [:client-id :string]
   [:client-secret {:optional true} [:maybe :string]]
   [:name {:optional true} [:maybe :string]]])

(def ^:private oidc-check-step-schema
  [:map
   [:step :keyword]
   [:success :boolean]
   [:verified {:optional true} :boolean]
   [:error {:optional true} :string]
   [:token-endpoint {:optional true} :string]])

(def ^:private oidc-check-response-schema
  [:map
   [:ok :boolean]
   [:discovery oidc-check-step-schema]
   [:credentials {:optional true} oidc-check-step-schema]])

(api.macros/defendpoint :post "/check" :- oidc-check-response-schema
  "Check an OIDC provider configuration by probing its discovery document and testing client credentials."
  [_route-params
   _query-params
   body :- oidc-check-request-schema]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [issuer-uri    (:issuer-uri body)
        client-id     (:client-id body)
        client-secret (let [s (:client-secret body)]
                        (if (str/blank? s)
                          ;; If no secret provided, look up the stored one by provider name
                          (when-let [provider-name (:name body)]
                            (when-let [provider (sso-settings/get-oidc-provider provider-name)]
                              (:client-secret provider)))
                          s))]
    (check-oidc-connection! issuer-uri client-id client-secret)))

;; DELETE /api/ee/sso/oidc/:slug
(api.macros/defendpoint :delete "/:slug"  :- :nil
  "Delete an OIDC provider."
  [{:keys [slug]} :- [:map [:slug :string]]]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [providers (sso-settings/oidc-providers)
        filtered  (vec (remove #(= (:name %) slug) providers))]
    (when (= (count providers) (count filtered))
      (api/check-404 nil))
    (sso-settings/oidc-providers! filtered)
    nil))
