(ns metabase.oauth-server.api.admin
  "Admin-only endpoints for auditing OAuth dynamic client registration (DCR) events."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.queries :as oauth-server.queries]
   [metabase.request.current :as request]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- present-event
  [row]
  ;; `redirect_uris` is stored as a JSON array but selected via raw SQL here, so the model's
  ;; JSON transform doesn't apply — decode it ourselves into a vector (nil for deleted clients).
  (-> row
      (select-keys [:id :oauth_client_id :client_id :event_type :created_at
                    :client_name :client_uri :registration_type :application_type :redirect_uris
                    :user_id :user_email :user_first_name :user_last_name])
      (update :redirect_uris #(some-> % json/decode))))

(defn- event-where-clause
  [client-id event-type]
  (let [clauses (cond-> []
                  client-id  (conj [:= :c.client_id client-id])
                  event-type (conj [:= :e.event_type event-type]))]
    (when (seq clauses)
      (into [:and] clauses))))

(api.macros/defendpoint :get "/authorizations"
  :- [:map
      [:total  ms/IntGreaterThanOrEqualToZero]
      [:limit  ms/PositiveInt]
      [:offset ms/IntGreaterThanOrEqualToZero]
      [:data   [:sequential :map]]]
  "List OAuth dynamic client registration events (registered, approved, or denied), newest first.
   Joins client info and, for decision events, the deciding user. Superuser only."
  [_route-params
   {:keys [client-id event-type]} :- [:map
                                      [:client-id  {:optional true} [:maybe ms/NonBlankString]]
                                      [:event-type {:optional true} [:maybe [:enum "registered" "approved" "denied"]]]]]
  (api/check-superuser)
  (let [limit  (or (request/limit) 50)
        offset (or (request/offset) 0)
        where  (event-where-clause client-id event-type)
        total  (:count (first (oauth-server.queries/client-event-count where)))
        rows   (oauth-server.queries/client-events where limit offset)]
    {:total  (or total 0)
     :limit  limit
     :offset offset
     :data   (mapv present-event rows)}))
