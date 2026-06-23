(ns metabase.collections.create
  "Create-collection business logic, shared between the REST endpoint
  (`metabase.collections-rest.api`) and other callers like the agent API. Lives in the
  `collections` module so non-REST consumers can use it without crossing the
  module-linter's non-rest -> rest barrier."
  (:require
   [malli.util]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- parent-or-root
  "From a create request return either the parent collection or the root collection."
  [{collection-id :parent_id collection-namespace :namespace}]
  (if collection-id
    (t2/select-one :model/Collection :id collection-id)
    (collection/root-collection-with-ui-details collection-namespace)))

(defn- write-check-authority-level
  "Check that a superuser is creating this collection if they are setting the authority level."
  [{authority-level :authority_level :as coll}]
  (when (some? authority-level)
    ;; make sure only admin and an EE token is present to be able to create an Official token
    (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
    (api/check-superuser))
  coll)

(defenterprise validate-new-tenant-collection!
  "OSS version. Throws API exceptions if the passed collection is an invalid tenant collection,
  which in OSS means 'any tenant collection.'"
  metabase-enterprise.tenants.core
  [collection]
  (when (collection/shared-tenant-collection? collection)
    (throw (ex-info "Cannot create tenant collection on OSS." {:status-code 400})))
  collection)

(def ^:private CreateCollectionArguments
  "The arguments to a create-collection call — what the public API surface accepts."
  [:map
   [:name            ms/NonBlankString]
   [:description     {:optional true} [:maybe ms/NonBlankString]]
   [:parent_id       {:optional true} [:maybe ms/PositiveInt]]
   [:namespace       {:optional true} [:maybe ms/NonBlankString]]
   [:authority_level {:optional true} [:maybe collection/AuthorityLevel]]])

(def ^:private NewCollectionArguments
  "What we use internally to actually create a collection — what `t2/insert!` needs."
  (-> CreateCollectionArguments
      (malli.util/dissoc :parent_id)
      (malli.util/assoc :location [:maybe ms/NonBlankString])
      (malli.util/assoc :namespace [:maybe [:or :keyword ms/NonBlankString]])
      (malli.util/assoc :is_remote_synced [:maybe :boolean])
      (malli.util/assoc :type [:enum "trash" "library" "library-data" "library-metrics"])
      (malli.util/optional-keys [:location :type])
      (malli.util/closed-schema)))

(mu/defn apply-defaults-to-collection :- NewCollectionArguments
  "Converts `CreateCollectionArguments` into `NewCollectionArguments` — i.e. translates what the API
  gets into what toucan needs to create a collection. Inherits `:namespace`, `:type` (only the
  library family — see `collection/library-collection-types`), and `:is_remote_synced` from the
  parent collection."
  [coll-data :- CreateCollectionArguments]
  (let [parent-coll (parent-or-root coll-data)]
    ;; `api/write-check` handles both branches - a real collection and the root sentinel
    ;; returned by `parent-or-root` when no parent_id is given.
    (api/write-check parent-coll)
    (-> (cond-> coll-data
          (and (:namespace parent-coll)
               (nil? (:namespace coll-data))) (assoc :namespace (:namespace parent-coll))
          parent-coll (assoc :location (collection/children-location parent-coll))
          ;; Only the library family of types propagates to children. Other special types
          ;; (e.g. "trash", "tenant-specific-root-collection") are root-only sentinels and must
          ;; NOT leak onto children — doing so fails the closed `NewCollectionArguments` schema and
          ;; would mis-tag the child (UXW-4520).
          (contains? collection/library-collection-types (:type parent-coll))
          (assoc :type (:type parent-coll)))
        (assoc :is_remote_synced (boolean (:is_remote_synced parent-coll)))
        (select-keys (malli.util/keys NewCollectionArguments)))))

(mu/defn create-collection!
  "Create a new collection. Applies parent-inheritance defaults, runs the authority-level
  superuser/feature check, runs the EE tenant-collection validation, and publishes both the
  create and touch events. The single source of truth for collection creation; REST and agent
  callers both go through here."
  [coll-data]
  (u/prog1 (t2/insert-returning-instance!
            :model/Collection
            (-> (apply-defaults-to-collection coll-data)
                write-check-authority-level
                validate-new-tenant-collection!))
    (events/publish-event! :event/collection-create {:object <> :user-id api/*current-user-id*})
    (events/publish-event! :event/collection-touch {:collection-id (:id <>) :user-id api/*current-user-id*})))
