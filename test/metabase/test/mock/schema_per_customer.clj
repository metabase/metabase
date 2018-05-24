(ns metabase.test.mock.schema-per-customer
  "A relational database that replicates a set of tables multiple times such that schema1.* and schema2.* have the
   same set of tables.  This is common in apps that provide an 'instance' per customer."
  (:require [metabase.driver :as driver]
            [metabase.test.mock.util :refer [table-defaults field-defaults]]))


;; NOTE: we throw in a "common" schema which shares an FK across all other schemas just to get tricky
(def ^:private schema-per-customer-tables
  {nil      {"city"   {:name   "city"
                       :fields #{{:name         "id"
                                  :base-type    :type/Integer
                                  :pk?          true}
                                 {:name         "name"
                                  :base-type    :type/Text
                                  :special-type :type/Name}}}
             "venue"  {:name   "venue"
                       :fields #{{:name         "id"
                                  :base-type    :type/Integer
                                  :pk?          true}
                                 {:name         "name"
                                  :base-type    :type/Text
                                  :special-type :type/Name}
                                 {:name         "city_id"
                                  :base-type    :type/Integer}}}
             "review" {:name   "review"
                       :fields #{{:name         "id"
                                  :base-type    :type/Integer
                                  :pk?          true}
                                 {:name         "text"
                                  :base-type    :type/Text
                                  :special-type :type/Name}
                                 {:name         "venue_id"
                                  :base-type    :type/Integer}
                                 {:name         "reviewer_id"
                                  :base-type    :type/Integer}}}}
   "common" {"user"   {:name   "user"
                       :fields #{{:name         "id"
                                  :base-type    :type/Integer
                                  :pk?          true}
                                 {:name         "name"
                                  :base-type    :type/Text}}}}})

(defrecord ^:private SchemaPerCustomerDriver []
  clojure.lang.Named
  (getName [_] "SchemaPerCustomerDriver"))

(extend SchemaPerCustomerDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database   (fn [_ _]
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

(def schema-per-customer-tables-and-fields
  [(merge table-defaults
          {:schema       "common"
           :name         "user"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]
           :display_name "User"})
   (merge table-defaults
          {:schema       "s1"
           :name         "city"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]
           :display_name "City"})
   (merge table-defaults
          {:schema       "s1"
           :name         "review"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "reviewer_id"
                                  :fk_target_field_id true
                                  :display_name       "Reviewer ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "common", :name "user", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "text"
                                  :display_name "Text"
                                  :base_type    :type/Text})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "venue_id"
                                  :fk_target_field_id true
                                  :display_name       "Venue ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "s1", :name "venue", :col-name "id"}})]
           :display_name "Review"})
   (merge table-defaults
          {:schema       "s1"
           :name         "venue"
           :fields       [(merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "city_id"
                                  :fk_target_field_id true
                                  :display_name       "City ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "s1", :name "city", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]
           :display_name "Venue"})
   (merge table-defaults
          {:schema       "s2"
           :name         "city"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]
           :display_name "City"})
   (merge table-defaults
          {:schema       "s2"
           :name         "review"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "reviewer_id"
                                  :fk_target_field_id true
                                  :display_name       "Reviewer ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "common", :name "user", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "text"
                                  :display_name "Text"
                                  :base_type    :type/Text})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "venue_id"
                                  :fk_target_field_id true
                                  :display_name       "Venue ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "s2", :name "venue", :col-name "id"}})]
           :display_name "Review"})
   (merge table-defaults
          {:schema       "s2"
           :name         "venue"
           :fields       [(merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "city_id"
                                  :fk_target_field_id true
                                  :display_name       "City ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "s2", :name "city", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]
           :display_name "Venue"})
   (merge table-defaults
          {:schema       "s3"
           :name         "city"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]
           :display_name "City"})
   (merge table-defaults
          {:schema       "s3"
           :name         "review"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "reviewer_id"
                                  :fk_target_field_id true
                                  :display_name       "Reviewer ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "common", :name "user", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "text"
                                  :display_name "Text"
                                  :base_type    :type/Text})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "venue_id"
                                  :fk_target_field_id true
                                  :display_name       "Venue ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "s3", :name "venue", :col-name "id"}})]
           :display_name "Review"})
   (merge table-defaults
          {:schema       "s3"
           :name         "venue"
           :fields       [(merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "city_id"
                                  :fk_target_field_id true
                                  :display_name       "City ID"
                                  :base_type          :type/Integer
                                  :fk_target_field    {:schema "s3", :name "city", :col-name "id"}})
                          (merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})]
           :display_name "Venue"})])
