(ns metabase.api-keys.auth-provider
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.api-keys.models.api-key :as api-key]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.initialization-status.core :as init-status]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.schema :as request.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.password :as u.password]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(defn- matching-api-key? [{:keys [api-key] :as _user-data} passed-api-key]
  ;; if we get an API key, check the hash against the passed value. If not, don't reveal info via a timing attack - do
  ;; a useless hash, *then* return `false`.
  (if api-key
    (u.password/verify-password passed-api-key "" api-key)
    (u.password/do-useless-hash)))

;; See above: because this query runs on every single API request (with an API Key) it's worth it to optimize it a bit
;; and only compile it to SQL once rather than every time
(def ^:private ^{:arglists '([enable-advanced-permissions?])} user-data-for-api-key-prefix-query
  (memoize
   (fn [enable-advanced-permissions?]
     (first
      (t2.pipeline/compile*
       (cond-> {:select    [[:api_key.user_id :metabase-user-id]
                            [:api_key.key :api-key]
                            [:user.is_superuser :is-superuser?]
                            [:user.locale :user-locale]]
                :from      :api_key
                :left-join [[:core_user :user] [:= :api_key.user_id :user.id]]
                :where     [:and
                            [:= :user.is_active true]
                            [:= :api_key.key_prefix [:raw "?"]]]
                :limit     [:inline 1]}
         enable-advanced-permissions?
         (->
          (sql.helpers/select
           [:pgm.is_group_manager :is-group-manager?])
          (sql.helpers/left-join
           [:permissions_group_membership :pgm] [:and
                                                 [:= :pgm.user_id :user.id]
                                                 [:is :pgm.is_group_manager true]]))))))))

(mu/defn- current-user-info-for-api-key :- [:maybe ::request.schema/current-user-info]
  "Return User ID and superuser status for an API Key with `api-key-id"
  [api-key :- [:maybe :string]]
  (when (and api-key
             (init-status/complete?))
    ;; make sure the API key is valid before we entertain the idea of allowing it.
    (if-let [error (some-> (mr/explain ::api-keys.schema/key.raw api-key)
                           me/humanize
                           pr-str)]
      (do
        ;; 99% sure the error message is not going to include the API key but just to be extra super safe let's not log
        ;; it if the error message includes the key itself.
        (if (str/includes? error api-key)
          (log/debug "Ignoring invalid API Key")
          (log/debugf "Ignoring invalid API Key: %s" error))
        nil)
      (let [user-info (-> (t2/query-one (cons (user-data-for-api-key-prefix-query
                                               (premium-features/enable-advanced-permissions?))
                                              [(api-key/prefix api-key)]))
                          (m/update-existing :is-group-manager? boolean))]
        (when (matching-api-key? user-info api-key)
          (-> user-info
              (dissoc :api-key)))))))

(methodical/defmethod auth-identity/authenticate :provider/api-key
  "Authenticate a user with an API key"
  [_provider {:strs [x-api-key]}]
  (when-let [{:keys [metabase-user-id] :as user-info} (current-user-info-for-api-key x-api-key)]
    {:success? true
     :user-id metabase-user-id
     :user-data user-info}))
