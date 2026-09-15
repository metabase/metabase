(ns metabase.transform-testing.api.transform-test-suite
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.interface :as mi]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/" :- [:sequential ::transform-testing.schema/transform-test-suite]
  "List the transform test suites, optionally only those of one transform."
  [_route-params
   {:keys [transform-id]} :- [:map {:closed true}
                              [:transform-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-analyst)
  (filter mi/can-read? (transform-testing.db/test-suites {:transform-id transform-id})))

(api.macros/defendpoint :get "/:id" :- ::transform-testing.schema/transform-test-suite
  "Get a transform test suite."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/read-check (transform-testing.db/test-suite id)))

(api.macros/defendpoint :post "/" :- ::transform-testing.schema/transform-test-suite
  "Create a transform test suite."
  [_route-params
   _query-params
   body :- ::transform-testing.schema/transform-test-suite.create]
  (api/write-check :model/Transform (:transform_id body))
  (transform-testing.db/insert-test-suite! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- ::transform-testing.schema/transform-test-suite
  "Update a transform test suite."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   body :- ::transform-testing.schema/transform-test-suite.update]
  (api/write-check (transform-testing.db/test-suite id))
  (when-let [transform-id (:transform_id body)]
    (api/write-check :model/Transform transform-id))
  (when (seq body)
    (transform-testing.db/update-test-suite! id body))
  (transform-testing.db/test-suite id))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a transform test suite."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check (transform-testing.db/test-suite id))
  (transform-testing.db/delete-test-suite! id)
  nil)

(api.macros/defendpoint :post "/:id/run" :- :nil
  "Run a transform test suite."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/read-check (transform-testing.db/test-suite id))
  nil)
