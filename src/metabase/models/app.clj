(ns metabase.models.app
  (:require [metabase.models.permissions :as perms]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel App :app)

;;; You can read/write an App if you can read/write its Collection
(derive App ::perms/use-parent-collection-perms)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class App)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:options :json
                              :nav_items :json})
          :properties (constantly {:timestamped? true
                                   :entity_id    true})})

  ;; Should not be needed as every app should have an entity_id, but currently it's
  ;; necessary to satisfy metabase-enterprise.models.entity-id-test/comprehensive-identity-hash-test.
  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:entity_id])})
