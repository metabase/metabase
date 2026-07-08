(ns metabase.transforms-rest.api.transform-dag-run
  "`/api/transform-dag-run` routes: operations on a single manual DAG-reprocess run — listing its
  member transform runs and canceling it. Triggering and previewing a DAG run live on
  `/api/transform/:id/...` in [[metabase.transforms-rest.api.transform]]."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms-rest.api.util :as transforms-rest.api.u]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def dag-directions
  "The DAG traversal directions a reprocess run can take."
  [:upstream :downstream])

(api.macros/defendpoint :get "/:run-id/transform-runs" :- [:sequential transforms-rest.api.u/MemberTransformRunResponse]
  "Get the transform runs that made up a specific DAG run."
  [{:keys [run-id]} :- [:map [:run-id ms/PositiveInt]]]
  (api/check-data-analyst)
  (api/check-404 (t2/select-one :model/TransformDagRun :id run-id))
  (let [runs (transforms.core/transform-runs-for-dag-run run-id)]
    (->> (t2/hydrate runs [:transform :collection :transform_tag_ids])
         (map transforms-base.u/present-run))))

(api.macros/defendpoint :post "/:run-id/cancel" :- :nil
  "Cancel an in-progress manual DAG run and request cancellation of its still-running transforms."
  [{:keys [run-id]} :- [:map [:run-id ms/PositiveInt]]]
  (api/check-data-analyst)
  (api/check-404 (t2/select-one :model/TransformDagRun :id run-id))
  (api/check-400 (transforms.core/cancel-dag-run! run-id))
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-dag-run` routes."
  (api.macros/ns-handler *ns* +auth))
