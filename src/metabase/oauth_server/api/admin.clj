(ns metabase.oauth-server.api.admin
  "Admin-only endpoints for viewing OAuth authorization decisions."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.current :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- present-authorization
  [row]
  (select-keys row [:id :client_id :user_id :scope :decision :decided_at :created_at
                    :client_name :client_uri :user_email :user_first_name :user_last_name]))

(defn- authorization-where-clause
  [client-id decision]
  (let [clauses (cond-> [[:!= :a.decision "pending"]]
                  client-id (conj [:= :a.client_id client-id])
                  decision  (conj [:= :a.decision decision]))]
    (into [:and] clauses)))

(api.macros/defendpoint :get "/authorizations"
  :- [:map
      [:total  ms/IntGreaterThanOrEqualToZero]
      [:limit  ms/PositiveInt]
      [:offset ms/IntGreaterThanOrEqualToZero]
      [:data   [:sequential :map]]]
  "List OAuth authorization decisions (authorized or denied), newest first.
   Joins client and user info. Superuser only."
  [_route-params
   {:keys [client-id decision]} :- [:map
                                    [:client-id {:optional true} [:maybe ms/NonBlankString]]
                                    [:decision  {:optional true} [:maybe [:enum "authorized" "denied"]]]]]
  (api/check-superuser)
  (let [limit   (or (request/limit) 50)
        offset  (or (request/offset) 0)
        where   (authorization-where-clause client-id decision)
        total   (:count (first (t2/query {:select [[[:count :*] :count]]
                                          :from   [[:oauth_authorization_code :a]]
                                          :where  where})))
        rows    (t2/query {:select   [:a.id :a.client_id :a.user_id :a.scope
                                      :a.decision :a.decided_at :a.created_at
                                      [:c.client_name :client_name]
                                      [:c.client_uri :client_uri]
                                      [:u.email :user_email]
                                      [:u.first_name :user_first_name]
                                      [:u.last_name :user_last_name]]
                           :from     [[:oauth_authorization_code :a]]
                           :join     [[:oauth_client :c] [:= :a.client_id :c.client_id]
                                      [:core_user :u] [:= :a.user_id :u.id]]
                           :where    where
                           :order-by [[:a.decided_at :desc] [:a.id :desc]]
                           :limit    limit
                           :offset   offset})]
    {:total  (or total 0)
     :limit  limit
     :offset offset
     :data   (mapv present-authorization rows)}))
