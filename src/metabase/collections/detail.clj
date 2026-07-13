(ns metabase.collections.detail
  "Read-time hydration for a single Collection, shared by the REST endpoints that return one (`GET /:id`, `GET
  /root`, `GET /trash`, and `PUT /:id`)."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn prep-collection-for-export
  "Given a collection, tweaks it to be ready for returning to the FE."
  [coll]
  (-> coll
      collection/personal-collection-with-ui-details
      collection/maybe-localize-tenant-collection-name
      collection/maybe-mark-collection-as-library-root))

(mu/defn get-collection
  "Add a standard set of details to `collection`, including things like `effective_location`. Works for either a
  normal Collection or the Root Collection.

  `collection` must already be fetched (and permission-checked, if applicable, by the caller) -- this only adds the
  read-time hydration every endpoint returning a Collection needs."
  [collection :- collection/CollectionWithLocationAndIDOrRoot]
  (-> collection
      prep-collection-for-export
      (t2/hydrate :parent_id
                  :effective_location
                  [:effective_ancestors :can_write]
                  :can_write
                  :is_personal
                  :can_restore
                  :can_delete)))
