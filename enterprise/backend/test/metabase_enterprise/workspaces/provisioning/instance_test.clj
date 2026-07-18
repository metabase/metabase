(ns metabase-enterprise.workspaces.provisioning.instance-test
  "Tests for the instance-provisioning entry points using a stub
   [[provisioning.instance/InstanceProvisioner]] — no Harbormaster involved."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :once (fixtures/initialize :db))

(defn- stub-provisioner
  "An [[provisioning.instance/InstanceProvisioner]] whose behavior is overridable per test:
   `:create` replaces create! (defaults to returning a fixed id/url), `:delete`
   is called with the workspace passed to delete!."
  [& {:keys [create delete]}]
  (reify provisioning.instance/InstanceProvisioner
    (create! [_this workspace config]
      (if create
        (create workspace config)
        {:id "hm-instance-1" :url "https://child.example.com"}))
    (delete! [_this workspace]
      (when delete
        (delete workspace))
      nil)))

(deftest provision-instance!-persists-instance-test
  (testing "a successful create! persists instance_id/instance_url and returns the updated row"
    (mt/with-temp [:model/Workspace ws {:name "Deploy me"}]
      (let [updated (provisioning.instance/provision-instance! ws {:version 1} (stub-provisioner))]
        (is (= "hm-instance-1" (:instance_id updated)))
        (is (= "https://child.example.com" (:instance_url updated)))
        (is (= "hm-instance-1" (t2/select-one-fn :instance_id :model/Workspace :id (:id ws))))))))

(deftest provision-instance!-create-failure-test
  (testing "a failed create! propagates and leaves the row untouched"
    (mt/with-temp [:model/Workspace ws {:name "No deploy"}]
      (is (thrown-with-msg? ExceptionInfo #"HM says no"
                            (provisioning.instance/provision-instance!
                             ws {:version 1}
                             (stub-provisioner :create (fn [_ _] (throw (ex-info "HM says no" {})))))))
      (is (nil? (t2/select-one-fn :instance_id :model/Workspace :id (:id ws)))))))

(deftest provision-instance!-persist-failure-deletes-instance-test
  (testing "when persisting the id fails after a successful create!, the instance is deleted so it can't leak"
    (mt/with-temp [:model/Workspace ws {:name "Half deployed"}]
      (let [deleted (atom nil)]
        (with-redefs [t2/update! (fn [& _] (throw (ex-info "app DB down" {})))]
          (is (thrown-with-msg? ExceptionInfo #"app DB down"
                                (provisioning.instance/provision-instance!
                                 ws {:version 1}
                                 (stub-provisioner :delete #(reset! deleted %))))))
        (is (= "hm-instance-1" (:instance_id @deleted))
            "delete! is called with the just-created instance id")
        (is (nil? (t2/select-one-fn :instance_id :model/Workspace :id (:id ws))))))))

(deftest deprovision-instance!-clears-instance-test
  (testing "a successful delete! clears instance_id/instance_url and returns the updated row"
    (mt/with-temp [:model/Workspace ws {:name         "Undeploy me"
                                        :instance_id  "hm-instance-9"
                                        :instance_url "https://child.example.com"}]
      (let [deleted (atom nil)
            updated (provisioning.instance/deprovision-instance! ws (stub-provisioner :delete #(reset! deleted %)))]
        (is (= "hm-instance-9" (:instance_id @deleted))
            "delete! receives the workspace with its instance id")
        (is (nil? (:instance_id updated)))
        (is (nil? (:instance_url updated)))
        (is (nil? (t2/select-one-fn :instance_id :model/Workspace :id (:id ws))))))))

(deftest deprovision-instance!-failure-keeps-row-test
  (testing "a failed delete! propagates and keeps instance_id so the delete can be retried"
    (mt/with-temp [:model/Workspace ws {:name         "Sticky instance"
                                        :instance_id  "hm-instance-9"
                                        :instance_url "https://child.example.com"}]
      (is (thrown-with-msg? ExceptionInfo #"HM unreachable"
                            (provisioning.instance/deprovision-instance!
                             ws (stub-provisioner :delete (fn [_] (throw (ex-info "HM unreachable" {})))))))
      (is (= "hm-instance-9" (t2/select-one-fn :instance_id :model/Workspace :id (:id ws)))))))
