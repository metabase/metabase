(ns metabase-enterprise.advanced-config.file.users-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase.models :refer [User]]
   [metabase.setup :as setup]
   [metabase.test :as mt]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (mt/with-premium-features #{:config-text-file}
                          (thunk)))))

(deftest init-from-config-file-test
  (try
    (binding [advanced-config.file/*config* {:version 1
                                             :config  {:users [{:first_name "Cam"
                                                                :last_name  "Era"
                                                                :email      "cam+config-file-test@metabase.com"
                                                                :password   "2cans"}]}}]
      (testing "Create a User if it does not already exist"
        (is (= :ok
               (advanced-config.file/initialize!)))
        (is (partial= {:first_name "Cam"
                       :last_name  "Era"
                       :email      "cam+config-file-test@metabase.com"}
                      (t2/select-one User :email "cam+config-file-test@metabase.com")))
        (is (= 1
               (t2/count User :email "cam+config-file-test@metabase.com"))))
      (testing "upsert if User already exists"
        (let [hashed-password          (fn [] (t2/select-one-fn :password User :email "cam+config-file-test@metabase.com"))
              salt                     (fn [] (t2/select-one-fn :password_salt User :email "cam+config-file-test@metabase.com"))
              original-hashed-password (hashed-password)]
          (binding [advanced-config.file/*config* {:version 1
                                                   :config  {:users [{:first_name "Cam"
                                                                      :last_name  "Saul"
                                                                      :email      "cam+config-file-test@metabase.com"
                                                                      :password   "2cans"}]}}]
            (is (= :ok
                   (advanced-config.file/initialize!)))
            (is (= 1
                   (t2/count User :email "cam+config-file-test@metabase.com")))
            (is (partial= {:first_name "Cam"
                           :last_name  "Saul"
                           :email      "cam+config-file-test@metabase.com"}
                          (t2/select-one User :email "cam+config-file-test@metabase.com")))
            (testing "Password should be hashed, but it should be a NEW HASH"
              (let [new-hashed-password (hashed-password)]
                (is (not= original-hashed-password
                          new-hashed-password))
                (testing "Password should not be saved as plaintext"
                  (is (not= "2cans"
                            new-hashed-password)))
                (testing "Password should work correctly"
                  (is (u.password/verify-password "2cans" (salt) new-hashed-password)))))))))
    (finally
      (t2/delete! User :email "cam+config-file-test@metabase.com"))))

(deftest init-from-config-file-force-admin-for-first-user-test
  (testing "If this is the first user being created, always make the user a superuser regardless of what is specified"
    (try
      (testing "Create the first User"
        (binding [advanced-config.file/*config* {:version 1
                                                 :config  {:users [{:first_name   "Cam"
                                                                    :last_name    "Era"
                                                                    :email        "cam+config-file-admin-test@metabase.com"
                                                                    :password     "2cans"
                                                                    :is_superuser false}]}}]
          (with-redefs [setup/has-user-setup (constantly false)]
            (is (= :ok
                   (advanced-config.file/initialize!)))
            (is (partial= {:first_name   "Cam"
                           :last_name    "Era"
                           :email        "cam+config-file-admin-test@metabase.com"
                           :is_superuser true}
                          (t2/select-one User :email "cam+config-file-admin-test@metabase.com")))
            (is (= 1
                   (t2/count User :email "cam+config-file-admin-test@metabase.com"))))))
      (testing "Create the another User, DO NOT force them to be an admin"
        (binding [advanced-config.file/*config* {:version 1
                                                 :config  {:users [{:first_name   "Cam"
                                                                    :last_name    "Saul"
                                                                    :email        "cam+config-file-admin-test-2@metabase.com"
                                                                    :password     "2cans"
                                                                    :is_superuser false}]}}]
          (is (= :ok
                 (advanced-config.file/initialize!)))
          (is (partial= {:first_name   "Cam"
                         :last_name    "Saul"
                         :email        "cam+config-file-admin-test-2@metabase.com"
                         :is_superuser false}
                        (t2/select-one User :email "cam+config-file-admin-test-2@metabase.com")))
          (is (= 1
                 (t2/count User :email "cam+config-file-admin-test-2@metabase.com")))))
      (finally (t2/delete! User :email [:in #{"cam+config-file-admin-test@metabase.com"
                                              "cam+config-file-admin-test-2@metabase.com"}])))))

(deftest init-from-config-file-env-var-for-password-test
  (testing "Ensure that we can set User password using {{env ...}} templates"
    (try
      (binding [advanced-config.file/*config* {:version 1
                                               :config  {:users [{:first_name "Cam"
                                                                  :last_name  "Era"
                                                                  :email      "cam+config-file-password-test@metabase.com"
                                                                  :password   "{{env USER_PASSWORD}}"}]}}
                advanced-config.file/*env*    (assoc @#'advanced-config.file/*env* :user-password "1234cans")]
        (testing "Create a User if it does not already exist"
          (is (= :ok
                 (advanced-config.file/initialize!)))
          (let [user (t2/select-one [User :first_name :last_name :email :password_salt :password]
                       :email "cam+config-file-password-test@metabase.com")]
            (is (partial= {:first_name "Cam"
                           :last_name  "Era"
                           :email      "cam+config-file-password-test@metabase.com"}
                          user))
            (is (u.password/verify-password "1234cans" (:password_salt user) (:password user))))))
      (finally
        (t2/delete! User :email "cam+config-file-password-test@metabase.com")))))

(deftest init-from-config-file-validation-test
  (are [user error-pattern] (thrown-with-msg?
                             clojure.lang.ExceptionInfo
                             error-pattern
                             (binding [advanced-config.file/*config* {:version 1
                                                                      :config  {:users [user]}}]
                               (#'advanced-config.file/config)))
    ;; missing email
    {:first_name "Cam"
     :last_name  "Era"
     :password   "2cans"}
    (re-pattern (java.util.regex.Pattern/quote "failed: (contains? % :email)"))

    ;; missing first name
    {:last_name "Era"
     :email     "cam+config-file-admin-test@metabase.com"
     :password  "2cans"}
    (re-pattern (java.util.regex.Pattern/quote "failed: (contains? % :first_name)"))

    ;; missing last name
    {:first_name "Cam"
     :email      "cam+config-file-admin-test@metabase.com"
     :password   "2cans"}
    (re-pattern (java.util.regex.Pattern/quote "failed: (contains? % :last_name)"))

    ;; missing password
    {:first_name "Cam"
     :last_name  "Era"
     :email      "cam+config-file-test@metabase.com"}
    (re-pattern (java.util.regex.Pattern/quote "failed: (contains? % :password)"))))
