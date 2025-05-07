(ns metabase-enterprise.tenants.model
  (:require
   [metabase.audit-app.core :as audit-app]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(defmethod audit-app/model-details :model/Tenant
  [entity _event-type]
  (select-keys entity [:name :slug :is_active]))

(t2/deftransforms :model/Tenant
  {:attributes mi/transform-json-no-keywordization})

(def Slug
  "The malli schema for a tenant's slug"
  [:re #"^[-_a-z0-9]{1,255}$"])

(t2/define-before-insert :model/Tenant
  [tenant]
  ;; The API layer is responsible for doing validation with nice error messages, here we just throw as a final layer
  ;; of defense.
  (u/prog1 tenant
    (mu/validate-throw Slug (:slug tenant))))

(defn tenant-exists?
  "Given a tenant name, returns truthy if the name (or its slugified version) is already reserved."
  [{n :name slug :slug}]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug slug]
                                     [:= :name n]]}))

(doto :model/Tenant
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/batched-hydrate [:model/Tenant :member_count]
  [_model k tenants]
  (mi/instances-with-hydrated-data
   tenants k
   (fn []
     (->> (t2/query {:select [[:tenant_id] [[:count :*] :count]]
                     :from [(t2/table-name :model/User)]
                     :where [:and
                             [:in :tenant_id (map u/the-id tenants)]
                             [:= :type "personal"]
                             :is_active]
                     :group-by [:tenant_id]})
          (map (juxt :tenant_id :count))
          (into {})))
   :id
   {:default 0}))

(def Attributes
  "Attributes attached to a tenant that will be passed down to users in the tenant."
  [:map-of
   [:and
    (mu/with-api-error-message
     ms/KeywordOrString
     (deferred-tru "attribute keys must be a keyword or string"))
    (mu/with-api-error-message
     [:fn (fn [k] (re-matches #"^(?!@).*" (name k)))]
     (deferred-tru "attribute keys must not start with `@`"))]
   :any])
