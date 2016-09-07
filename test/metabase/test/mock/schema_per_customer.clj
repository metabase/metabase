(ns metabase.test.mock.schema-per-customer
  "A relational database that replicates a set of tables multiple times such that schema1.* and schema2.* have the
   same set of tables.  This is common in apps that provide an 'instance' per customer."
  (:require [metabase.driver :as driver]))


;; NOTE: we throw in a "common" schema which shares an FK across all other schemas just to get tricky
(def ^:private ^:const schema-per-customer-tables
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

(def ^:private ^:const raw-table-defaults
  {:schema      nil
   :database_id true
   :columns     []
   :updated_at  true
   :details     {}
   :active      true
   :id          true
   :created_at  true})

(def ^:private ^:const raw-field-defaults
  {:column_type         nil
   :raw_table_id        true
   :fk_target_column_id false
   :updated_at          true
   :details             {}
   :active              true
   :id                  true
   :is_pk               false
   :created_at          true})

(def ^:const schema-per-customer-raw-tables
  [(merge raw-table-defaults
          {:schema  "s3"
           :columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField", :special-type "name"}})]
           :name    "city"})
   (merge raw-table-defaults
          {:schema  "s2"
           :columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name                "reviewer_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "common", :name "user", :col-name "id"}
                             :details             {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "text"
                             :details {:base-type "TextField", :special-type "name"}})
                     (merge raw-field-defaults
                            {:name                "venue_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "s2", :name "venue", :col-name "id"}
                             :details             {:base-type "IntegerField"}})]
           :name    "review"})
   (merge raw-table-defaults
          {:schema  "s3"
           :columns [(merge raw-field-defaults
                            {:name                "city_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "s3", :name "city", :col-name "id"}
                             :details             {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField", :special-type "name"}})]
           :name    "venue"})
   (merge raw-table-defaults
          {:schema  "s2"
           :columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField", :special-type "name"}})]
           :name    "city"})
   (merge raw-table-defaults
          {:schema  "s1"
           :columns [(merge raw-field-defaults
                            {:name                "city_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "s1", :name "city", :col-name "id"}
                             :details             {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField", :special-type "name"}})]
           :name    "venue"})
   (merge raw-table-defaults
          {:schema  "common"
           :columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField"}})]
           :name    "user"})
   (merge raw-table-defaults
          {:schema  "s3"
           :columns [(merge raw-field-defaults
                            {:name                "id"
                             :details {:base-type "IntegerField"}
                             :is_pk               true})
                     (merge raw-field-defaults
                            {:name                "reviewer_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "common", :name "user", :col-name "id"}
                             :details             {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "text"
                             :details {:base-type "TextField", :special-type "name"}})
                     (merge raw-field-defaults
                            {:name                "venue_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "s3", :name "venue", :col-name "id"}
                             :details             {:base-type "IntegerField"}})]
           :name    "review"})
   (merge raw-table-defaults
          {:schema  "s2"
           :columns [(merge raw-field-defaults
                            {:name                "city_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "s2", :name "city", :col-name "id"}
                             :details             {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField", :special-type "name"}})]
           :name    "venue"})
   (merge raw-table-defaults
          {:schema  "s1"
           :columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name                "reviewer_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "common", :name "user", :col-name "id"}
                             :details             {:base-type "IntegerField"}})
                     (merge raw-field-defaults
                            {:name    "text"
                             :details {:base-type "TextField", :special-type "name"}})
                     (merge raw-field-defaults
                            {:name                "venue_id"
                             :fk_target_column_id true
                             :fk_target_column    {:schema "s1", :name "venue", :col-name "id"}
                             :details             {:base-type "IntegerField"}})]
           :name    "review"})
   (merge raw-table-defaults
          {:schema  "s1"
           :columns [(merge raw-field-defaults
                            {:name    "id"
                             :details {:base-type "IntegerField"}
                             :is_pk   true})
                     (merge raw-field-defaults
                            {:name    "name"
                             :details {:base-type "TextField", :special-type "name"}})]
           :name    "city"})])


(def ^:private ^:const table-defaults
  {:description             nil
   :entity_type             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :schema                  nil
   :raw_table_id            true
   :fields                  []
   :rows                    nil
   :updated_at              true
   :entity_name             nil
   :active                  true
   :id                      true
   :db_id                   true
   :visibility_type         nil
   :created_at              true})


(def ^:private ^:const field-defaults
  {:description        nil
   :table_id           true
   :caveats            nil
   :points_of_interest nil
   :fk_target_field_id false
   :updated_at         true
   :active             true
   :parent_id          false
   :id                 true
   :raw_column_id      true
   :last_analyzed      false
   :position           0
   :visibility_type    :normal
   :preview_display    true
   :created_at         true})

(def ^:const schema-per-customer-tables-and-fields
  [(merge table-defaults
          {:schema       "common"
           :name         "user"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]
           :display_name "User"})
   (merge table-defaults
          {:schema       "s1"
           :name         "city"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]
           :display_name "City"})
   (merge table-defaults
          {:schema       "s1"
           :name         "review"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :name               "reviewer_id"
                                  :fk_target_field_id true
                                  :display_name       "Reviewer ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "common", :name "user", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "text"
                                  :display_name "Text"
                                  :base_type    :TextField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :name               "venue_id"
                                  :fk_target_field_id true
                                  :display_name       "Venue ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "s1", :name "venue", :col-name "id"}})]
           :display_name "Review"})
   (merge table-defaults
          {:schema       "s1"
           :name         "venue"
           :fields       [(merge field-defaults
                                 {:special_type       :fk
                                  :name               "city_id"
                                  :fk_target_field_id true
                                  :display_name       "City ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "s1", :name "city", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]
           :display_name "Venue"})
   (merge table-defaults
          {:schema       "s2"
           :name         "city"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]
           :display_name "City"})
   (merge table-defaults
          {:schema       "s2"
           :name         "review"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :name               "reviewer_id"
                                  :fk_target_field_id true
                                  :display_name       "Reviewer ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "common", :name "user", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "text"
                                  :display_name "Text"
                                  :base_type    :TextField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :name               "venue_id"
                                  :fk_target_field_id true
                                  :display_name       "Venue ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "s2", :name "venue", :col-name "id"}})]
           :display_name "Review"})
   (merge table-defaults
          {:schema       "s2"
           :name         "venue"
           :fields       [(merge field-defaults
                                 {:special_type       :fk
                                  :name               "city_id"
                                  :fk_target_field_id true
                                  :display_name       "City ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "s2", :name "city", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]
           :display_name "Venue"})
   (merge table-defaults
          {:schema       "s3"
           :name         "city"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]
           :display_name "City"})
   (merge table-defaults
          {:schema       "s3"
           :name         "review"
           :fields       [(merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :name               "reviewer_id"
                                  :fk_target_field_id true
                                  :display_name       "Reviewer ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "common", :name "user", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "text"
                                  :display_name "Text"
                                  :base_type    :TextField})
                          (merge field-defaults
                                 {:special_type       :fk
                                  :name               "venue_id"
                                  :fk_target_field_id true
                                  :display_name       "Venue ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "s3", :name "venue", :col-name "id"}})]
           :display_name "Review"})
   (merge table-defaults
          {:schema       "s3"
           :name         "venue"
           :fields       [(merge field-defaults
                                 {:special_type       :fk
                                  :name               "city_id"
                                  :fk_target_field_id true
                                  :display_name       "City ID"
                                  :base_type          :IntegerField
                                  :fk_target_field    {:schema "s3", :name "city", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :id
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :IntegerField})
                          (merge field-defaults
                                 {:special_type :name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :TextField})]
           :display_name "Venue"})])
