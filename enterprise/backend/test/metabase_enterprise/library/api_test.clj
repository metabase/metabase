(ns metabase-enterprise.library.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library.source :as source]
   [metabase-enterprise.library.source.protocol :as source.p]
   [metabase.test :as mt]))

(defn mock-git-source
  "Create a mock git source for testing"
  [& {:keys [branches error-on-branches?]
      :or {branches ["main" "develop"]}}]
  (reify source.p/LibrarySource
    (branches [_]
      (if error-on-branches?
        (throw (Exception. "Repository not found"))
        branches))
    (list-files [_ _] [])
    (read-file [_ _ _] "")
    (write-files! [_ _ _ _] nil)))

(deftest branches-endpoint-test
  (testing "GET /api/ee/library/branches"

    (testing "successful response with configured source"
      (with-redefs [source/source-from-settings (constantly (mock-git-source :branches ["main" "develop" "feature-branch"]))]
        (mt/user-http-request :crowberto :get 200 "ee/library/branches")
        (is (= {:items ["main" "develop" "feature-branch"]}
               (mt/user-http-request :crowberto :get 200 "ee/library/branches")))))

    (testing "requires superuser permissions"
      (with-redefs [source/source-from-settings (constantly (mock-git-source))]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/library/branches")))))

    (testing "error when git source not configured"
      (with-redefs [source/source-from-settings (constantly nil)]
        (let [response (mt/user-http-request :crowberto :get 400 "ee/library/branches")]
          (is (= {:status "error"
                  :message "Git source not configured. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}
                 response)))))

    (testing "error handling for git repository errors"
      (with-redefs [source/source-from-settings (constantly (mock-git-source :error-on-branches? true))]
        (let [response (mt/user-http-request :crowberto :get 400 "ee/library/branches")]
          (is (= {:status "error"
                  :message "Repository not found: Please check the repository URL"}
                 response)))))))
