(ns metabase.oauth-server.api.admin
  "Admin-only endpoints for auditing OAuth dynamic client registration (DCR) events."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.current :as request]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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
        total  (:count (first (t2/query (cond-> {:select    [[[:count :*] :count]]
                                                 :from      [[:oauth_client_event :e]]
                                                 :left-join [[:oauth_client :c] [:= :e.oauth_client_id :c.id]]}
                                          where (assoc :where where)))))
        rows   (t2/query (cond-> {:select     [:e.id :e.oauth_client_id :e.user_id :e.event_type :e.created_at
                                               [:c.client_id :client_id]
                                               [:c.client_name :client_name]
                                               [:c.client_uri :client_uri]
                                               [:c.registration_type :registration_type]
                                               [:c.application_type :application_type]
                                               [:c.redirect_uris :redirect_uris]
                                               [:u.email :user_email]
                                               [:u.first_name :user_first_name]
                                               [:u.last_name :user_last_name]]
                                  :from       [[:oauth_client_event :e]]
                                  :left-join  [[:oauth_client :c] [:= :e.oauth_client_id :c.id]
                                               [:core_user :u]    [:= :e.user_id :u.id]]
                                  :order-by   [[:e.created_at :desc] [:e.id :desc]]
                                  :limit      limit
                                  :offset     offset}
                           where (assoc :where where)))]
    {:total  (or total 0)
     :limit  limit
     :offset offset
     :data   (mapv present-event rows)}))
