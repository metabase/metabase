(ns metabase.api.api-key
  "/api/api-key endpoints for CRUD management of API Keys"
  (:require
   [compojure.core :refer [POST GET PUT]]
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
        email   (format "api-key-user-%s@api-key.invalid" (u/slugify name))]
    (t2/with-transaction [_conn]
      (let [user (user/insert-new-user! {:email      email
                                         :first_name name
                                         :type       :api-key})]
        (user/set-permissions-groups! user [(perms-group/all-users) group_id])
        (-> (t2/insert-returning-instance! :model/ApiKey
                                           {:user_id      (u/the-id user)
                                            :name         name
                                            :unhashed_key api-key
                                            :created_by   api/*current-user-id*})
            (t2/hydrate :group_name)
            (select-keys [:created_at :updated_at :id :group_name])
            (assoc :name name
                   :unmasked_key api-key
                   :masked_key (api-key/mask api-key)))))))

(api/defendpoint GET "/count"
  "Get the count of API keys in the DB"
  [:as _body]
  (api/check-superuser)
  (t2/count :model/ApiKey))

(api/defendpoint PUT "/:id"
  "Update an API key by changing either its group or its name"
  [id :as {{:keys [group_id name] :as _body} :body}]
  {id       ms/PositiveInt
   group_id [:maybe ms/PositiveInt]
   name     [:maybe ms/NonBlankString]}
  (api/check-superuser)
  (let [api-key-before (t2/select-one :model/ApiKey :id id)]
    (when name
      (t2/with-transaction [_conn]
        ;; A bit of a pain to keep these in sync, but oh well.
        (t2/update! :model/User (:user_id api-key-before) {:first_name name})
        (t2/update! :model/ApiKey id {:name name})))
    (when group_id
      (let [user (-> api-key-before (t2/hydrate :user) :user)]
        (user/set-permissions-groups! user [(perms-group/all-users) {:id group_id}])))
    (-> (t2/select-one :model/ApiKey :id id)
        (t2/hydrate :group_name)
        (select-keys [:created_at :updated_at :id :name :masked_key :group_name]))))

(api/defendpoint PUT "/:id/regenerate"
  "Regenerate an API Key"
  [id]
  {id ms/PositiveInt}
  (api/check-superuser)
  (let [unhashed-key (key-with-unique-prefix)
        [id] (t2/update-returning-pks! :model/ApiKey :id id {:unhashed_key unhashed-key})]
    (-> (t2/select-one :model/ApiKey id)
        (t2/hydrate :group_name)
        (select-keys [:created_at :updated_at :id :name :group_name])
        (assoc :unmasked_key unhashed-key
               :masked_key (api-key/mask unhashed-key)))))

(api/defendpoint GET "/"
  "Get a list of API keys. Non-paginated."
  []
  (api/check-superuser)
  (let [api-keys (t2/hydrate (t2/select :model/ApiKey) :group_name)]
    (map #(select-keys % [:created_at :updated_at :id :name :group_name]) api-keys)))

(api/define-routes)
