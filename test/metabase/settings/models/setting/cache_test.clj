(ns metabase.settings.models.setting.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.models.setting-test :as setting-test]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; --------------------------------------------- Cache Synchronization ----------------------------------------------

(defn clear-cache! []
  (reset! (#'setting.cache/cache*) nil))

(defn- simulate-another-instance-updating-setting! [setting-name new-value]
  (if new-value
    (t2/update! :model/Setting {:key (name setting-name)} {:value new-value})
    (t2/delete! (t2/table-name :model/Setting) {:key (name setting-name)})))

(deftest restore-cache-test
  (testing "restore-cache! populates the cache from the DB"
    (clear-cache!)
    (is (nil? (setting.cache/cache)))
    (setting.cache/restore-cache!)
    (is (map? (setting.cache/cache)))))

(deftest broadcast-cache-invalidation-test
  (testing "broadcast-cache-invalidation! does not throw"
    (setting.cache/broadcast-cache-invalidation!)))

(deftest sync-via-restore-cache-test
  (testing "When another instance changes a setting, restore-cache! picks up the change"
    (clear-cache!)
    (setting-test/toucan-name! "Reggae Toucan")
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    (is (= "Bird Can"
           (t2/select-one-fn :value :model/Setting :key "toucan-name")))
    ;; Our cache still has the old value
    (is (= "Reggae Toucan"
           (setting-test/toucan-name)))
    ;; After restoring, we get the new value
    (setting.cache/restore-cache!)
    (is (= "Bird Can"
           (setting-test/toucan-name)))))

(deftest sync-locale-test
  (mt/discard-setting-changes [site-locale]
    (clear-cache!)
    (system/site-locale! "en")
    (simulate-another-instance-updating-setting! :site-locale "fr")
    (setting.cache/restore-cache!)
    (is (= "fr"
           (system/site-locale)))))
