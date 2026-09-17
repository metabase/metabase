(ns metabase-enterprise.advanced-config.db
  "Application database queries for the advanced-config module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.db :as users.db]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn query-executions-in-month
  "The raw query execution rows started in `month` of `year`, newest first."
  [year :- ms/PositiveInt
   month :- ms/PositiveInt]
  (let [date-part (fn [part-key part-value]
                    (if (= (mdb/db-type) :postgres)
                      [:= [:date_part ^:allow-raw-sql [:inline (name part-key)] :started_at] part-value]
                      [:= [part-key :started_at] part-value]))]
    (t2/select :query_execution
               {:order-by [[:started_at :desc]]
                :where    [:and
                           (date-part :year year)
                           (date-part :month month)]})))

(mu/defn api-key-by-name
  "The ApiKey named `api-key-name`, or nil."
  [api-key-name :- :string]
  (t2/select-one :model/ApiKey :name api-key-name))

(mu/defn api-key-prefix-exists?
  "Whether an ApiKey with `prefix` exists."
  [prefix :- :string]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(mu/defn insert-api-key!
  "Insert `api-key` and return the new instance. `::api-keys/unhashed-key` has a special meaning to the ApiKey
  model's before-insert hook: it is hashed into `:key` and used to derive `:key_prefix`."
  [api-key :- ::api-keys.schema/api-key.create]
  (t2/insert-returning-instance! :model/ApiKey api-key))

(mu/defn user-by-email
  "The User with `email`, or nil."
  [email :- :string]
  (users.db/select-one-user {:email email}))

(mu/defn user-columns-by-email
  "The `columns` of the User with `email`, or nil."
  [columns :- [:sequential :keyword]
   email :- :string]
  (users.db/select-one-user {:email email :columns columns}))

(mu/defn insert-user!
  "Insert `user` and return the new instance."
  [user :- ::users.schema/user.create]
  (users.db/insert-user! user))

(mu/defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id :- ::lib.schema.id/user
   changes :- ::users.schema/user.update]
  (users.db/update-users! {:id user-id} changes))
