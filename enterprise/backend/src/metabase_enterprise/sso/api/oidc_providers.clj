(ns metabase-enterprise.sso.api.oidc-providers
  "Admin-only CRUD endpoints for managing OIDC providers at `/api/ee/sso/oidc-providers`."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Schema --------------------------------------------------

(def ^:private oidc-provider-create-schema
  [:map
   [:name :string]
   [:display-name :string]
   [:issuer-uri :string]
   [:client-id :string]
   [:client-secret :string]
   [:scopes {:optional true} [:sequential :string]]
   [:enabled {:optional true} :boolean]
   [:auto-provision {:optional true} :boolean]
   [:attribute-map {:optional true} [:map-of :string :string]]
   [:group-sync {:optional true} [:map
                                  [:enabled {:optional true} :boolean]
                                  [:group-attribute {:optional true} :string]
                                  [:group-mappings {:optional true} [:map-of :string [:sequential :int]]]]]
   [:icon-url {:optional true} [:maybe :string]]
   [:button-color {:optional true} [:maybe :string]]
   [:display-order {:optional true} :int]])

(def ^:private oidc-provider-update-schema
  [:map
   [:display-name {:optional true} :string]
   [:issuer-uri {:optional true} :string]
   [:client-id {:optional true} :string]
   [:client-secret {:optional true} :string]
   [:scopes {:optional true} [:sequential :string]]
   [:enabled {:optional true} :boolean]
   [:auto-provision {:optional true} :boolean]
   [:attribute-map {:optional true} [:map-of :string :string]]
   [:group-sync {:optional true} [:map
                                  [:enabled {:optional true} :boolean]
                                  [:group-attribute {:optional true} :string]
                                  [:group-mappings {:optional true} [:map-of :string [:sequential :int]]]]]
   [:icon-url {:optional true} [:maybe :string]]
   [:button-color {:optional true} [:maybe :string]]
   [:display-order {:optional true} :int]])

;;; -------------------------------------------------- Helpers --------------------------------------------------

(def ^:private secret-mask "**********")

(defn- sanitize-provider
  "Remove sensitive fields from a provider for API responses."
  [provider]
  (cond-> provider
    (:client-secret provider) (assoc :client-secret secret-mask)))

(defn- valid-slug?
  "Check that a slug is URL-safe."
  [slug]
  (and (string? slug)
       (not (str/blank? slug))
       (re-matches #"^[a-z0-9][a-z0-9\-]*$" slug)))

;;; -------------------------------------------------- Endpoints --------------------------------------------------

;; GET /api/ee/sso/oidc-providers
(api.macros/defendpoint :get "/"
  "List all OIDC providers (with client secrets masked)."
  []
  :- [:sequential [:map-of :keyword :any]]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (mapv sanitize-provider (sso-settings/sso-oidc-providers)))

;; GET /api/ee/sso/oidc-providers/:slug
(api.macros/defendpoint :get "/:slug"
  "Get a single OIDC provider by slug (with client secret masked)."
  [{:keys [slug]} :- [:map [:slug :string]]]
  :- [:map-of :keyword :any]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [provider (sso-settings/get-oidc-provider slug)]
    (api/check-404 provider)
    (sanitize-provider provider)))

;; POST /api/ee/sso/oidc-providers
(api.macros/defendpoint :post "/"
  "Create a new OIDC provider."
  [_route-params
   _query-params
   body :- oidc-provider-create-schema]
  :- [:map-of :keyword :any]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [slug (:name body)]
    (when-not (valid-slug? slug)
      (throw (ex-info (tru "Provider name must be a URL-safe slug (lowercase letters, numbers, hyphens, must start with letter or number)")
                      {:status-code 400})))
    (when (sso-settings/get-oidc-provider slug)
      (throw (ex-info (tru "An OIDC provider with name ''{0}'' already exists" slug)
                      {:status-code 409})))
    (let [providers (sso-settings/sso-oidc-providers)
          new-provider (merge {:enabled false
                               :scopes ["openid" "email" "profile"]}
                              body)]
      (sso-settings/sso-oidc-providers! (conj (vec providers) new-provider))
      (sanitize-provider new-provider))))

;; PUT /api/ee/sso/oidc-providers/:slug
(api.macros/defendpoint :put "/:slug"
  "Update an existing OIDC provider."
  [{:keys [slug]} :- [:map [:slug :string]]
   _query-params
   body :- oidc-provider-update-schema]
  :- [:map-of :keyword :any]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [providers (sso-settings/sso-oidc-providers)
        idx       (some (fn [[i p]] (when (= (:name p) slug) i))
                        (map-indexed vector providers))]
    (api/check-404 idx)
    (let [existing  (nth providers idx)
          ;; If client-secret is the mask or not provided, keep the existing one
          body      (if (or (not (:client-secret body))
                            (= (:client-secret body) secret-mask))
                      (dissoc body :client-secret)
                      body)
          updated   (merge existing body)
          providers (assoc (vec providers) idx updated)]
      (sso-settings/sso-oidc-providers! providers)
      (sanitize-provider updated))))

;; DELETE /api/ee/sso/oidc-providers/:slug
(api.macros/defendpoint :delete "/:slug"
  "Delete an OIDC provider."
  [{:keys [slug]} :- [:map [:slug :string]]]
  (api/check-superuser)
  (premium-features/assert-has-feature :sso-oidc (tru "OIDC authentication"))
  (let [providers (sso-settings/sso-oidc-providers)
        filtered  (vec (remove #(= (:name %) slug) providers))]
    (when (= (count providers) (count filtered))
      (api/check-404 nil))
    (sso-settings/sso-oidc-providers! filtered)
    api/generic-204-no-content))
