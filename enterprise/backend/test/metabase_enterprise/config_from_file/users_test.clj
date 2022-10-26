(ns metabase-enterprise.config-from-file.users-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.config-from-file.core :as config-from-file]
   [metabase-enterprise.config-from-file.users :as config-from-file.users]
   [metabase.models :refer [User]]
   [metabase.util.password :as u.password]
   [toucan.db :as db]))

(deftest init-from-config-file-test
  (try
    (binding [config-from-file/*supported-versions* {:min 1, :max 1}
              config-from-file/*config*             {:version 1
                                                     :config  {:users [{:first_name "Cam"
                                                                        :last_name  "Era"
                                                                        :email      "cam+config-file-test@metabase.com"
                                                                        :password   "2cans"}]}}]
      (testing "Create a User if it does not already exist"
        (is (= :ok
               (config-from-file/initialize!)))
        (is (partial= {:first_name "Cam"
                       :last_name  "Era"
                       :email      "cam+config-file-test@metabase.com"}
                      (db/select-one User :email "cam+config-file-test@metabase.com")))
        (is (= 1
               (db/count User :email "cam+config-file-test@metabase.com"))))
      (testing "upsert if User already exists"
        (let [hashed-password          (fn [] (db/select-one-field :password User :email "cam+config-file-test@metabase.com"))
              salt                     (fn [] (db/select-one-field :password_salt User :email "cam+config-file-test@metabase.com"))
              original-hashed-password (hashed-password)]
          (binding [config-from-file/*config* {:version 1
                                               :config  {:users [{:first_name "Cam"
                                                                  :last_name  "Saul"
                                                                  :email      "cam+config-file-test@metabase.com"
                                                                  :password   "2cans"}]}}]
            (is (= :ok
                   (config-from-file/initialize!)))
            (is (= 1
                   (db/count User :email "cam+config-file-test@metabase.com")))
            (is (partial= {:first_name "Cam"
                           :last_name  "Saul"
                           :email      "cam+config-file-test@metabase.com"}
                          (db/select-one User :email "cam+config-file-test@metabase.com")))
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
      (db/delete! User :email "cam+config-file-test@metabase.com"))))

(deftest init-from-config-file-force-admin-for-first-user-test
  (testing "If this is the first user being created, always make the user a superuser regardless of what is specified"
    (try
      (binding [config-from-file/*supported-versions* {:min 1, :max 1}]
        (testing "Create the first User"
          (binding [config-from-file/*config* {:version 1
                                               :config  {:users [{:first_name   "Cam"
                                                                  :last_name    "Era"
                                                                  :email        "cam+config-file-admin-test@metabase.com"
                                                                  :password     "2cans"
                                                                  :is_superuser false}]}}]
            (with-redefs [config-from-file.users/init-from-config-file-is-first-user? (constantly true)]
              (is (= :ok
                     (config-from-file/initialize!)))
              (is (partial= {:first_name   "Cam"
                             :last_name    "Era"
                             :email        "cam+config-file-admin-test@metabase.com"
                             :is_superuser true}
                            (db/select-one User :email "cam+config-file-admin-test@metabase.com")))
              (is (= 1
                     (db/count User :email "cam+config-file-admin-test@metabase.com"))))))
        (testing "Create the another User, DO NOT force them to be an admin"
          (binding [config-from-file/*config* {:version 1
                                               :config  {:users [{:first_name   "Cam"
                                                                  :last_name    "Saul"
                                                                  :email        "cam+config-file-admin-test-2@metabase.com"
                                                                  :password     "2cans"
                                                                  :is_superuser false}]}}]
            (is (= :ok
                   (config-from-file/initialize!)))
            (is (partial= {:first_name   "Cam"
                           :last_name    "Saul"
                           :email        "cam+config-file-admin-test-2@metabase.com"
                           :is_superuser false}
                          (db/select-one User :email "cam+config-file-admin-test-2@metabase.com")))
            (is (= 1
                   (db/count User :email "cam+config-file-admin-test-2@metabase.com"))))))
      (finally (db/delete! User :email [:in #{"cam+config-file-admin-test@metabase.com"
                                              "cam+config-file-admin-test-2@metabase.com"}])))))

(deftest init-from-config-file-env-var-for-password-test
  (testing "Ensure that we can set User password using {{env ...}} templates"
    (try
      (binding [config-from-file/*supported-versions* {:min 1, :max 1}
                config-from-file/*config*             {:version 1
                                                       :config  {:users [{:first_name "Cam"
                                                                          :last_name  "Era"
                                                                          :email      "cam+config-file-password-test@metabase.com"
                                                                          :password   "{{env USER_PASSWORD}}"}]}}
                config-from-file/*env*                (assoc @#'config-from-file/*env* :user-password "1234cans")]
        (testing "Create a User if it does not already exist"
          (is (= :ok
                 (config-from-file/initialize!)))
          (let [user (db/select-one [User :first_name :last_name :email :password_salt :password]
                       :email "cam+config-file-password-test@metabase.com")]
            (is (partial= {:first_name "Cam"
                           :last_name  "Era"
                           :email      "cam+config-file-password-test@metabase.com"}
                          user))
            (is (u.password/verify-password "1234cans" (:password_salt user) (:password user))))))
      (finally
        (db/delete! User :email "cam+config-file-password-test@metabase.com")))))

(deftest ^:parallel init-from-config-file-validation-test
  (binding [config-from-file/*supported-versions* {:min 1, :max 1}]
    (are [user error-pattern] (thrown-with-msg?
                               clojure.lang.ExceptionInfo
                               error-pattern
                               (binding [config-from-file/*config* {:version 1
                                                                    :config  {:users [user]}}]
                                 (#'config-from-file/config)))
      ;; missing email
      {:first_name "Cam"
       :last_name  "Era"
       :password   "2cans"}
      (re-pattern (java.util.regex.Pattern/quote "failed: (contains? % :email)"))

      ;; missing first name
      {:last_name  "Era"
       :email      "cam+config-file-admin-test@metabase.com"
       :password   "2cans"}
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
      (re-pattern (java.util.regex.Pattern/quote "failed: (contains? % :password)")))))
