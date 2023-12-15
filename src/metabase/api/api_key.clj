(ns metabase.api.api-key
  "/api/api-key endpoints for CRUD management of API Keys"
  (:require
   [compojure.core :refer [POST GET]]
   [crypto.random :as crypto-random]
   [metabase.api.common :as api]
   [metabase.models.api-key :as api-key]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- key-with-unique-prefix []
  (u/auto-retry 5
   (let [api-key (api-key/generate-key)
         prefix (api-key/prefix api-key)]
     ;; we could make this more efficient by generating 5 API keys up front and doing one select to remove any
     ;; duplicates. But a duplicate should be rare enough to just do multiple queries for now.
     (if-not (t2/exists? :model/ApiKey :key_prefix prefix)
       api-key
       (throw (ex-info (tru "could not generate key with unique prefix") {}))))))

(api/defendpoint POST "/"
  "Create a new API key (and an associated `User`) with the provided name and group ID."
  [:as {{:keys [group_id name] :as _body} :body}]
  {group_id ms/PositiveInt
   name     ms/NonBlankString}
  (api/check-superuser)
  (api/checkp (not (t2/exists? :model/ApiKey :name name))
    "name" "An API key with this name already exists.")
  (let [api-key (key-with-unique-prefix)
        email   (format "api-key-user-%s@api-key.invalid" name)]
    (t2/with-transaction [_conn]
      (let [user (first (t2/insert-returning-instances! :model/User
                                                        {:email    email
                                                         :password (crypto-random/base64 16)
                                                         :type     :api-key}))]
        (user/set-permissions-groups! user [(perms-group/all-users) {:id group_id}])
        (-> (t2/insert-returning-instances! :model/ApiKey
                                            {:user_id      (u/the-id user)
                                             :name         name
                                             :unhashed_key api-key
                                             :created_by   api/*current-user-id*})
            (select-keys [:created_at :updated_at :id])
            (assoc :name name
                   :group_id group_id
                   :unmasked_key api-key
                   :masked_key (api-key/mask api-key)))))))

(api/defendpoint GET "/count"
  "Get the count of API keys in the DB"
  [:as _body]
  (api/check-superuser)
  (t2/count :model/ApiKey))

(api/define-routes)
