(ns metabase-enterprise.serialization.api.serialize
  "/api/ee/serialization/serialize endpoints"
  (:require
   [clojure.set :as set]
   [compojure.core :as compojure :refer [POST]]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.api.common :as api]
   [metabase.models.collection :refer [Collection]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint POST "/data-model"
  "This endpoint should serialize: the data model, settings.yaml, and all the selected Collections

  The data model should only change if the user triggers a manual sync or scan (since the scheduler is turned off)

  The user will need to add somewhere (probably in the admin panel):

  - A path (maybe we can assume it will always dump to the same path as the Metabase jar, but we probably want to let
    them define the path)

  - The collections that they want to serialize (using selective serialization)"
  [:as {{:keys [collection_ids path]} :body}]
  {collection_ids (mu/with-api-error-message
                    [:fn (fn [x] (and (sequential? x)
                                      (= (count x) (count (set x)))
                                      (every? pos? x)))]
                    (deferred-tru "Non-empty, distinct array of Collection IDs"))
   path           (mu/with-api-error-message
                    ms/NonBlankString
                    (deferred-tru "Valid directory to serialize results to"))}
  ;; Make sure all the specified collection IDs exist.
  (let [existing-collection-ids (t2/select-pks-set Collection :id [:in (set collection_ids)])]
    (when-not (= (set collection_ids) (set existing-collection-ids))
      (throw (ex-info (tru "Invalid Collection ID(s). These Collections do not exist: {0}"
                           (pr-str (set/difference (set collection_ids) (set existing-collection-ids))))
                      {:status-code 404}))))
  (serialization.cmd/v2-dump path {:collections collection_ids})
  ;; TODO -- not 100% sure this response makes sense. We can change it later with something more meaningful maybe
  {:status :ok})

(api/define-routes
  ;; for now let's say you have to be an admin to hit any of the serialization endpoints
  api/+check-superuser)
