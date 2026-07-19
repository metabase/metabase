(ns ^:synchronous metabase-enterprise.workspaces.provisioning.instance-test
  "Tests for the Harbormaster-backed [[provisioning.instance/instance-provisioner]].
   [[hm.client/make-request]] is stubbed with `with-redefs` — no test talks to a
   real Harbormaster."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase-enterprise.workspaces.provisioning.instance :as provisioning.instance]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private provisioner provisioning.instance/instance-provisioner)

(defn- ok [body] [:ok {:status 200, :body body}])

(defn- hm-error [status] [:error {:ex-data {:status status, :body "nope"}}])

(deftest create!-test
  (testing "create! posts the workspace config and returns the abstract instance"
    (mt/with-temp [:model/Workspace ws {:name "WS"}]
      (let [request (atom nil)]
        (with-redefs [hm.client/make-request (fn [method url body]
                                               (reset! request {:method method, :url url, :body body})
                                               (ok {:id 123, :url nil, :status "creating"}))]
          (is (= {:id "123", :url nil, :status :creating}
                 (provisioning.instance/create! provisioner ws {:version 1, :config {}}))))
        (is (=? {:method :post
                 :url    "/api/v2/mb/workspaces/instances"
                 :body   {:name       "WS"
                          :metadata   {:parent-instance string?
                                       :workspace-id    (:id ws)}
                          :mb-version some?
                          :config-yml #"(?s).*version: 1.*"}}
                @request))))))

(deftest create!-failure-test
  (testing "an HM refusal surfaces as an exception"
    (mt/with-temp [:model/Workspace ws {:name "WS"}]
      (with-redefs [hm.client/make-request (fn [_ _ _] (hm-error 503))]
        (is (thrown-with-msg? ExceptionInfo #"failed to create"
                              (provisioning.instance/create! provisioner ws {})))))))

(deftest fetch-status-mapping-test
  (testing "fetch keywordizes the HM status directly"
    (doseq [[hm-status expected] {"creating" :creating
                                  "active"   :active
                                  "error"    :error}]
      (with-redefs [hm.client/make-request (fn [method url & _]
                                             (is (= :get method))
                                             (is (= "/api/v2/mb/workspaces/instances/i-1" url))
                                             (ok {:id "i-1", :url "https://child.example.com", :status hm-status}))]
        (is (= expected (:status (provisioning.instance/fetch provisioner "i-1")))
            (str hm-status)))))
  (testing "an HM failure surfaces as an exception"
    (with-redefs [hm.client/make-request (fn [& _] (hm-error 500))]
      (is (thrown-with-msg? ExceptionInfo #"failed to fetch"
                            (provisioning.instance/fetch provisioner "i-1"))))))

(deftest delete!-test
  (testing "delete! is idempotent: 404 counts as success"
    (doseq [reply [(ok {}) (hm-error 404)]]
      (with-redefs [hm.client/make-request (fn [method url & _]
                                             (is (= :delete method))
                                             (is (= "/api/v2/mb/workspaces/instances/i-1" url))
                                             reply)]
        (is (nil? (provisioning.instance/delete! provisioner "i-1"))))))
  (testing "any other failure surfaces as an exception"
    (with-redefs [hm.client/make-request (fn [& _] (hm-error 500))]
      (is (thrown-with-msg? ExceptionInfo #"failed to delete"
                            (provisioning.instance/delete! provisioner "i-1"))))))

(deftest provision-instance!-end-to-end-test
  (testing "provision-instance! creates via HM, polls until :active, and persists the final url"
    (mt/with-temp [:model/Workspace {ws-id :id :as ws} {:name "WS"}]
      (with-redefs [provisioning.instance/instance-poll-interval-ms 1
                    hm.client/make-request
                    (fn [method _url & _]
                      (case method
                        :post (ok {:id "i-9", :url nil, :status "creating"})
                        :get  (ok {:id "i-9", :url "https://child.example.com", :status "active"})))]
        (is (=? {:instance_id "i-9", :instance_url "https://child.example.com"}
                (provisioning.instance/provision-instance! ws))))
      (is (=? {:instance_id "i-9", :instance_url "https://child.example.com"}
              (t2/select-one :model/Workspace :id ws-id))
          "the url reported by the running instance is persisted"))))
