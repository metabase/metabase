(ns ^:synchronous metabase-enterprise.workspaces.provisioning.instance-test
  "Tests for the Harbormaster-backed [[provisioning.instance/instance-provisioner]].
   [[hm.client/make-request]] is stubbed with `with-redefs` — no test talks to a
   real Harbormaster."
  (:require
   [clojure.string :as str]
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

(deftest provision-instance!-reuses-active-instance-test
  (testing "an existing :active instance is reused — no create, no delete, url refreshed"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS" :instance_id "i-old"}]
      (let [calls (atom [])]
        (with-redefs [hm.client/make-request
                      (fn [method url & _]
                        (swap! calls conj [method url])
                        (case method
                          :get (ok {:id "i-old", :url "https://old.example.com", :status "active"})))]
          (is (=? {:instance_id "i-old", :instance_url "https://old.example.com"}
                  (provisioning.instance/provision-instance!
                   (t2/select-one :model/Workspace :id ws-id)))))
        (is (= [[:get "/api/v2/mb/workspaces/instances/i-old"]] @calls)
            "only the fetch went out — the instance was neither created nor deleted")
        (is (=? {:instance_id "i-old", :instance_url "https://old.example.com"}
                (t2/select-one :model/Workspace :id ws-id)))))))

(deftest provision-instance!-recreates-dead-instance-test
  (testing "an existing instance that lands anywhere but :active is deleted and recreated"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS" :instance_id "i-dead"}]
      (let [deleted (atom nil)]
        (with-redefs [provisioning.instance/instance-poll-interval-ms 1
                      hm.client/make-request
                      (fn [method url & _]
                        (case method
                          :get    (if (str/ends-with? url "/i-dead")
                                    (ok {:id "i-dead", :url nil, :status "error"})
                                    (ok {:id "i-new", :url "https://new.example.com", :status "active"}))
                          :delete (do (reset! deleted url) (ok {}))
                          :post   (ok {:id "i-new", :url nil, :status "creating"})))]
          (provisioning.instance/provision-instance!
           (t2/select-one :model/Workspace :id ws-id)))
        (is (= "/api/v2/mb/workspaces/instances/i-dead" @deleted)
            "the dead instance was deleted before recreating"))
      (is (=? {:instance_id "i-new", :instance_url "https://new.example.com"}
              (t2/select-one :model/Workspace :id ws-id))))))
