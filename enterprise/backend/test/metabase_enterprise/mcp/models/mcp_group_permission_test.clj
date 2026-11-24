(ns metabase-enterprise.mcp.models.mcp-group-permission-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.mcp.test-util :as mcp.tu]
   [metabase.events.test-util :as events.tu]
   [metabase.mcp.models.mcp-group-permission :as mcp-group-permission]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- row
  [group-id enabled?]
  {:group_id group-id :mcp_enabled enabled? :tool_access {}})

(deftest upsert-statement-counts-do-not-grow-with-rows-test
  (mcp.tu/with-group-level-mode
    (mt/with-temp [:model/PermissionsGroup {a :id} {}
                   :model/PermissionsGroup {b :id} {}
                   :model/PermissionsGroup {c :id} {}
                   :model/PermissionsGroup {d :id} {}
                   :model/PermissionsGroup {e :id} {}
                   :model/PermissionsGroup {f :id} {}
                   :model/PermissionsGroup {g :id} {}
                   :model/PermissionsGroup {h :id} {}
                   :model/PermissionsGroup {i :id} {}]
      (testing "setting the permissions of groups, some with a row in another state and some with none"
        (mcp-group-permission/upsert-mcp-group-permissions! [(row a true) (row b false)])
        (mcp-group-permission/upsert-mcp-group-permissions! [(row d true) (row e true) (row f false) (row g false)])
        (let [counted (fn [& group-ids]
                        (events.tu/statement-count!
                         #(mcp-group-permission/upsert-mcp-group-permissions! (mapv (fn [id] (row id true)) group-ids))))
              small   (counted a b c)
              large   (counted d e f g h i)]
          (is (= small large))
          (is (= #{true} (t2/select-fn-set :mcp_enabled :model/McpGroupPermission :group_id [:in [a b c d e f g h i]]))))))))

(deftest create-missing-statement-counts-do-not-grow-with-rows-test
  (mcp.tu/with-group-level-mode
    (mt/with-temp [:model/PermissionsGroup {a :id} {}
                   :model/PermissionsGroup {b :id} {}
                   :model/PermissionsGroup {c :id} {}
                   :model/PermissionsGroup {d :id} {}
                   :model/PermissionsGroup {e :id} {}
                   :model/PermissionsGroup {f :id} {}
                   :model/PermissionsGroup {g :id} {}
                   :model/PermissionsGroup {h :id} {}]
      (mcp-group-permission/upsert-mcp-group-permissions! [(row a true) (row c true) (row d true)])
      (let [counted (fn [& group-ids]
                      (events.tu/statement-count!
                       #(mcp-group-permission/create-missing-mcp-group-permissions! (mapv (fn [id] (row id true)) group-ids))))
            small   (counted a b)
            large   (counted c d e f g h)]
        (is (= small large))
        (is (= 8 (t2/count :model/McpGroupPermission :group_id [:in [a b c d e f g h]])))))))
