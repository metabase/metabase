(ns metabase.embedding.models.sdk-react-18-host
  "Model for the host apps that use the React embedding SDK with React 18."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.embedding.db :as embedding.db]
   [metabase.embedding.schema :as embedding.schema]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/EmbeddingSdkReact18Host [_model] :embedding_sdk_react_18_host)

(doto :model/EmbeddingSdkReact18Host
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser)
  (derive :hook/created-at-timestamped?))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn save-sdk-react-18-host!
  "Insert the EmbeddingSdkReact18Host `host` seen at `seen-at`, or move its `last_seen_at` forward to `seen-at`."
  [host    :- ::embedding.schema/sdk-react-18-host.host
   seen-at :- ms/TemporalInstant]
  (embedding.db/save-sdk-react-18-host! host seen-at))

(mu/defn delete-sdk-react-18-hosts-last-seen-before!
  "Delete the EmbeddingSdkReact18Hosts last seen before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (embedding.db/delete-sdk-react-18-hosts-last-seen-before! cutoff))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/EmbeddingSdkReact18Host [_model]
  {:skip? true})
