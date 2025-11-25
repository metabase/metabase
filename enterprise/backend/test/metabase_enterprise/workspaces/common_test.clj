(ns ^:mb/driver-tests metabase-enterprise.workspaces.common-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest testing is]]
   [medley.core :as m]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.workspaces.common :as ws.common]
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
        dup-tables-ids (into #{}
                             (map #(-> % :mapping :id))
                             (-> ws-graph :outputs))]
    (t2/delete! :model/Table :id [:in dup-tables-ids])
    (t2/delete! :model/Workspace :id ws-id)
    (jdbc/execute! spec (format "DROP SCHEMA IF EXISTS %s CASCADE" ws-schema))))

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

