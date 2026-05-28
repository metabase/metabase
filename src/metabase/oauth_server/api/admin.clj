(ns metabase.oauth-server.api.admin
  "Admin-only endpoints for viewing OAuth client registrations and access tokens."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.current :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- present-client
  [client]
  (select-keys client [:id :client_id :client_name :client_uri :application_type
                       :registration_type :scopes :redirect_uris :created_at :updated_at
                       :active_access_token_count]))

(defn- hydrate-active-token-counts
  [clients]
  (when (seq clients)
    (let [client-ids (map :client_id clients)
          now-ms     (System/currentTimeMillis)
          counts     (into {}
                           (map (juxt :client_id :count))
                           (t2/query {:select   [[:client_id :client_id]
                                                 [[:count :*] :count]]
                                      :from     [[:oauth_access_token :t]]
                                      :where    [:and
                                                 [:in :t.client_id client-ids]
                                                 [:= :t.revoked_at nil]
                                                 [:> :t.expiry now-ms]]
                                      :group-by [:t.client_id]}))]
      (mapv #(assoc % :active_access_token_count (get counts (:client_id %) 0))
            clients))))

(api.macros/defendpoint :get "/clients"
  :- [:map
      [:total  ms/IntGreaterThanOrEqualToZero]
      [:limit  ms/PositiveInt]
      [:offset ms/IntGreaterThanOrEqualToZero]
      [:data   [:sequential :map]]]
  "List all registered OAuth clients, newest first. Includes count of active (non-revoked, non-expired)
   access tokens per client. Superuser only."
  []
  (api/check-superuser)
  (let [limit   (or (request/limit) 50)
        offset  (or (request/offset) 0)
        total   (t2/count :model/OAuthClient)
        clients (->> (t2/select :model/OAuthClient {:order-by [[:created_at :desc] [:id :desc]]
                                                    :limit    limit
                                                    :offset   offset})
                     hydrate-active-token-counts
                     (mapv present-client))]
    {:total  total
     :limit  limit
     :offset offset
     :data   clients}))

(defn- present-token
  [token]
  (select-keys token [:id :client_id :user_id :scope :expiry :revoked_at :created_at
                      :client_name :user_email :user_first_name :user_last_name]))

(defn- token-where-clause
  [client-id status]
  (let [now-ms  (System/currentTimeMillis)
        clauses (cond-> []
                  client-id            (conj [:= :t.client_id client-id])
                  (= status "revoked") (conj [:!= :t.revoked_at nil])
                  (= status "expired") (conj [:= :t.revoked_at nil] [:<= :t.expiry now-ms])
                  (= status "active")  (conj [:= :t.revoked_at nil] [:> :t.expiry now-ms]))]
    (when (seq clauses)
      (into [:and] clauses))))

(api.macros/defendpoint :get "/access-tokens"
  :- [:map
      [:total  ms/IntGreaterThanOrEqualToZero]
      [:limit  ms/PositiveInt]
      [:offset ms/IntGreaterThanOrEqualToZero]
      [:data   [:sequential :map]]]
  "List OAuth access tokens with client and user info, newest first. Superuser only."
  [_route-params
   {:keys [client-id status]} :- [:map
                                  [:client-id {:optional true} [:maybe ms/NonBlankString]]
                                  [:status    {:optional true
                                               :default  "active"}
                                   [:enum "active" "revoked" "expired"]]]]
  (api/check-superuser)
  (let [limit   (or (request/limit) 50)
        offset  (or (request/offset) 0)
        where   (token-where-clause client-id status)
        total   (t2/count :model/OAuthAccessToken {:where where})
        tokens  (t2/query {:select   [:t.id :t.client_id :t.user_id :t.scope :t.expiry
                                      :t.revoked_at :t.created_at
                                      [:c.client_name :client_name]
                                      [:u.email :user_email]
                                      [:u.first_name :user_first_name]
                                      [:u.last_name :user_last_name]]
                           :from     [[:oauth_access_token :t]]
                           :join     [[:oauth_client :c] [:= :t.client_id :c.client_id]
                                      [:core_user :u] [:= :t.user_id :u.id]]
                           :where    where
                           :order-by [[:t.created_at :desc] [:t.id :desc]]
                           :limit    limit
                           :offset   offset})]
    {:total  (or total 0)
     :limit  limit
     :offset offset
     :data   (mapv present-token tokens)}))
