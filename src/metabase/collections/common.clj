(ns metabase.collections.common
  ;; TODO (Cam 8/14/25) -- this stuff needs to be exported via a `metabase.collections.core` namespace, not exposed
  ;; directly.
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- write-check-collection-or-root-collection
  "Check that you're allowed to write Collection with `collection-id`; if `collection-id` is `nil`, check that you have
  Root Collection perms."
  [collection-id collection-namespace]
  (when (collection/is-trash? collection-id)
    (throw (ex-info (tru "You cannot modify the Trash Collection.")
                    {:status-code 400})))
  (api/write-check (if collection-id
                     (t2/select-one :model/Collection :id collection-id)
                     (cond-> collection/root-collection
                       collection-namespace (assoc :namespace collection-namespace)))))


;; TODO (Cam 8/14/25) -- all of this stuff other than perms checking should just happen as part of the Toucan 2
;; `before-insert` method for `:model/Collection`.
;;
;; TODO (Cam 8/14/25) -- weird/wrong to export a function that does perms checks like this in an internal API namespace,
;; it makes it REPL-unfriendly and basically unusable anywhere except in an API context
;;
;; TODO (Cam 8/14/25) -- weird to propagate `snake_case` keys outside of API endpoints or code that directly touches
;; the app DB.
(defn create-collection!
  "Create a new collection."
  [{:keys [name description parent_id namespace authority_level] :as params}]
  ;; To create a new collection, you need write perms for the location you are going to be putting it in...
  (write-check-collection-or-root-collection parent_id namespace)
  (when (some? authority_level)
    ;; make sure only admin and an EE token is present to be able to create an Official token
    (premium-features/assert-has-feature :official-collections (tru "Official Collections"))
    (api/check-superuser))
  ;; Get namespace from parent collection if not provided
  (let [parent-collection (when parent_id
                            (t2/select-one [:model/Collection :location :id :namespace] :id parent_id))
        effective-namespace (cond
                              (contains? params :namespace) namespace
                              parent-collection (:namespace parent-collection)
                              :else nil)]
  ;; Now create the new Collection :)
    (u/prog1 (t2/insert-returning-instance!
              :model/Collection
              (merge
               {:name            name
                :description     description
                :authority_level authority_level
                :namespace       effective-namespace}
               (when parent-collection
                 {:location (collection/children-location parent-collection)})))
      (events/publish-event! :event/collection-touch {:collection-id (:id <>) :user-id api/*current-user-id*}))))
