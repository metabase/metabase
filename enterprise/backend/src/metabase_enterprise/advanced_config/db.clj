(ns metabase-enterprise.advanced-config.db
  "Application database queries for the advanced-config module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn query-executions-in-month
  "The raw query execution rows started in `month` of `year`, newest first."
  [year :- ms/PositiveInt
   month :- ms/PositiveInt]
  (let [date-part (fn [part-key part-value]
                    (if (= (mdb/db-type) :postgres)
                      [:= [:date_part (name part-key) :started_at] part-value]
                      [:= [part-key :started_at] part-value]))]
    (t2/select (t2/table-name :model/QueryExecution)
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

(mu/defn user-by-email
  "The User with `email`, or nil."
  [email :- :string]
  (t2/select-one :model/User :email email))

(mu/defn user-columns-by-email
  "The `columns` of the User with `email`, or nil."
  [columns :- [:sequential :keyword]
   email :- :string]
  (t2/select-one (into [:model/User] columns) :email email))

(mu/defn sample-database-exists?
  "Whether the sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(mu/defn database-by-name
  "The `:id` and `:is_stub` of the Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one [:model/Database :id :is_stub] :name database-name))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))
