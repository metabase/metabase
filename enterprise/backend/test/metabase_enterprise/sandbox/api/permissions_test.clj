(ns metabase-enterprise.sandbox.api.permissions-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- id->keyword [id]
  (keyword (str (u/the-id id))))

(defn- db-graph-keypath [group]
  [:groups (id->keyword group) (id->keyword (mt/id))])

(defn- venues-perms-graph-keypath [group]
  (concat
   (db-graph-keypath group)
   [:schemas :PUBLIC (id->keyword (mt/id :venues))]))

(deftest graph-update-should-delete-gtaps-test
  (testing "PUT /api/permissions/graph"
    (testing "removing sandboxed permissions for a group should delete the associated GTAP (#16190)"
      (doseq [[message {:keys [updated-db-perms expected-perms]}]
              {"when revoking all permissions for DB"
               {:updated-db-perms (constantly {:native :none, :schemas :none})
                :expected-perms   (constantly nil)}

               "when revoking all permissions for schema"
               {:updated-db-perms (constantly {:native :none, :schemas {:PUBLIC :none}})
                :expected-perms   (constantly nil)}

               "when revoking all permissions for Table"
               {:updated-db-perms (fn []
                                    {:native :none, :schemas {:PUBLIC {(id->keyword (mt/id :venues)) :none
                                                                       (id->keyword (mt/id :users))  :all}}})
                :expected-perms   (fn []
                                    {:schemas {:PUBLIC {(id->keyword (mt/id :users)) "all"}}})}

               "when revoking segmented query permissions for Table"
               {:updated-db-perms (fn []
                                    {:native :none, :schemas {:PUBLIC {(id->keyword (mt/id :venues)) {:read :all}}}})
                :expected-perms   (fn []
                                    {:schemas {:PUBLIC {(id->keyword (mt/id :venues)) {:read "all"}}}})}

               "when changing permissions for DB to unrestricted access"
               {:updated-db-perms (constantly {:native :none, :schemas :all})
                :expected-perms   (constantly {:schemas "all"})}

               "when changing permissions for schema to unrestricted access"
               {:updated-db-perms (constantly {:native :none, :schemas {:PUBLIC :all}})
                :expected-perms   (constantly {:schemas {:PUBLIC "all"}})}

               "when changing permissions for Table to :query [grant full query perms]"
               {:updated-db-perms (fn []
                                    {:native :none, :schemas {:PUBLIC {(id->keyword (mt/id :venues)) {:query :all}}}})
                :expected-perms   (fn []
                                    {:schemas {:PUBLIC {(id->keyword (mt/id :venues)) {:query "all"}}}})}}]
        (mt/with-gtaps {:gtaps {:venues {}}}
          (testing message
            (testing "sanity check"
              (testing "perms graph endpoint should return segmented perms for Venues table"
                (is (= {:query "segmented"}
                       (get-in (mt/user-http-request :crowberto :get 200 "permissions/graph")
                               (venues-perms-graph-keypath &group)))))
              (testing "GTAP should exist in application DB"
                (is (schema= [(s/one {:id                   su/IntGreaterThanZero
                                      :group_id             (s/eq (u/the-id &group))
                                      :table_id             (s/eq (mt/id :venues))
                                      :card_id              (s/eq nil)
                                      :attribute_remappings (s/eq nil)
                                      s/Keyword             s/Any}
                                     "GTAP")]
                             (db/select GroupTableAccessPolicy :group_id (u/the-id &group))))))
            (let [graph    (mt/user-http-request :crowberto :get 200 "permissions/graph")
                  graph'   (assoc-in graph (db-graph-keypath &group) (updated-db-perms))
                  response (mt/user-http-request :crowberto :put 200 "permissions/graph" graph')]
              (testing "perms graph should be updated"
                (testing "in API request response"
                  (is (= (expected-perms)
                         (get-in response (db-graph-keypath &group)))))
                (testing "on subsequent fetch of the graph"
                  (is (= (expected-perms)
                         (get-in (mt/user-http-request :crowberto :get 200 "permissions/graph")
                                 (db-graph-keypath &group))))))
              (testing "GTAP should be deleted from application DB"
                (is (= []
                       (db/select GroupTableAccessPolicy :group_id (u/the-id &group))))))))))))
