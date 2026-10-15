(ns metabase-enterprise.library-branching.manifest-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.manifest :as format.manifest]
   [metabase-enterprise.library-branching.manifest :as manifest]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- entry
  "The entry of the database named `db-name` in manifest document `doc`."
  [doc db-name]
  (first (filter #(= db-name (:name %)) (:databases doc))))

(defn- do-with-warehouse
  "Calls `f` with the temp database `lb manifest db` and its tables and fields."
  [f]
  ;; A routing destination can hold no permissions, so it gets no table here; the export leaves it out by its column.
  (mt/with-temp [:model/Database router {:name "lb manifest db" :engine :h2 :details {:db "mem:x" :password "hunter2"}}
                 :model/Database _dest  {:name "lb manifest destination" :engine :h2 :router_database_id (:id router)}
                 :model/Database audit  {:name "lb manifest audit" :engine :h2 :is_audit true}
                 :model/Table    orders {:db_id (:id router) :schema "PUBLIC" :name "ORDERS"}
                 :model/Table    _gone  {:db_id (:id router) :schema "PUBLIC" :name "GONE" :active false}
                 :model/Table    _notes {:db_id (:id router) :schema nil :name "NOTES"}
                 :model/Table    _audit {:db_id (:id audit) :schema "PUBLIC" :name "VIEW_LOG"}
                 :model/Field    _total {:table_id (:id orders) :name "TOTAL" :base_type :type/Float
                                         :effective_type :type/Float :semantic_type :type/Currency}
                 :model/Field    data   {:table_id (:id orders) :name "DATA" :base_type :type/JSON}
                 :model/Field    a      {:table_id (:id orders) :name "a" :base_type :type/Text :parent_id (:id data)}
                 :model/Field    _b     {:table_id (:id orders) :name "b" :base_type :type/Integer :parent_id (:id a)}
                 :model/Field    _old   {:table_id (:id orders) :name "OLD" :base_type :type/Text :active false}]
    (f)))

(deftest manifest-test
  (do-with-warehouse
   (fn []
     (let [doc (manifest/manifest)]
       (testing "a database with its active tables and their active fields, each nested field under its parent"
         (is (= {:name   "lb manifest db"
                 :engine "h2"
                 :tables [{:name "NOTES"}
                          {:name   "ORDERS"
                           :schema "PUBLIC"
                           :fields [{:name "DATA" :base_type "type/JSON"
                                     :fields [{:name "a" :base_type "type/Text"
                                               :fields [{:name "b" :base_type "type/Integer"}]}]}
                                    {:name "TOTAL" :base_type "type/Float" :effective_type "type/Float"}]}]}
                (entry doc "lb manifest db"))))
       (testing "no audit database and no routing destination"
         (is (nil? (entry doc "lb manifest audit")))
         (is (nil? (entry doc "lb manifest destination"))))
       (testing "databases in the order of their names"
         (is (= (sort (map :name (:databases doc))) (map :name (:databases doc)))))
       (testing "the document fits the manifest schema"
         (is (= format.manifest/version (:format doc)))
         (is (contains? (format.manifest/decode (manifest/manifest-yaml)) :env)))))))

(deftest manifest-yaml-test
  (do-with-warehouse
   (fn []
     (let [b (manifest/manifest-yaml)]
       (testing "the YAML reads back to the document, and its environment has the fields by natural key"
         (is (= (manifest/manifest) (codec/read-yaml b)))
         (is (= {:object :field :base-type "type/Text"}
                (get (:env (format.manifest/decode b)) ["lb manifest db" "PUBLIC" "ORDERS" "DATA" "a"]))))
       (testing "no connection detail and no data"
         (is (not (str/includes? (String. b "UTF-8") "hunter2")))
         (is (not (str/includes? (String. b "UTF-8") "mem:x"))))))))

(deftest manifest-api-test
  (mt/with-premium-features #{:remote-sync}
    (do-with-warehouse
     (fn []
       (testing "a superuser gets the manifest as a YAML file"
         (let [body (mt/user-http-request :crowberto :get 200 "ee/library-branching/manifest")]
           (is (string? body))
           (is (= (String. (manifest/manifest-yaml) "UTF-8") body))))
       (testing "a user who is not a superuser gets no manifest"
         (is (= "You don't have permissions to do that."
                (mt/user-http-request :rasta :get 403 "ee/library-branching/manifest"))))))))
