(ns metabase.embedding-rest.api.sdk-test
  "Tests for /api/embedding-sdk endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.embedding-rest.api.sdk :as api.sdk]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(defn- days-ago [n]
  (t/minus (t/offset-date-time) (t/days n)))

(deftest react-18-hosts-test
  (testing "GET /api/embedding-sdk/react-18-hosts"
    (mt/with-model-cleanup [:model/EmbeddingSdkReact18Host]
      (t2/delete! :model/EmbeddingSdkReact18Host)
      (t2/insert! :model/EmbeddingSdkReact18Host [{:host "old.example.com", :last_seen_at (days-ago 5)}
                                                  {:host "", :last_seen_at (days-ago 2)}
                                                  {:host "app.example.com", :last_seen_at (days-ago 1)}])
      (testing "returns the hosts seen in the last 4 days, newest first, with a null host for apps without one"
        (let [hosts (mt/user-http-request :crowberto :get 200 "embedding-sdk/react-18-hosts")]
          (is (=? [{:host "app.example.com"} {:host nil}] hosts))
          (is (= #{:id :host :created_at :last_seen_at} (set (keys (first hosts)))))))
      (testing "returns at most 50 hosts, the newest, the last inserted first when they were seen at the same time"
        (let [now (t/offset-date-time)]
          (t2/insert! :model/EmbeddingSdkReact18Host (for [i (range @#'api.sdk/max-hosts)]
                                                       {:host (str "host-" i ".example.com"), :last_seen_at now})))
        (is (= (for [i (reverse (range @#'api.sdk/max-hosts))]
                 (str "host-" i ".example.com"))
               (map :host (mt/user-http-request :crowberto :get 200 "embedding-sdk/react-18-hosts")))))
      (testing "non-admins cannot read it"
        (mt/user-http-request :rasta :get 403 "embedding-sdk/react-18-hosts"))
      (testing "anonymous requests cannot read it"
        (mt/client :get 401 "embedding-sdk/react-18-hosts")))))
