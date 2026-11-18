(ns metabase.collections.create
  "Create-collection business logic, shared between the REST endpoint
  (`metabase.collections-rest.api`) and other callers like the agent API. Lives in the
  `collections` module so non-REST consumers can use it without crossing the
  module-linter's non-rest -> rest barrier."
  (:require
   [malli.util]
   [metabase.api.common :as api]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.schema :as collections.schema]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defn- write-check-authority-level
  "Check that a superuser is creating this collection if they are setting the authority level."
  [{authority-level :authority_level :as coll}]
  (when (some? authority-level)
    ;; make sure only admin and an EE token is present to be able to create an Official token
    (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
    (api/check-superuser))
  coll)

(def ^:private CreateCollectionArguments
  "The arguments to a create-collection call — what the public API surface accepts."
  [:map {:closed true}
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
      (malli.util/optional-keys [:location])
      (malli.util/closed-schema)))

(mu/defn apply-defaults-to-collection :- NewCollectionArguments
  "Converts `CreateCollectionArguments` into `NewCollectionArguments`, which locates the collection in its parent."
  [coll-data :- CreateCollectionArguments]
  (let [{:keys [parent_id]} coll-data]
    (-> coll-data
        (assoc :location (collection/children-location (collection/parent-or-root (:namespace coll-data) parent_id)))
        (select-keys (malli.util/keys NewCollectionArguments)))))

(mu/defn create-collection!
  "Creates a Collection after its create check and publishes its touch event."
  [coll-data :- CreateCollectionArguments]
  (api/create-check :model/Collection coll-data)
  (u/prog1 (collections.db/insert-collection!
            (->> (-> (apply-defaults-to-collection coll-data)
                     write-check-authority-level)
                 (lib/normalize ::collections.schema/collection.update)))
    (events/publish-event! :event/collection-touch {:collection-id (:id <>) :user-id api/*current-user-id*})))
