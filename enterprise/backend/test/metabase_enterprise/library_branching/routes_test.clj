(ns metabase-enterprise.library-branching.routes-test
  "The routes of library branching through HTTP: every route is for superusers only, and the repository and operation
  routes. The tasks and the saves commit their rows and change settings, so these tests are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.api]
   [metabase-enterprise.library-branching.repository-test-util :as rtu :refer [with-remote with-settings]]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tasks.tu]
   [metabase.api.macros :as api.macros]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private requests
  "A request of each route of the module: `{[method route] body}`. A body is valid, so that the route reaches its
  permission check."
  {[:get "/count"]                {}
   [:get "/manifest"]             {}
   [:get "/current-task"]         {}
   [:post "/current-task/cancel"] {}
   [:post "/test-connection"]     {}
   [:put "/settings"]             {:remote-sync-url ""}
   [:get "/branches"]             {}
   [:post "/push"]                {}
   [:post "/pull"]                {}
   [:post "/merge-branch"]        {:from "dev"}
   [:post "/deploy"]              {}})

(defn- module-routes []
  (set (map (comp vec (partial take 2)) (keys (api.macros/ns-routes 'metabase-enterprise.library-branching.api)))))

(defn- request [user method route expected-status body]
  (let [url (str "ee/library-branching" route)]
    (if (= :get method)
      (mt/user-http-request user method expected-status url)
      (mt/user-http-request user method expected-status url body))))

(deftest every-route-is-for-superusers-test
  (testing "the requests of this test cover every route of the module"
    (is (= (module-routes) (set (keys requests)))))
  (mt/with-premium-features #{:remote-sync}
    (tasks.tu/with-no-tasks
      (with-settings {:remote-sync-url "https://git.example.com/a.git" :remote-sync-branch "main"}
        (let [before (rtu/saved)]
          (doseq [[[method route] body] requests]
            (testing (str (name method) " " route)
              (is (= "You don't have permissions to do that." (request :rasta method route 403 body)))))
          (testing "nothing changed, and no task started"
            (is (= before (rtu/saved)))
            (is (nil? (tasks/newest-task)))))))))

(deftest repository-routes-need-a-repository-test
  (mt/with-premium-features #{:remote-sync}
    (with-settings {}
      (is (= "Library branching is not configured." (request :crowberto :post "/test-connection" 400 {})))
      (is (= "Library branching is not configured." (request :crowberto :get "/branches" 400 nil)))
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (doseq [[route body] [["/push" {}] ["/pull" {}] ["/merge-branch" {:from "dev"}]]]
          (testing route
            (is (= "Library branching is not configured." (request :crowberto :post route 400 body)))))))))

(deftest repository-routes-test
  (mt/with-premium-features #{:remote-sync}
    (with-remote [repo url]
      (rtu/remote-with-branches! repo ["main" "dev"])
      (tasks.tu/with-no-tasks
        (with-settings {}
          (testing "Test Connection of the URL of the form"
            (is (= {:status "success"} (request :crowberto :post "/test-connection" 200 {:remote-sync-url url}))))
          (testing "a save of the settings"
            (is (= {:success true} (request :crowberto :put "/settings" 200 {:remote-sync-url    url
                                                                             :remote-sync-branch ""})))
            (is (= [url "main"] (map setting/get [:remote-sync-url :remote-sync-branch]))))
          (testing "Test Connection of the saved settings"
            (is (= {:status "success"} (request :crowberto :post "/test-connection" 200 {}))))
          (testing "the branches of the repository"
            (is (= {:items ["dev" "main"]} (request :crowberto :get "/branches" 200 nil)))
            (rtu/commit-branch! repo "new")
            (is (= {:items ["dev" "main" "new"]} (request :crowberto :get "/branches" 200 nil))))
          (testing "a save refused by the check"
            (is (= "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)"
                   (request :crowberto :put "/settings" 400 {:remote-sync-url "asdf://foo/bar.git"}))))
          (testing "a save refused while a task runs"
            (let [running (tasks/start! "pull" nil)]
              (is (= "Library branching task in progress"
                     (request :crowberto :put "/settings" 400 {:remote-sync-branch "dev"})))
              (tasks/cancel! (:id running))))
          (testing "a repository that went away"
            (with-settings {:remote-sync-url "file:///no/such/library-branching/repository"}
              (is (= "Repository not found: Please check the repository URL"
                     (request :crowberto :get "/branches" 400 nil)))
              (is (= "Repository not found: Please check the repository URL"
                     (request :crowberto :post "/test-connection" 400 {}))))))))))

(deftest operation-routes-test
  (mt/with-premium-features #{:remote-sync}
    (with-remote [repo url]
      (rtu/remote-with-branches! repo ["main" "dev"])
      (tasks.tu/with-no-tasks
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (mt/with-temporary-setting-values [library-branching-enabled true]
            (rtu/with-synchronous-tasks
              (doseq [[route body kind] [["/push" {:message "From the API"} "push"]
                                         ["/pull" {} "pull"]
                                         ["/merge-branch" {:from "dev"} "merge-branch"]]]
                (testing route
                  (let [{:keys [task_id]} (request :crowberto :post route 200 body)]
                    (is (=? {:id task_id :task_type kind :initiated_by (mt/user->id :crowberto)}
                            (tasks/task task_id)))
                    (is (tasks/ended-statuses (:status (tasks/task task_id))))))))
            (testing "a start while a task runs"
              (let [running (tasks/start! "pull" nil)]
                (is (= "Library branching task in progress" (request :crowberto :post "/pull" 400 {})))
                (tasks/cancel! (:id running))))))))))
