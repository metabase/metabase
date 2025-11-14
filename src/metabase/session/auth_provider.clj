(ns metabase.session.auth-provider
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.schema :as request.schema]
   [metabase.session.core :as session]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             wrap-current-user-info                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Because this query runs on every single API request it's worth it to optimize it a bit and only compile it to SQL
;; once rather than every time
(def ^:private ^{:arglists '([db-type max-age-minutes session-type enable-advanced-permissions?])} session-with-id-query
  (memoize
   (fn [db-type max-age-minutes session-type enable-advanced-permissions?]
     (first
      (t2.pipeline/compile*
       (cond-> {:select    [[:session.user_id :metabase-user-id]
                            [:user.is_superuser :is-superuser?]
                            [:user.locale :user-locale]]
                :from      [[:core_session :session]]
                :left-join [[:core_user :user] [:= :session.user_id :user.id]]
                :where     [:and
                            [:= :user.is_active true]
                            [:or [:= :session.id [:raw "?"]] [:= :session.key_hashed [:raw "?"]]]
                            (let [oldest-allowed (case db-type
                                                   :postgres [:-
                                                              [:raw "current_timestamp"]
                                                              [:raw (format "INTERVAL '%d minute'" max-age-minutes)]]
                                                   :h2       [:dateadd
                                                              (h2x/literal "minute")
                                                              [:inline (- max-age-minutes)]
                                                              :%now]
                                                   :mysql    [:date_add
                                                              :%now
                                                              [:raw (format "INTERVAL -%d minute" max-age-minutes)]])]
                              [:> :session.created_at oldest-allowed])
                            [:= :session.anti_csrf_token (case session-type
                                                           :normal         nil
                                                           :full-app-embed [:raw "?"])]]
                :limit     [:inline 1]}
         enable-advanced-permissions?
         (->
          (sql.helpers/select
           [:pgm.is_group_manager :is-group-manager?])
          (sql.helpers/left-join
           [:permissions_group_membership :pgm] [:and
                                                 [:= :pgm.user_id :user.id]
                                                 [:is :pgm.is_group_manager true]]))))))))

(defn- valid-session-key?
  "Validates that the given session-key looks like it could be a session id. Returns a 403 if it does not.

  SECURITY NOTE: Because functions will directly compare the session-key against the core_session.id table for
  backwards-compatibility reasons, if this is NOT called before those queries against core_session.id, attackers with
  access to the database can impersonate users by passing the core_session.id as their session cookie"
  [session-key]
  (or (not session-key) (string/valid-uuid? session-key)))

(mu/defn- current-user-info-for-session :- [:maybe ::request.schema/current-user-info]
  "Return User ID and superuser status for Session with `session-key` if it is valid and not expired."
  [session-key anti-csrf-token]
  (when (and session-key (valid-session-key? session-key) (init-status/complete?))
    (let [sql    (session-with-id-query (mdb/db-type)
                                        (config/config-int :max-session-age)
                                        (if (seq anti-csrf-token) :full-app-embed :normal)
                                        (premium-features/enable-advanced-permissions?))
          params (concat [session-key (session/hash-session-key session-key)]
                         (when (seq anti-csrf-token)
                           [anti-csrf-token]))]
      (some-> (t2/query-one (cons sql params))
              ;; is-group-manager? could return `nil, convert it to boolean so it's guaranteed to be only true/false
              (update :is-group-manager? boolean)))))

(methodical/defmethod auth-identity/authenticate :provider/session
  "Authenticate a user with a session"
  [_provider {:keys [metabase-session-key anti-csrf-token]}]
  (when-let [{:keys [metabase-user-id] :as user-info} (current-user-info-for-session metabase-session-key anti-csrf-token)]
    {:success? true
     :user-id metabase-user-id
     :user-data user-info}))
