(ns metabase.presence.api
  "POC: 'currently viewing' presence indicator. The frontend POSTs to
  `/api/presence/ping` every few seconds while a user has a question or
  dashboard page open; the response is the list of *other* users currently
  viewing the same entity. Rows are short-lived and filtered by `expires_at`."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as app-db]
   [metabase.presence.models.user-presence]
   [metabase.presence.settings :as presence.settings]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)
   (java.time.temporal ChronoUnit)))

(comment metabase.presence.models.user-presence/keep-me)

(def ^:private Models
  [:enum "card" "dashboard"])

(defn- model->toucan
  [model]
  (case model
    "card"      :model/Card
    "dashboard" :model/Dashboard))

(defn- now ^OffsetDateTime []
  (OffsetDateTime/now))

(defn- ttl-from-now
  ^OffsetDateTime []
  (.plus (now) (long (presence.settings/presence-ttl-seconds)) ChronoUnit/SECONDS))

(defn- upsert-presence!
  "Insert or update the caller's presence row for the given entity."
  [user-id model model-id]
  (app-db/update-or-insert! :model/UserPresence
                            {:user_id  user-id
                             :model    model
                             :model_id model-id}
                            (fn [_existing]
                              {:last_seen_at (now)
                               :expires_at   (ttl-from-now)})))

(defn- live-viewer-ids
  "Return user ids (other than `current-user-id`) with non-expired presence rows
  for the given entity."
  [current-user-id model model-id]
  (t2/select-fn-set :user_id
                    :model/UserPresence
                    {:select [:user_id]
                     :from   [:user_presence]
                     :where  [:and
                              [:= :model model]
                              [:= :model_id model-id]
                              [:> :expires_at (now)]
                              [:not= :user_id current-user-id]]}))

(defn- hydrate-users
  [user-ids]
  (when (seq user-ids)
    (t2/select [:model/User :id :first_name :last_name :email]
               :id [:in user-ids]
               :is_active true)))

;; TODO (poc) please add a response schema to this API endpoint
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/ping"
  "Record that the current user is viewing the given entity. Returns the list
  of other users currently viewing it. Acts as both heartbeat (upsert) and
  fetch (read) in a single round-trip."
  [_route-params
   _query-params
   {:keys [model model_id]} :- [:map
                                [:model    Models]
                                [:model_id ms/PositiveInt]]]
  (if-not (presence.settings/presence-enabled)
    {:viewers []}
    (do
      (api/read-check (model->toucan model) model_id)
      (upsert-presence! api/*current-user-id* model model_id)
      {:viewers (or (some-> (live-viewer-ids api/*current-user-id* model model_id)
                            hydrate-users
                            vec)
                    [])})))

;; TODO (poc) please add a response schema to this API endpoint
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/leave"
  "Best-effort: clear the current user's presence row for the given entity on
  page navigation away. Safe to ignore failures."
  [_route-params
   _query-params
   {:keys [model model_id]} :- [:map
                                [:model    Models]
                                [:model_id ms/PositiveInt]]]
  (t2/delete! :model/UserPresence
              :user_id  api/*current-user-id*
              :model    model
              :model_id model_id)
  api/generic-204-no-content)
