(ns metabase.mock.schema-per-customer
  "A relational database that replicates a set of tables multiple times such that schema1.* and schema2.* have the
   same set of tables.  This is common in apps that provide an 'instance' per customer."
  (:require [metabase.driver :as driver]))


;; NOTE: we throw in a "common" schema which shares an FK across all other schemas just to get tricky
(def ^:const schema-per-customer-tables
  "Docstring"
  {nil      {"city"   {:name   "city"
                       :fields #{{:name         "id"
                                  :base-type    :IntegerField
                                  :pk?          true}
                                 {:name         "name"
                                  :base-type    :TextField
                                  :special-type :name}}}
             "venue"  {:name   "venue"
                       :fields #{{:name         "id"
                                  :base-type    :IntegerField
                                  :pk?          true}
                                 {:name         "name"
                                  :base-type    :TextField
                                  :special-type :name}
                                 {:name         "city_id"
                                  :base-type    :IntegerField}}}
             "review" {:name   "review"
                       :fields #{{:name         "id"
                                  :base-type    :IntegerField
                                  :pk?          true}
                                 {:name         "text"
                                  :base-type    :TextField
                                  :special-type :name}
                                 {:name         "venue_id"
                                  :base-type    :IntegerField}
                                 {:name         "reviewer_id"
                                  :base-type    :IntegerField}}}}
   "common" {"user"   {:name   "user"
                       :fields #{{:name         "id"
                                  :base-type    :IntegerField
                                  :pk?          true}
                                 {:name         "name"
                                  :base-type    :TextField}}}}})

(defrecord SchemaPerCustomerDriver []
  clojure.lang.Named
  (getName [_] "SchemaPerCustomerDriver"))

(extend SchemaPerCustomerDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table       (constantly nil)
          :describe-database   (fn [_ _]
                                 {:tables (conj (->> (for [schema ["s1" "s2" "s3"]]
                                                       (for [table (keys (get schema-per-customer-tables nil))]
                                                         {:schema schema, :name table}))
                                                     flatten
                                                     set)
                                                {:schema "common", :name "user"})})
          :describe-table      (fn [_ _ {table-name :name, schema-name :schema}]
                                 (assoc (get-in schema-per-customer-tables [(when (= "user" table-name) "common") table-name]) :schema schema-name))
          :describe-table-fks  (fn [_ _ {table-name :name, schema-name :schema}]
                                 (cond
                                   (= "review" table-name)
                                   #{{:fk-column-name   "venue_id"
                                      :dest-table       {:name "venue", :schema schema-name}
                                      :dest-column-name "id"}
                                     {:fk-column-name   "reviewer_id"
                                      :dest-table       {:name "user", :schema "common"}
                                      :dest-column-name "id"}}

                                   (= "venue" table-name)
                                   #{{:fk-column-name   "city_id"
                                      :dest-table       {:name "city", :schema schema-name}
                                      :dest-column-name "id"}}

                                   :else
                                   #{}))
          :details-fields       (constantly [])
          :features             (constantly #{:foreign-keys})}))

(driver/register-driver! :schema-per-customer (SchemaPerCustomerDriver.))


(def ^:const schema-per-customer-raw-tables
  "Docstring"
  [{:schema "s3"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "city"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s2"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "reviewer_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "common", :name "user", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "text"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "venue_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "s2", :name "venue", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "review"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s3"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "city_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "s3", :name "city", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "venue"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s2"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "city"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s1"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "city_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "s1", :name "city", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "venue"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "common"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "user"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s3"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "reviewer_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "common", :name "user", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "text"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "venue_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "s3", :name "venue", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "review"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s2"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "city_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "s2", :name "city", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "venue"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s1"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "reviewer_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "common", :name "user", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "text"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "venue_id"
               :fk_target_column_id true
               :updated_at true
               :fk_target_column {:schema "s1", :name "venue", :col-name "id"}
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "review"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}
   {:schema "s1"
    :database_id true
    :columns [{:column_type nil
               :raw_table_id true
               :name "id"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "IntegerField"}
               :active true
               :id true
               :is_pk true
               :created_at true}
              {:column_type nil
               :raw_table_id true
               :name "name"
               :fk_target_column_id false
               :updated_at true
               :details {:base-type "TextField", :special-type "name"}
               :active true
               :id true
               :is_pk false
               :created_at true}]
    :name "city"
    :updated_at true
    :details {}
    :active true
    :id true
    :created_at true}])

(def ^:const schema-per-customer-tables-and-fields
  "Docstring"
  [{:description nil
    :entity_type nil
    :schema "common"
    :raw_table_id true
    :name "user"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "User"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s1"
    :raw_table_id true
    :name "city"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "City"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s1"
    :raw_table_id true
    :name "review"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "reviewer_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Reviewer Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "common", :name "user", :col-name "id"}}
             {:description nil
              :table_id true
              :special_type :name
              :name "text"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Text"
              :created_at true
              :base_type :TextField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "venue_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Venue Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "s1", :name "venue", :col-name "id"}}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Review"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s1"
    :raw_table_id true
    :name "venue"
    :fields [{:description nil
              :table_id true
              :special_type :fk
              :name "city_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "City Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "s1", :name "city", :col-name "id"}}
             {:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Venue"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s2"
    :raw_table_id true
    :name "city"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "City"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s2"
    :raw_table_id true
    :name "review"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "reviewer_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Reviewer Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "common", :name "user", :col-name "id"}}
             {:description nil
              :table_id true
              :special_type :name
              :name "text"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Text"
              :created_at true
              :base_type :TextField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "venue_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Venue Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "s2", :name "venue", :col-name "id"}}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Review"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s2"
    :raw_table_id true
    :name "venue"
    :fields [{:description nil
              :table_id true
              :special_type :fk
              :name "city_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "City Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "s2", :name "city", :col-name "id"}}
             {:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Venue"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s3"
    :raw_table_id true
    :name "city"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "City"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s3"
    :raw_table_id true
    :name "review"
    :fields [{:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "reviewer_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Reviewer Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "common", :name "user", :col-name "id"}}
             {:description nil
              :table_id true
              :special_type :name
              :name "text"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Text"
              :created_at true
              :base_type :TextField}
             {:description nil
              :table_id true
              :special_type :fk
              :name "venue_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Venue Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "s3", :name "venue", :col-name "id"}}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Review"
    :created_at true}
   {:description nil
    :entity_type nil
    :schema "s3"
    :raw_table_id true
    :name "venue"
    :fields [{:description nil
              :table_id true
              :special_type :fk
              :name "city_id"
              :fk_target_field_id true
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "City Id"
              :created_at true
              :base_type :IntegerField
              :fk_target_field {:schema "s3", :name "city", :col-name "id"}}
             {:description nil
              :table_id true
              :special_type :id
              :name "id"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Id"
              :created_at true
              :base_type :IntegerField}
             {:description nil
              :table_id true
              :special_type :name
              :name "name"
              :fk_target_field_id false
              :updated_at true
              :active true
              :parent_id false
              :id true
              :raw_column_id true
              :last_analyzed false
              :field_type :info
              :position 0
              :visibility_type :normal
              :preview_display true
              :display_name "Name"
              :created_at true
              :base_type :TextField}]
    :rows nil
    :updated_at true
    :entity_name nil
    :active true
    :id true
    :db_id true
    :visibility_type nil
    :display_name "Venue"
    :created_at true}])
