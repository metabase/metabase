(ns metabase.actions.models.http-action
  "The HttpAction model: the request templates of an action of type http."
  (:require
   [metabase.actions.db :as actions.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/HttpAction [_model] :http_action)

(derive :model/HttpAction :metabase/model)

(methodical/defmethod t2/primary-keys :model/HttpAction [_model] [:action_id])

(t2/deftransforms :model/HttpAction
  {:query_params mi/transform-json-no-keywordization
   :headers      mi/transform-json-no-keywordization
   :body         mi/transform-json-no-keywordization})

(defmethod serialization/spec :model/HttpAction [_]
  {:schema      ::actions.schema/external-http-action
   :identity    [:action_id]
   :primary-key :action_id
   :copy        [:method :url :query_params :headers :body]
   :parent      {:model :model/Action :key :action_id}
   :transform   {:action_id serialization/import-only-transform}})

(defmethod remote-sync/spec :model/HttpAction
  [_model]
  {:synced-filter-clause actions.db/synced-action-details-clause})
