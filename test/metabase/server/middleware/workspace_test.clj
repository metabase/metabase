(ns metabase.server.middleware.workspace-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.server.middleware.workspace :as mw.workspace]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]))

(defn- call
  "The response of the [[mw.workspace/wrap-workspace]] middleware to a request with `headers`, from a superuser when
  `superuser?`, around a handler that answers with the workspace id it runs in."
  [superuser? headers]
  (let [handler (mw.workspace/wrap-workspace
                 (fn [_request respond _raise]
                   (respond {:status 200, :body (workspaces/current-workspace-id)})))
        result  (promise)]
    (binding [api/*is-superuser?* superuser?]
      (handler {:headers headers} #(deliver result %) #(deliver result %)))
    @result))

(deftest no-header-test
  (testing "a request with no header works in no workspace"
    (is (= {:status 200, :body nil} (call true {})))
    (is (= {:status 200, :body nil} (call false {})))))

(deftest header-binds-the-workspace-test
  (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (constantly nil)]
    (testing "a superuser's request runs in the workspace its header names"
      (is (= {:status 200, :body 12} (call true {"x-metabase-workspace-id" "12"}))))
    (testing "the binding ends with the request"
      (is (nil? (workspaces/current-workspace-id))))))

(deftest header-refused-test
  (mt/with-dynamic-fn-redefs [workspaces/request-workspace-problem (fn [workspace-id]
                                                                     (when (= 13 workspace-id) "No such workspace."))]
    (testing "only a superuser can name a workspace"
      (is (= 403 (:status (call false {"x-metabase-workspace-id" "12"})))))
    (testing "the header must be a positive integer"
      (doseq [value ["0" "-1" "abc" ""]]
        (is (= 400 (:status (call true {"x-metabase-workspace-id" value}))) value)))
    (testing "a workspace the request can't work in is refused with the reason"
      (is (= {:status 400, :body "No such workspace."}
             (select-keys (call true {"x-metabase-workspace-id" "13"}) [:status :body]))))))

(deftest oss-refuses-every-workspace-test
  (mt/with-premium-features #{}
    (testing "without workspaces, a request that names one is refused"
      (is (= 400 (:status (call true {"x-metabase-workspace-id" "12"})))))))

(deftest wired-into-the-api-test
  (testing "the API runs the middleware"
    (is (= "Only admins can choose a workspace."
           (mt/user-http-request :rasta :get 403 "user/current"
                                 {:request-options {:headers {"x-metabase-workspace-id" "12"}}})))))
