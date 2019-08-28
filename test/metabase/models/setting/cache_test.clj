(ns metabase.models.setting.cache-test
  (:require [clojure.core.memoize :as memoize]
            [expectations :refer [expect]]
            [honeysql.core :as hsql]
            [metabase.db :as mdb]
            [metabase.models
             [setting :refer [Setting]]
             [setting-test :as setting-test]]
            [metabase.models.setting.cache :as cache]
            [toucan.db :as db]))

;;; --------------------------------------------- Cache Synchronization ----------------------------------------------

(defn- clear-cache! []
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
  (db/update-where! Setting {:key (name setting-name)} :value new-value)
  (update-settings-last-updated-value-in-db!))

(defn- flush-memoized-results-for-should-restore-cache!
  "Remove any memoized results for `should-restore-cache?`, so we can test `restore-cache-if-needed!` works the way we'd
  expect."
  []
  (memoize/memo-clear! @#'cache/should-restore-cache?))

;; When I update a Setting, does it set/update `settings-last-updated`?
(expect
  (do
    (setting-test/clear-settings-last-updated-value-in-db!)
    (setting-test/toucan-name "Bird Can")
    (string? (setting-test/settings-last-updated-value-in-db))))

;; ...and is the value updated in the cache as well?
(expect
  (do
    (clear-cache!)
    (setting-test/toucan-name "Bird Can")
    (string? (settings-last-updated-value-in-cache))))

;; ...and if I update it again, will the value be updated?
(expect
  (do
    (setting-test/clear-settings-last-updated-value-in-db!)
    (setting-test/toucan-name "Bird Can")
    (let [first-value (setting-test/settings-last-updated-value-in-db)]
      ;; MySQL only has the resolution of one second on the timestamps here so we should wait that long to make sure
      ;; the second-value actually ends up being greater than the first
      (Thread/sleep 1200)
      (setting-test/toucan-name "Bird Can")
      (let [second-value (setting-test/settings-last-updated-value-in-db)]
        ;; first & second values should be different, and first value should be "less than" the second value
        (and (not= first-value second-value)
             (neg? (compare first-value second-value)))))))

;; If there is no cache, it should be considered out of date!`
(expect
  (do
    (clear-cache!)
    (#'cache/cache-out-of-date?)))

;; But if I set a setting, it should cause the cache to be populated, and be up-to-date
(expect
  false
  (do
    (clear-cache!)
    (setting-test/toucan-name "Reggae Toucan")
    (#'cache/cache-out-of-date?)))

;; If another instance updates a Setting, `cache-out-of-date?` should return `true` based on DB comparisons...
;; be true!
(expect
  (do
    (clear-cache!)
    (setting-test/toucan-name "Reggae Toucan")
    (simulate-another-instance-updating-setting! :setting-test/toucan-name "Bird Can")
    (#'cache/cache-out-of-date?)))

;; of course, `restore-cache-if-needed!` should use TTL memoization, and the cache should not get updated right away
;; even if another instance updates a value...
(expect
  "Sam"
  (do
    (flush-memoized-results-for-should-restore-cache!)
    (clear-cache!)
    (setting-test/toucan-name "Sam")                 ; should restore cache, and put in {"setting-test/toucan-name" "Sam"}
    ;; since we cleared the memoized value of `should-restore-cache?` call it again to make sure it gets set to
    ;; `false` as it would IRL if we were calling it again from the same instance
    (#'cache/should-restore-cache?)
    ;; now have another instance change the value
    (simulate-another-instance-updating-setting! :setting-test/toucan-name "Bird Can")
    ;; our cache should not be updated yet because it's on a TTL
    (setting-test/toucan-name)))

;; ...and when it comes time to check our cache for updating (when calling `restore-cache-if-needed!`, it should get
;; the updated value. (we're not actually going to wait a minute for the memoized values of `should-restore-cache?` to
;; be invalidated, so we will manually flush the memoization cache to simulate it happening)
(expect
  "Bird Can"
  (do
    (clear-cache!)
    (setting-test/toucan-name "Reggae Toucan")
    (simulate-another-instance-updating-setting! :setting-test/toucan-name "Bird Can")
    (flush-memoized-results-for-should-restore-cache!)
    ;; calling `setting-test/toucan-name` will call `restore-cache-if-needed!`, which will in turn call `should-restore-cache?`.
    ;; Since memoized value is no longer present, this should call `cache-out-of-date?`, which checks the DB; it will
    ;; detect a cache out-of-date situation and flush the cache as appropriate, giving us the updated value when we
    ;; call! :wow:
    (setting-test/toucan-name)))
