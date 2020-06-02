(ns metabase.models.setting.cache-test
  (:require [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [public-settings :as public-settings]
             [test :as mt]]
            [metabase.models
             [setting :refer [Setting]]
             [setting-test :as setting-test]]
            [metabase.models.setting.cache :as cache]
            [metabase.test.fixtures :as fixtures]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

;;; --------------------------------------------- Cache Synchronization ----------------------------------------------

(defn clear-cache! []
  (reset! @#'metabase.models.setting.cache/cache* nil))

(defn- settings-last-updated-value-in-cache []
  (get (cache/cache) cache/settings-last-updated-key))

(defn- update-settings-last-updated-value-in-db!
  "Simulate a different instance updating the value of `settings-last-updated` in the DB by updating its value without
  updating our locally cached value.."
  []
  (db/update-where! Setting {:key cache/settings-last-updated-key}
    :value (hsql/raw (case (mdb/db-type)
                       ;; make it one second in the future so we don't end up getting an exact match when we try to test
                       ;; to see if things update below
                       :h2       "cast(dateadd('second', 1, current_timestamp) AS text)"
                       :mysql    "cast((current_timestamp + interval 1 second) AS char)"
                       :postgres "cast((current_timestamp + interval '1 second') AS text)"))))

(defn- simulate-another-instance-updating-setting! [setting-name new-value]
  (if new-value
    (db/update-where! Setting {:key (name setting-name)} :value new-value)
    (db/simple-delete! Setting {:key (name setting-name)}))
  (update-settings-last-updated-value-in-db!))

(defn reset-last-update-check!
  "Reset the value of `last-update-check` so the next cache access will check for updates."
  []
  (reset! (var-get #'cache/last-update-check) 0))

(deftest update-settings-last-updated-test
  (testing "When I update a Setting, does it set/update `settings-last-updated`?"
    (setting-test/clear-settings-last-updated-value-in-db!)
    (setting-test/toucan-name "Bird Can")
    (is (string? (setting-test/settings-last-updated-value-in-db)))

    (testing "...and is the value updated in the cache as well?"
      (is (string? (settings-last-updated-value-in-cache))))

    (testing "..and if I update it again, will the value be updated?"
      (let [first-value (setting-test/settings-last-updated-value-in-db)]
        ;; MySQL only has the resolution of one second on the timestamps here so we should wait that long to make sure
        ;; the second-value actually ends up being greater than the first
        (Thread/sleep (if (= (mdb/db-type) :mysql) 1200 50))
        (setting-test/toucan-name "Bird Can")
        (let [second-value (setting-test/settings-last-updated-value-in-db)]
          ;; first & second values should be different, and first value should be "less than" the second value
          (is (not= first-value second-value))
          (is (neg? (compare first-value second-value))))))))

(deftest cache-out-of-date-test
  (testing "If there is no cache, it should be considered out of date!"
    (clear-cache!)
    (#'cache/cache-out-of-date?))

  (testing "But if I set a setting, it should cause the cache to be populated, and be up-to-date"
    (clear-cache!)
    (setting-test/toucan-name "Reggae Toucan")
    (is (= false
           (#'cache/cache-out-of-date?))))

  (testing "If another instance updates a Setting, `cache-out-of-date?` should return `true` based on DB comparisons..."
    (clear-cache!)
    (setting-test/toucan-name "Reggae Toucan")
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    (is (= true
           (#'cache/cache-out-of-date?)))))

(deftest restore-cache-if-needed-test
  (testing (str "of course, `restore-cache-if-needed!` should use TTL memoization, and the cache should not get "
                "updated right away even if another instance updates a value...")
    (reset-last-update-check!)
    (clear-cache!)
    (setting-test/toucan-name "Sam")
    ;; should restore cache, and put in {"setting-test/toucan-name" "Sam"}
    (is (= "Sam"
           (setting-test/toucan-name)))
    ;; now have another instance change the value
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    ;; our cache should not be updated yet because it's on a TTL
    (is (= "Sam"
           (setting-test/toucan-name)))))

;; ...and when it comes time to check our cache for updating (when calling `restore-cache-if-needed!`, it should get
;; the updated value. (we're not actually going to wait a minute for the memoized values of `should-restore-cache?` to
;; be invalidated, so we will manually flush the memoization cache to simulate it happening)
(deftest sync-test-1
  (clear-cache!)
  (setting-test/toucan-name "Reggae Toucan")
  (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
  (is (= "Bird Can"
         (db/select-one-field :value Setting :key "toucan-name")))
  (reset-last-update-check!)
  ;; calling `setting-test/toucan-name` will call `restore-cache-if-needed!`, which will in turn call `should-restore-cache?`.
  ;; Since memoized value is no longer present, this should call `cache-out-of-date?`, which checks the DB; it will
  ;; detect a cache out-of-date situation and flush the cache as appropriate, giving us the updated value when we
  ;; call! :wow:
  (is (= "Bird Can"
         (setting-test/toucan-name))))

;; Simulate experience where:
;; 1. User writes a setting on Server 1
;; 2. User reads settings, served from Server 1, memoizing theresult of should-restore-cache?
;; 3. User writes setting :toucan-name on Server 2
;; 4. User writes setting on Server 1
;; 5. User reads setting :toucan-name from Server 1
;;
;; This process was causing the updated `:toucan-name` to never be read on Server 1 because Server 1 "thought" it had
;; the latest values and didn't restore the cache from the db
(deftest sync-test-2
  (let [internal-cache @#'metabase.models.setting.cache/cache*
        external-cache (atom nil)]
    (clear-cache!)
    (reset-last-update-check!)
    (setting-test/test-setting-1 "Starfish")
    ;; 1. User writes
    (with-redefs [metabase.models.setting.cache/cache* external-cache]
      (setting-test/toucan-name "Batman Toucan"))
    (setting-test/test-setting-1 "Batman")
    (is (= "Batman Toucan"
           (setting-test/toucan-name)))))

(deftest sync-test-3
  (mt/discard-setting-changes [site-locale]
    (clear-cache!)
    (public-settings/site-locale "en")
    (simulate-another-instance-updating-setting! :site-locale "fr")
    (reset-last-update-check!)
    (is (= "fr"
           (public-settings/site-locale)))))
