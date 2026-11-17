(ns metabase-enterprise.tenants.models
  (:require
   [clojure.string :as str]
   [metabase-enterprise.tenants.db :as tenants.db]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit-app]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(t2/deftransforms :model/Tenant
  {:attributes mi/transform-json-no-keywordization})

(doto :model/Tenant
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

(defmethod audit-app/model-details :model/Tenant
  [entity _event-type]
  (select-keys entity [:name :slug :is_active :attributes]))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(def Slug
  "The malli schema for a tenant's slug"
  [:re #"^[-_a-z0-9]{1,255}$"])

(def ^:private StrictAttributes
  [:map-of
   [:and
    (mu/with-api-error-message
     ms/KeywordOrString
     (deferred-tru "attribute keys must be a keyword or string"))
    (mu/with-api-error-message
     [:fn (fn [k] (re-matches #"^(?!@).*" (name k)))]
     (deferred-tru "attribute keys must not start with `@`"))]
   :any])

(def Attributes
  "Attributes attached to a tenant that will be passed down to users in the tenant.

  [[StrictAttributes]] can't be the request schema directly: request decoding drops `:map-of` entries that don't
  match their schema, so an `@`-prefixed key would be quietly discarded and the tenant saved without it. Decoding
  therefore sees a permissive `:map-of` that keeps every entry, and the `:fn` re-checks the strict shape afterwards,
  so an `@`-prefixed key is a 400."
  [:and
   (ms/string-keyed-map [:ref ::lib.schema.parameter/parameter.value])
   (mu/with-api-error-message
    [:fn #(mr/validate StrictAttributes %)]
    (deferred-tru "attribute keys must be a keyword or string and must not start with `@`"))])

(defn- check-slug
  "Throws a 400 unless `slug` is lower-case letters, digits, `-` and `_`."
  [slug]
  (when-not (mr/validate Slug slug)
    (throw (ex-info (tru "invalid slug") {:status-code 400}))))

(defn- check-name
  "Throws a 400 when `tenant-name` is blank."
  [tenant-name]
  (when (str/blank? tenant-name)
    (throw (ex-info (tru "A tenant needs a name.") {:status-code 400}))))

(defn- check-attributes
  "Throws a 400 when a key of `attributes` starts with `@`, which marks the attributes Metabase sets itself."
  [attributes]
  (when (some #(str/starts-with? (name %) "@") (keys attributes))
    (throw (ex-info (tru "attribute keys must not start with `@`") {:status-code 400}))))

(defn- check-new-name-and-slug
  "Throws a 400 when `tenant`, a row an INSERT writes, has the name or slug of an existing Tenant."
  [{tenant-name :name :keys [slug]}]
  (when (tenants.db/tenant-name-or-slug-exists? tenant-name slug)
    (throw (ex-info (tru "This tenant name or slug is already taken.") {:status-code 400}))))

(t2/define-before-insert :model/Tenant
  [{tenant-name :name :keys [slug attributes] :as tenant}]
  (check-name tenant-name)
  (check-slug slug)
  (check-attributes attributes)
  (check-new-name-and-slug tenant)
  (let [tenant-collection-id (tenants.db/insert-collection! {:type      collection/tenant-specific-root-collection-type
                                                             :name      (format "Tenant Collection: %s" (:name tenant))
                                                             :namespace :tenant-specific})]
    (assoc tenant :tenant_collection_id tenant-collection-id)))

(t2/define-before-update :model/Tenant
  [{:keys [id] :as tenant}]
  (let [changes (t2/changes tenant)]
    (when (contains? changes :slug)
      (throw (ex-info (tru "You cannot change the slug of a tenant.") {:status-code 400})))
    (when (contains? changes :tenant_collection_id)
      (throw (ex-info (tru "You cannot change the collection of a tenant.") {:status-code 400})))
    (when (contains? changes :name)
      (check-name (:name changes)))
    (when (contains? changes :attributes)
      (check-attributes (:attributes changes)))
    (when (and (contains? changes :name) (tenants.db/other-tenant-named? (:name changes) id))
      (throw (ex-info (tru "This name is already taken.") {:status-code 400})))
    (when (false? (:is_active changes))
      (tenants.db/deactivate-tenant-users! id)
      (collection/with-allow-modifying-tenant-root-collections
        (tenants.db/set-collection-archived! (:tenant_collection_id tenant) true)))
    (when (true? (:is_active changes))
      (tenants.db/reactivate-tenant-users! id)
      (collection/with-allow-modifying-tenant-root-collections
        (tenants.db/set-collection-archived! (:tenant_collection_id tenant) false)))
    tenant))

(mi/define-update-in-transaction :model/Tenant)

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn current-user-reads-tenants?
  "Whether the current user may read Tenants, which superusers and users outside any tenant may."
  []
  (boolean (or (mi/superuser?) (nil? (:tenant_id @api/*current-user*)))))

(methodical/defmethod t2/batched-hydrate [:model/Tenant :can_read]
  "Whether the current user can read each of `tenants`, per [[current-user-reads-tenants?]]."
  [_model k tenants]
  (let [readable? (current-user-reads-tenants?)]
    (for [tenant tenants]
      (when tenant
        (vary-meta tenant assoc k readable?)))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Tenant :member_count]
  [_model k tenants]
  (mi/instances-with-hydrated-data
   tenants k
   (fn []
     (->> (tenants.db/active-member-counts (map u/the-id tenants))
          (map (juxt :tenant_id :count))
          (into {})))
   :id
   {:default 0}))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defenterprise user->tenant-collection-and-descendant-ids
  "EE version of user->tenant-collection-and-descendant-ids. Returns a vector of the tenant collection ID and all
  descendant collection IDs for the user's tenant, or an empty vector if the user has no tenant."
  :feature :tenants
  [user-or-id]
  (into []
        (when-let [tenant-id (tenants.db/user-tenant-id (u/the-id user-or-id))]
          (when-let [tenant-collection-id (tenants.db/tenant-collection-id tenant-id)]
            (let [descendant-ids (tenants.db/descendant-collection-ids tenant-collection-id)]
              (conj descendant-ids tenant-collection-id))))))

(defenterprise maybe-localize-tenant-collection-names
  "EE implementation: localizes tenant root collection names."
  :feature :tenants
  [collections]
  (let [tenant-collection-ids (keep (fn [c]
                                      (when (= (:type c) collection/tenant-specific-root-collection-type)
                                        (:id c)))
                                    collections)
        collection-id->tenant-name-and-id
        (when (seq tenant-collection-ids)
          (tenants.db/tenant-names-and-ids-by-collection tenant-collection-ids))]
    (mapv (fn [{ttype :type id :id :as coll}]
            (cond-> coll
              (= ttype collection/tenant-specific-root-collection-type)
              (assoc :name (if-let [user-tenant-id (:tenant_id @api/*current-user*)]
                             (let [[_tenant-name tenant-id] (collection-id->tenant-name-and-id id)]
                               ;; this should never happen, but juuuuuust in case
                               (api/check-403 (= user-tenant-id tenant-id))
                               (tru "Our data"))
                             (let [[tenant-name _tenant-id] (collection-id->tenant-name-and-id id)]
                               (tru "Tenant collection: {0}" tenant-name))))))
          collections)))
