(ns metabase.sync.metadata-sync.links-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.metadata-sync.links :as links]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- add-table!
  "Add a Table `[schema name]` with Fields named `field-names` to the Database with `db-id`. Returns `{field-name id}`
  with the Table's id under `:table`."
  [db-id [table-schema table-name] field-names & {:as table-values}]
  (let [table-id (t2/insert-returning-pk! :model/Table (merge {:db_id db-id :schema table-schema :name table-name
                                                               :active true :initial_sync_status "complete"}
                                                              table-values))]
    (into {:table table-id}
          (map-indexed (fn [i field-name]
                         [field-name (t2/insert-returning-pk! :model/Field {:table_id table-id :name field-name
                                                                            :base_type :type/Integer
                                                                            :database_type "INT" :position i
                                                                            :database_position i})]))
          field-names)))

(defn- links-by-key
  "The links of the described Tables of the Database with `db-id`, by `[schema name]`, with `schema-filter`."
  ([db-id] (links-by-key db-id nil))
  ([db-id schema-filter]
   (let [tables (tables/selection db-id schema-filter)
         by-id  (into {} (map (juxt :id (juxt :schema :name))) tables)]
     (update-keys (links/table-links tables tables) by-id))))

(deftest fk-link-test
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [people (add-table! db-id ["PUBLIC" "people"] ["id" "name"])
          orders (add-table! db-id ["PUBLIC" "orders"] ["id" "user_id"])]
      (t2/update! :model/Field :id (orders "user_id") {:fk_target_field_id (people "id")})
      (testing "an FK between two described Tables is a link of its Table, with the target's names"
        (is (= {["PUBLIC" "orders"] [{:kind   "fk"
                                      :field  ["user_id"]
                                      :target {:schema "PUBLIC" :table "people" :field ["id"]}}]}
               (links-by-key db-id)))))))

(deftest links-out-of-the-selection-test
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
    (let [orders    (add-table! db-id ["PUBLIC" "orders"] ["id" "user_id" "product_id" "scratch_id" "lead_id"])
          people    (add-table! db-id ["PUBLIC" "people"] ["id"])
          products  (add-table! db-id ["PUBLIC" "products"] ["id"] :active false)
          scratch   (add-table! db-id ["mb__isolation_abc" "scratch"] ["id"])
          leads     (add-table! db-id ["SALES" "leads"] ["id"])]
      (doseq [[field target] [["user_id" (people "id")] ["product_id" (products "id")]
                              ["scratch_id" (scratch "id")] ["lead_id" (leads "id")]]]
        (t2/update! :model/Field :id (orders field) {:fk_target_field_id target}))
      (let [public-only {:type "inclusion" :patterns "PUBLIC"}
            fk-fields   #(set (map :field (get (links-by-key db-id %) ["PUBLIC" "orders"])))]
        (testing "an FK into an inactive Table, a workspace's own schema, or a schema outside the filter is not a link"
          (is (= #{["user_id"]} (fk-fields public-only))))
        (testing "with that schema in the selection, the FK into it is a link"
          (is (= #{["user_id"] ["lead_id"]} (fk-fields {:type "inclusion" :patterns "PUBLIC,SALES"}))))))))

(deftest display-remaps-are-not-links-test
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [categories (add-table! db-id ["PUBLIC" "categories"] ["id" "name"])
          venues     (add-table! db-id ["PUBLIC" "venues"] ["category_id" "price"])]
      (t2/insert! :model/Dimension [{:field_id (venues "category_id") :name "Category" :type :external
                                     :human_readable_field_id (categories "name")}
                                    {:field_id (venues "price") :name "Price label" :type :internal}])
      (t2/update! :model/Field :id (venues "category_id") {:fk_target_field_id (categories "id")})
      (testing "only FKs are links: display remaps are not sent"
        (is (= {["PUBLIC" "venues"] [{:kind "fk" :field ["category_id"]
                                      :target {:schema "PUBLIC" :table "categories" :field ["id"]}}]}
               (links-by-key db-id)))))))

(deftest links-of-fields-an-entry-leaves-out-test
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [people (add-table! db-id ["PUBLIC" "people"] ["id" "old_id" "parent"])
          orders (add-table! db-id ["PUBLIC" "orders"] ["user_id" "old_user_id" "nested_user_id" "retired_user_id"])]
      (t2/update! :model/Field :id (people "old_id") {:visibility_type :retired})
      (t2/insert! :model/Field {:table_id (:table people) :name "child" :base_type :type/Integer :database_type "INT"
                                :parent_id (people "parent")})
      (t2/update! :model/Field :id (orders "nested_user_id") {:parent_id (orders "user_id")})
      (t2/update! :model/Field :id (orders "retired_user_id") {:visibility_type :retired})
      (doseq [[field target] [["user_id" (t2/select-one-pk :model/Field :name "child" :table_id (:table people))]
                              ["old_user_id" (people "old_id")]
                              ["nested_user_id" (people "id")]
                              ["retired_user_id" (people "id")]]]
        (t2/update! :model/Field :id (orders field) {:fk_target_field_id target}))
      (testing "an FK from or into a retired or nested Field is not a link"
        (is (= {} (links-by-key db-id)))))))

(deftest an-fk-a-user-set-says-so-on-its-link-test
  (mt/with-temp [:model/Database {db-id :id} {}]
    (let [people (add-table! db-id ["PUBLIC" "people"] ["id"])
          orders (add-table! db-id ["PUBLIC" "orders"] ["user_id" "buyer_id"])]
      (t2/update! :model/Field :id (orders "user_id") {:fk_target_field_id (people "id")})
      (t2/update! :model/Field :id (orders "buyer_id") {:fk_target_field_id (people "id")})
      (t2/insert! :model/FieldUserSettings {:field_id (orders "user_id") :fk_target_field_id (people "id")
                                            :fk_target_field_id_set true})
      (testing "the link of an FK that a user set says so, so the receiver marks it as set when it fills it"
        (is (= [{:kind "fk" :field ["buyer_id"] :target {:schema "PUBLIC" :table "people" :field ["id"]}}
                {:kind     "fk"
                 :field    ["user_id"]
                 :target   {:schema "PUBLIC" :table "people" :field ["id"]}
                 :user_set true}]
               (get (links-by-key db-id) ["PUBLIC" "orders"])))))))
