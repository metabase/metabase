(ns metabase.encryption.migrate-encrypted-settings-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.encryption.impl :as encryption.impl]
   [metabase.encryption.impl-test :as encryption-test]
   [metabase.encryption.migrate-encrypted-settings :as mes]
   [metabase.settings.core :refer [defsetting]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defsetting test-never-encrypted-setting
  "Setting to test the `:encryption` property of settings. This only shows up in dev."
  :visibility :internal
  :type       :string
  :encryption :no
  :feature    :test-feature)

(defn- actual-value-in-db [k]
  (t2/select-one-fn :value :setting :key (name k)))

(deftest migrate-encrypted-settings!-works
  (mt/with-premium-features #{:test-feature}
    (testing "It works when a secret key is set"
      (encryption-test/with-secret-key "ABCDEFGH12345678"
        (t2/delete! :model/Setting :key "test-never-encrypted-setting")
        (t2/insert! :setting {:key "test-never-encrypted-setting" :value (encryption.impl/maybe-encrypt "foobar")})
        ;; Sanity check: the value is encrypted
        (is (not= "foobar" (actual-value-in-db :test-never-encrypted-setting)))
        (mes/migrate-encrypted-settings!)
        (is (= "foobar" (actual-value-in-db :test-never-encrypted-setting)))
        (mes/migrate-encrypted-settings!)
        (is (= "foobar" (actual-value-in-db :test-never-encrypted-setting))))))
  (testing "It doesn't do anything when the secret key is not set"
    (encryption-test/with-secret-key "ABCDEFGH12345678"
      (t2/delete! :model/Setting :key "test-never-encrypted-setting")
      (t2/insert! :setting {:key "test-never-encrypted-setting" :value (encryption.impl/maybe-encrypt "foobar")}))
    (encryption-test/with-secret-key nil
      (is (not= "foobar" (actual-value-in-db :test-never-encrypted-setting)))
      (mes/migrate-encrypted-settings!)
      (is (not= "foobar" (actual-value-in-db :test-never-encrypted-setting))))))
