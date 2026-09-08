(ns metabase-enterprise.advanced-config.db
  "Application database queries for the advanced-config module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.api-keys.core :as api-keys]
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private UserRow
  "A whole-entity `core_user` row for insert/update."
  [:map {:closed true}
   [:id {:optional true} :any]
   [:email {:optional true} :any]
   [:first_name {:optional true} :any]
   [:last_name {:optional true} :any]
   [:password {:optional true} :any]
   [:password_salt {:optional true} :any]
   [:date_joined {:optional true} :any]
   [:last_login {:optional true} :any]
   [:is_superuser {:optional true} :any]
   [:is_active {:optional true} :any]
   [:reset_token {:optional true} :any]
   [:reset_triggered {:optional true} :any]
   [:is_qbnewb {:optional true} :any]
   [:login_attributes {:optional true} :any]
   [:updated_at {:optional true} :any]
   [:sso_source {:optional true} :any]
   [:locale {:optional true} :any]
   [:is_datasetnewb {:optional true} :any]
   [:settings {:optional true} :any]
   [:type {:optional true} :any]
   [:entity_id {:optional true} :any]
   [:deactivated_at {:optional true} :any]
   [:tenant_id {:optional true} :any]
   [:jwt_attributes {:optional true} :any]
   [:deactivated_with_tenant {:optional true} :any]])

(def ^:private DatabaseRow
  "A whole-entity `metabase_database` row for insert/update."
  [:map {:closed true}
   [:id {:optional true} :any]
   [:created_at {:optional true} :any]
   [:updated_at {:optional true} :any]
   [:name {:optional true} :any]
   [:description {:optional true} :any]
   [:details {:optional true} :any]
   [:engine {:optional true} :any]
   [:is_sample {:optional true} :any]
   [:is_full_sync {:optional true} :any]
   [:points_of_interest {:optional true} :any]
   [:caveats {:optional true} :any]
   [:metadata_sync_schedule {:optional true} :any]
   [:cache_field_values_schedule {:optional true} :any]
   [:timezone {:optional true} :any]
   [:is_on_demand {:optional true} :any]
   [:auto_run_queries {:optional true} :any]
   [:refingerprint {:optional true} :any]
   [:cache_ttl {:optional true} :any]
   [:initial_sync_status {:optional true} :any]
   [:creator_id {:optional true} :any]
   [:settings {:optional true} :any]
   [:dbms_version {:optional true} :any]
   [:is_audit {:optional true} :any]
   [:uploads_enabled {:optional true} :any]
   [:uploads_schema_name {:optional true} :any]
   [:uploads_table_prefix {:optional true} :any]
   [:is_attached_dwh {:optional true} :any]
   [:router_database_id {:optional true} :any]
   [:provider_name {:optional true} :any]
   [:write_data_details {:optional true} :any]
   [:admin_details {:optional true} :any]
   [:is_stub {:optional true} :any]])

(mu/defn query-executions-in-month :- [:sequential :map]
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

(mu/defn api-key-by-name :- [:maybe (ms/InstanceOf :model/ApiKey)]
  "The ApiKey named `api-key-name`, or nil."
  [api-key-name :- :string]
  (t2/select-one :model/ApiKey :name api-key-name))

(mu/defn api-key-prefix-exists? :- :boolean
  "Whether an ApiKey with `prefix` exists."
  [prefix :- :string]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(mu/defn insert-api-key! :- (ms/InstanceOf :model/ApiKey)
  "Insert `api-key` and return the new instance. `::api-keys/unhashed-key` has a special meaning to the ApiKey
  model's before-insert hook: it is hashed into `:key` and used to derive `:key_prefix`."
  [api-key :- [:map {:closed true}
               [:id {:optional true} :any]
               [:user_id {:optional true} :any]
               [:key {:optional true} :any]
               [:key_prefix {:optional true} :any]
               [:creator_id {:optional true} :any]
               [:created_at {:optional true} :any]
               [:updated_at {:optional true} :any]
               [:name {:optional true} :any]
               [:updated_by_id {:optional true} :any]
               [:scope {:optional true} :any]
               [::api-keys/unhashed-key {:optional true} :any]]]
  (t2/insert-returning-instance! :model/ApiKey api-key))

(mu/defn user-by-email :- [:maybe (ms/InstanceOf :model/User)]
  "The User with `email`, or nil."
  [email :- :string]
  (t2/select-one :model/User :email email))

(mu/defn user-columns-by-email :- [:maybe (ms/InstanceOf :model/User)]
  "The `columns` of the User with `email`, or nil."
  [columns :- [:seqable :keyword]
   email :- :string]
  (t2/select-one (into [:model/User] columns) :email email))

(mu/defn insert-user! :- (ms/InstanceOf :model/User)
  "Insert `user` and return the new instance."
  [user :- UserRow]
  (t2/insert-returning-instance! :model/User user))

(mu/defn update-user! :- :int
  "Apply `changes` to the User with `user-id`."
  [user-id :- ms/PositiveInt
   changes :- UserRow]
  (t2/update! :model/User user-id changes))

(mu/defn sample-database-exists? :- :boolean
  "Whether the sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(mu/defn database-id-by-engine-and-name :- [:maybe ms/PositiveInt]
  "The ID of the Database of `engine` named `database-name`, or nil."
  [engine :- :string
   database-name :- :string]
  (t2/select-one-pk :model/Database :engine engine :name database-name))

(mu/defn insert-database! :- (ms/InstanceOf :model/Database)
  "Insert `database` and return the new instance."
  [database :- DatabaseRow]
  (t2/insert-returning-instance! :model/Database database))

(mu/defn update-database! :- :int
  "Apply `changes` to the Database with `database-id`."
  [database-id :- ms/PositiveInt
   changes :- DatabaseRow]
  (t2/update! :model/Database database-id changes))

(mu/defn delete-database! :- :int
  "Delete the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/delete! :model/Database database-id))
