(ns ^:mb/driver-tests metabase-enterprise.workspaces.common-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest testing is]]
   [medley.core :as m]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as driver.conn]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- setup!
  [schema]
  (let [spec (driver.conn/connection-details->spec :postgres (:details (mt/db)))]
    (jdbc/execute! spec (format "DROP SCHEMA IF EXISTS %s CASCADE" schema))
    (jdbc/execute! spec (format "CREATE SCHEMA %s" schema))))

(defn teardown!
  [ws-id]
  (let [[ws-graph ws-schema] (t2/select-one-fn (juxt :graph :schema) :model/Workspace :id ws-id)
        spec (driver.conn/connection-details->spec :postgres (:details (mt/db)))
        output-ids (-> ws-graph :outputs (->> (map :id)))
        dup-tables-ids (into #{}
                             (map #(-> % :mapping :id))
                             (-> ws-graph :outputs))]
    (when (seq dup-tables-ids)
      (t2/delete! :model/Table :id [:in dup-tables-ids]))
    (when (seq output-ids)
      (t2/delete! :model/Table :id [:in output-ids]))
    (when (some? ws-id)
      (t2/delete! :model/Workspace :id ws-id))
    (when (string? (not-empty ws-schema))
      (jdbc/execute! spec (format "DROP SCHEMA IF EXISTS %s CASCADE" ws-schema)))))

(deftest create-workspace-independent-native-transforms-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          native-base (lib/native-query mp "select * from ORDERS LIMIT 10")
          test-schema "test_schema"
          new-workspace (atom nil)]
      (try
        (setup! test-schema)
        (mt/with-temp
          [:model/Transform x1 {:name "x1"
                                :source_type :native
                                :source {:type :query
                                         :query native-base}
                                :target {:type :table
                                         :database (mt/id)
                                         :schema test-schema
                                         :name "t1"}}
           :model/Transform x2 {:name "x2"
                                :source_type :native
                                :source {:type :query
                                         :query (assoc-in native-base [:stages 0 :native]
                                                          (str "SELECT *\n"
                                                               "FROM PRODUCTS\n"
                                                               "LIMIT 10\n"))}
                                :target {:type :table
                                         :database (mt/id)
                                         :schema test-schema
                                         :name "t2"}}
           :model/Transform x3 {:name "x3"
                                :source_type :native
                                :source {:type :query
                                         :query (assoc-in native-base [:stages 0 :native]
                                                          (str "SELECT *\n"
                                                               "FROM PEOPLE\n"
                                                               "LIMIT 10\n"))}
                                :target {:type :table
                                         :database (mt/id)
                                         :schema test-schema
                                         :name "t3"}}]
          (transforms.i/execute! x1 {:run-method :manual})
          (transforms.i/execute! x2 {:run-method :manual})
          (transforms.i/execute! x3 {:run-method :manual})
          (let [result (mt/with-current-user (mt/user->id :crowberto)
                         (ws.common/create-workspace! (mt/user->id :crowberto)
                                                      {:name "test_ws"
                                                       :database_id (mt/id)
                                                       :upstream {:transforms (mapv :id [x1 x2 x3])}}))
                checkouts (-> result :graph :check-outs)
                transforms (-> result :graph :transforms)]
            (reset! new-workspace result)
            (testing "Name is correct"
              (is (= "test_ws" (:name result))))
            (testing "Checkouts are as expected"
              (is (= [{:type :transform :id (:id x1)}
                      {:type :transform :id (:id x2)}
                      {:type :transform :id (:id x3)}]
                     (sort-by :id checkouts))))
            (testing "Transforms look as expected"
              (is (= #{{:id (:id x1), :type :transform, :mapping {#_#_:id pos-int?, :name "x1"}}
                       {:id (:id x2), :type :transform, :mapping {#_#_:id pos-int?, :name "x2"}}
                       {:id (:id x3), :type :transform, :mapping {#_#_:id pos-int?, :name "x3"}}}
                     (into #{} (map #(m/update-existing % :mapping dissoc :id)) transforms))))))
       ;; For development, subject to change
        (catch Throwable t
          (def ttt t)
          (throw t))
        (finally
          (teardown! (:id @new-workspace)))))))

(deftest mirroring-multiple-interdependent-native-transforms-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          native-base (lib/native-query mp "select * from ORDERS LIMIT 10")
          test-schema "test_schema"
          new-workspace (atom nil)]
      (try
        (setup! test-schema)
        (testing "Interdependent native transforms"
          (mt/with-temp
            [:model/Transform x1 {:name "x1"
                                  :source_type :native
                                  :source {:type :query
                                           :query native-base}
                                  :target {:type :table
                                           :database (mt/id)
                                           :schema test-schema
                                           :name "t1"}}
             :model/Transform x2 {:name "x2"
                                  :source_type :native
                                  :source {:type :query
                                           :query (assoc-in native-base [:stages 0 :native]
                                                            (str "SELECT *\n"
                                                                 (format "FROM \"%s\".\"%s\"\n" test-schema "t1")
                                                                 "LIMIT 10\n"))}
                                  :target {:type :table
                                           :database (mt/id)
                                           :schema test-schema
                                           :name "t2"}}
             :model/Transform x3 {:name "x3"
                                  :source_type :native
                                  :source {:type :query
                                           :query (assoc-in native-base [:stages 0 :native]
                                                            (str "SELECT *\n"
                                                                 (format "FROM \"%s\".\"%s\"\n" test-schema "t2")
                                                                 "LIMIT 10\n"))}
                                  :target {:type :table
                                           :database (mt/id)
                                           :schema test-schema
                                           :name "t3"}}]
            (transforms.i/execute! x1 {:run-method :manual})
            (transforms.i/execute! x2 {:run-method :manual})
            (transforms.i/execute! x3 {:run-method :manual})
            (let [result-ws (mt/with-current-user (mt/user->id :crowberto)
                              (ws.common/create-workspace! (mt/user->id :crowberto)
                                                           {:name "test_ws"
                                                            :database_id (mt/id)
                                                            :upstream {:transforms (mapv :id [x1 x3])}}))
                  checkouts (-> result-ws :graph :check-outs)
                  transforms (-> result-ws :graph :transforms)]
              (reset! new-workspace result-ws)
              (testing "Workspace has expected name"
                (is (= "test_ws" (:name result-ws))))
              (testing "Checkouts contain only the explicitly checked out transforms"
                (is (= #{{:type :transform :id (:id x1)}
                         {:type :transform :id (:id x3)}}
                       (set checkouts))))
              (testing "Workspace has correct mappings in graph"
                (is (= #{{:id (:id x1), :type :transform, :mapping {#_#_:id pos-int?, :name "x1"}}
                         {:id (:id x2), :type :transform, :mapping {#_#_:id pos-int?, :name "x2"}}
                         {:id (:id x3), :type :transform, :mapping {#_#_:id pos-int?, :name "x3"}}}
                       (into #{} (map #(m/update-existing % :mapping dissoc :id)) transforms))))
              (let [orig-id->mirror-id (into {}
                                             (map (fn [{:keys [id mapping]}]
                                                    [id (:id mapping)]))
                                             transforms)
                    mirror-id->mirror (t2/select-fn->fn :id identity :model/Transform :id
                                                        [:in (vals orig-id->mirror-id)])
                    x1-mirror (-> (:id x1) orig-id->mirror-id mirror-id->mirror)
                    x2-mirror (-> (:id x2) orig-id->mirror-id mirror-id->mirror)
                    x3-mirror (-> (:id x3) orig-id->mirror-id mirror-id->mirror)]
                (testing "X1 was properly mirrored"
                  (testing "name"
                    (is (= "x1" (:name x1-mirror))))
                  (testing "target adjusted"
                    (is (=? {:type "table"
                             :database (mt/id)
                             :schema (:schema result-ws)
                            ;; table name = orig schema + __ + orig target name atm
                             :name (str test-schema "__" (-> x1 :target :name))}
                            (:target x1-mirror))))
                  (testing "source not modifed"
                    (is (=? (:source x1)
                            (:source x1-mirror)))))
                (testing "X2 was properly mirrored"
                  (testing "name"
                    (is (= (:name x2) (:name x2-mirror))))
                  (testing "target"
                    (is (=? {:type "table"
                             :database (mt/id)
                             :schema (:schema result-ws)
                             :name (str test-schema "__" (-> x2 :target :name))}
                            (:target x2-mirror))))
                  (testing "source query referencing target of x1 mirror"
                   ;; TODO (lbrdnk 2025-11-27): Quotes are removed, figure out whether what has
                   ;;                           some unwanted consequences.
                    (is (=? {:query {:stages [{:native (format "SELECT *\nFROM %s.%s\nLIMIT 10\n"
                                                               (-> x1-mirror :target :schema)
                                                               (-> x1-mirror :target :name))}]}}
                            (:source x2-mirror)))))
                (testing "X3 was properly mirrored"
                  (testing "name"
                    (is (= (:name x3) (:name x3-mirror))))
                  (testing "target"
                    (is (=? {:type "table"
                             :database (mt/id)
                             :schema (:schema result-ws)
                             :name (str test-schema "__" (-> x3 :target :name))}
                            (:target x3-mirror))))
                  (testing "source query referencing target of x2 mirror"
                    (is (=? {:query {:stages [{:native (format "SELECT *\nFROM %s.%s\nLIMIT 10\n"
                                                               (-> x2-mirror :target :schema)
                                                               (-> x2-mirror :target :name))}]}}
                            (:source x3-mirror)))))))))
       ;; For development, subject to change
        (catch Throwable t
          (def ttt t)
          (throw t))
        (finally
          (teardown! (:id @new-workspace)))))))

(deftest python-transforms-checkout-test
  (mt/test-driver
    :postgres
    (let [target-schema "public"]
      (try (transforms.tu/with-transform-cleanup! [t1 "t1"
                                                   t2 "t2"]
             (mt/with-temp
               [:model/Transform x1 {:name   "initial"
                                     :source {:type  "python"
                                              :source-database (mt/id)
                                              :source-tables {"checkins" (mt/id :checkins)
                                                              "venues" (mt/id :venues)}
                                              :body  (str "import pandas as pd\n"
                                                          "\n"
                                                          "def transform(checkins, venues):\n"
                                                          "    return checkins.set_index('venue_id').join(venues.set_index('id'), lsuffix='_venues')\n")}
                                     :target {:type "table"
                                              :database (mt/id)
                                              :schema target-schema
                                              :name t1}}]
               (transforms.i/execute! x1 {:run-method :manual})
               (let [t1-table (t2/select-one :model/Table :name t1)]
                 (mt/with-temp [:model/Transform x2 {:name   "dependent"
                                                     :source {:type  "python"
                                                              :source-database (mt/id)
                                                              :source-tables {"t1" (:id t1-table)}
                                                              :body  (str "import pandas as pd\n"
                                                                          "\n"
                                                                          "def transform(t1):\n"
                                                                          "    return t1")}
                                                     :target {:type "table"
                                                              :database (mt/id)
                                                              :schema target-schema
                                                              :name t2}}]
                   (transforms.i/execute! x2 {:run-method :manual})
                   (let [user-id (mt/user->id :crowberto)
                         result-workspace (mt/with-test-user :crowberto
                                            (ws.common/create-workspace! user-id
                                                                         {:name "my test workspace x"
                                                                          :database_id (mt/id)
                                                                          :upstream {:transforms [(:id x1) (:id x2)]}}))
                         mirror-initial (t2/select-one :model/Transform :name "initial" :workspace_id (:id result-workspace))
                         mirror-dependent (t2/select-one :model/Transform :name "dependent" :workspace_id (:id result-workspace))
                         t1-mirror (t2/select-one :model/Table
                                                  :schema (-> mirror-initial :target :schema)
                                                  :name (-> mirror-initial :target :name))]
                     (testing "targets"
                       (is (=? {:name (str "public__" (-> x1 :target :name))
                                :schema (:schema result-workspace)}
                               (:target mirror-initial)))
                       (is (=? {:name (str "public__" (-> x2 :target :name))
                                :schema (:schema result-workspace)}
                               (:target mirror-dependent))))
                     (testing "sources"
                       (is (=? {:source-tables {"venues" (mt/id :venues)
                                                "checkins" (mt/id :checkins)}}
                               (:source mirror-initial)))
                       (is (=? {:source-tables {"t1" (:id t1-mirror)}}
                               (:source mirror-dependent)))))))))
           (catch Throwable t
             (def ttt t)
             (throw t))))))

(deftest remove-transforms-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          q1 (lib/native-query mp "select * from orders limit 10;")
          q2 (lib/native-query mp "select * from products limit 10;")
          test-schema "my_test_schema"
          ws-id (atom nil)]
      (try
        (setup! test-schema)
        (transforms.tu/with-transform-cleanup! [t1 "t1"
                                                t2 "t2"]
          (mt/with-temp
            [:model/Transform x1 {:source_type :native
                                  :source {:type :query
                                           :query q1}
                                  :target {:type :table
                                           :database (mt/id)
                                           :schema test-schema
                                           :name t1}}
             :model/Transform x2 {:source_type :native
                                  :source {:type :query
                                           :query q2}
                                  :target {:type :table
                                           :database (mt/id)
                                           :schema test-schema
                                           :name t2}}]
         ;; Create the target tables
            (transforms.i/execute! x1 {:run-method :manual})
            (transforms.i/execute! x2 {:run-method :manual})
         ;; Add into a workspace
            (let [creator-id (mt/user->id :crowberto)
                  ws (mt/with-test-user :crowberto
                       (ws.common/create-workspace! creator-id {:name "my test ws xxx"
                                                                :database_id (mt/id)
                                                                :upstream {:transforms [(:id x1) (:id x2)]}}))
                  _ (reset! ws-id (:id ws))
                  mirrored-transforms-ids (t2/select-fn-vec :downstream_id :model/WorkspaceMappingTransform :workspace_id (:id ws))
                  ws-db (t2/select-one :model/Database :id (:database_id ws))
                  mirrored-tables-ids (t2/select-fn-vec :downstream_id :model/WorkspaceMappingTable :workspace_id (:id ws))
                  mirrored-tables (t2/select :model/Table :id [:in mirrored-tables-ids])]
              (testing "Sanity"
                (testing "Mirrored transforms created"
                  (is (= 2 (count mirrored-transforms-ids))))
                (testing "Mirrored tables created in isolated schema"
                  (run!
                   (fn [{:keys [schema name]}]
                     (is (true? (driver/table-exists? :postgres ws-db {:schema schema :name name}))))
                   mirrored-tables))
                (testing "Mirrored tables created in appdb"
                  (is (= 2 (count mirrored-tables-ids)))))
              (testing "Remove transforms from a workspace"
                (mt/with-test-user :crowberto
                 ;; ACT!
                  (ws.common/remove-entities! ws {:transforms mirrored-transforms-ids}))
                (testing "Mirrored transforms deleted"
                  (is (empty? (t2/select :model/Transform :id [:in mirrored-transforms-ids]))))
                (testing "Mirrored tables dropped from the isolated schema"
                  (run!
                   (fn [{:keys [schema name]}]
                    ;; driver/table-exists? -- _prints_ exception on non-existent relation, while having correct
                    ;; return value.
                    ;; one way or another -- this test will be rewritten completely. Then we will handle that.
                     (is (false? (driver/table-exists? :postgres ws-db {:schema schema :name name}))))
                   mirrored-tables))
                (testing "Mirrored tables deleted from the appdb"
                  (is (empty? (t2/select :model/Table :id [:in mirrored-tables-ids]))))
                (testing "Mirrored entites are not present in the mapping tables"
                  (is (empty? (t2/select :model/WorkspaceMappingTable :workspace_id (:id ws))))
                  (is (empty? (t2/select :model/WorkspaceMappingTransform :workspace_id (:id ws)))))))))
        (catch Throwable t
          (def ttt t)
          (throw t))
        (finally
          (teardown! @ws-id))))))

(deftest add-one-by-one-and-remove-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          q1 (lib/native-query mp "select * from orders limit 10;")
          test-schema "my_test_schema"
          ws-id (atom nil)]
      (try
        (setup! test-schema)
        (transforms.tu/with-transform-cleanup! [t1 "t1"]
          (mt/with-temp
            [:model/Transform x1 {:source_type :native
                                  :source {:type :query
                                           :query q1}
                                  :target {:type :table
                                           :database (mt/id)
                                           :schema test-schema
                                           :name t1}}]
           ;; Create the target tables
            (transforms.i/execute! x1 {:run-method :manual})
           ;; Add into a workspace
            (let [creator-id (mt/user->id :crowberto)
                 ;; create empty workspace
                  ws (mt/user-http-request :crowberto :post 200
                                           "/ee/workspace"
                                           {:name "my test ws xxx"
                                            :creator_id creator-id
                                            :database_id (mt/id)})
                  _ (reset! ws-id (:id ws))]
              (let [add-res (mt/user-http-request :crowberto :post 200
                                                  (str "ee/workspace/" (:id ws) "/contents")
                                                  {:add {:transforms [(:id x1)]}})]
                (testing "Successfully added"
                  (is (some? (-> add-res :contents :transforms (nth 0)))))
                (let [rem-res (mt/user-http-request :crowberto :post 200
                                                    (str "ee/workspace/" (:id ws) "/contents")
                                                    {:remove {:transforms [(-> add-res :contents :transforms (nth 0) :id)]}})]
                  (testing "successfully removed"
                    (is (empty? (-> rem-res :contents :transforms))))))
              (let [add-res (mt/user-http-request :crowberto :post 200
                                                  (str "ee/workspace/" (:id ws) "/contents")
                                                  {:add {:transforms [(:id x1)]}})]
                (testing "Successfully added"
                  (is (some? (-> add-res :contents :transforms (nth 0)))))
                (let [rem-res (mt/user-http-request :crowberto :post 200
                                                    (str "ee/workspace/" (:id ws) "/contents")
                                                    {:remove {:transforms [(-> add-res :contents :transforms (nth 0) :id)]}})]
                  (testing "successfully removed"
                    (is (empty? (-> rem-res :contents :transforms)))))))))
        (catch Throwable t
          (def ttt t)
          (throw t))
        (finally
          (teardown! @ws-id))))))
