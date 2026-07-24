(ns metabase.metabot.tools.settings-admin-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.metabot.agent.user-context :as user-context]
   [metabase.metabot.context :as context]
   [metabase.metabot.tools.settings-admin :as settings-admin]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(deftest admin-settings-context-entry-test
  (testing "an admin_settings viewing-context item validates and renders its section and path"
    (let [item {:type "admin_settings" :section "Email" :path "/admin/settings/email"}]
      (is (mc/validate context/ViewingItemSchema item))
      (let [rendered (user-context/format-entity item)]
        (is (re-find #"Email" rendered))
        (is (re-find #"/admin/settings/email" rendered))))))

(deftest non-superuser-is-refused-test
  (testing "admin settings tools throw for non-superusers"
    (mt/with-current-user (mt/user->id :rasta)
      (is (thrown? clojure.lang.ExceptionInfo
                   (settings-admin/list-settings-tool {})))
      (is (thrown? clojure.lang.ExceptionInfo
                   (settings-admin/get-setting-tool {:key "site-name"})))
      (is (thrown? clojure.lang.ExceptionInfo
                   (settings-admin/update-setting-tool {:key "site-name" :value "Nope"}))))))

(deftest sensitive-setting-is-refused-test
  (testing "secret settings cannot be read or updated"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [get-result    (settings-admin/get-setting-tool {:key "premium-embedding-token"})
            update-result (settings-admin/update-setting-tool {:key "premium-embedding-token" :value "x"})]
        (is (nil? (:structured-output get-result)))
        (is (re-find #"secret or internal" (:output get-result)))
        (is (nil? (:structured-output update-result)))
        (is (re-find #"secret or internal" (:output update-result)))))))

(deftest read-only-setting-is-refused-for-update-test
  (testing "a setting whose :setter is :none cannot be updated"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [result (settings-admin/update-setting-tool {:key "bug-reporting-enabled" :value true})]
        (is (nil? (:structured-output result)))
        (is (re-find #"read-only" (:output result)))))))

(deftest env-backed-setting-is-refused-for-update-test
  (testing "a setting backed by an environment variable cannot be updated"
    (mt/with-current-user (mt/user->id :crowberto)
      (with-redefs [setting/env-var-value (fn [_] "from-env")]
        (let [result (settings-admin/update-setting-tool {:key "site-name" :value "New Name"})]
          (is (nil? (:structured-output result)))
          (is (re-find #"environment variable" (:output result))))))))

(deftest unknown-setting-is-refused-test
  (testing "an unknown setting key is refused with an LLM-readable message"
    (mt/with-current-user (mt/user->id :crowberto)
      (is (re-find #"no setting named"
                   (:output (settings-admin/get-setting-tool {:key "does-not-exist"}))))
      (is (re-find #"no setting named"
                   (:output (settings-admin/update-setting-tool {:key "does-not-exist" :value 1})))))))

(deftest update-and-revert-round-trip-test
  (testing "update returns the previous value and the revert action restores it"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/discard-setting-changes [site-name]
        (let [original (setting/get :site-name)
              result   (settings-admin/update-setting-tool {:key "site-name" :value "Changed Name"})
              output   (:structured-output result)]
          (is (= original (:previous_value output)))
          (is (= "Changed Name" (:new_value output)))
          (is (= "Changed Name" (setting/get :site-name)))
          (is (= {:tool "update_setting" :args {:key "site-name" :value original}}
                 (:reverted_with output)))
          (testing "replaying the revert action restores the original value"
            (settings-admin/update-setting-tool (:args (:reverted_with output)))
            (is (= original (setting/get :site-name)))))))))

(deftest list-settings-excludes-sensitive-and-respects-search-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "sensitive settings are never listed"
      (let [keys (->> (settings-admin/list-settings-tool {:limit 100})
                      :structured-output :settings (map :key) set)]
        (is (not (contains? keys "premium-embedding-token")))))
    (testing "search filters by key/description substring"
      (let [rows (->> (settings-admin/list-settings-tool {:search "site-name"})
                      :structured-output :settings)]
        (is (some #(= "site-name" (:key %)) rows))
        (is (every? (fn [{:keys [key description]}]
                      (or (re-find #"(?i)site-name" key)
                          (re-find #"(?i)site-name" (or description ""))))
                    rows))))
    (testing "limit caps results and flags when capped"
      (let [result (settings-admin/list-settings-tool {:limit 1})
            output (:structured-output result)]
        (is (= 1 (:returned output)))
        (is (= 1 (count (:settings output))))
        (is (true? (:capped? output)))
        (is (< 1 (:total output)))))))
