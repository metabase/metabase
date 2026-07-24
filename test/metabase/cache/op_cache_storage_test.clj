(ns metabase.cache.op-cache-storage-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.cache.op-cache-storage :as op-cache-storage]
   [metabase.op-cache-impl.storage :as storage]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- do-with-key
  "Run `f` with a unique cache key (a byte array), deleting its row afterwards."
  [f]
  (let [k (byte-array (repeatedly 32 #(rand-int 256)))]
    (try
      (f k)
      (finally
        (t2/delete! :model/OpCacheEntry :cache_key (codecs/bytes->hex k))))))

(defn- entry-row [k]
  (t2/select-one [:model/OpCacheEntry :cache_key :written_at :claim_started_at] :cache_key (codecs/bytes->hex k)))

(deftest read-write-roundtrip-test
  (do-with-key
   (fn [k]
     (let [s (op-cache-storage/storage)]
       (testing "a missing key reads as no entry"
         (is (nil? (storage/read-entry s k))))
       (storage/write-entry! s k (.getBytes "hello cache" "UTF-8"))
       (testing "the stored value round-trips"
         (let [{:keys [value written-at]} (storage/read-entry s k)]
           (is (= "hello cache" (String. ^bytes value "UTF-8")))
           (is (some? written-at))))
       (testing "delete-entry! removes the entry"
         (storage/delete-entry! s k)
         (is (nil? (storage/read-entry s k))))))))

(deftest cold-miss-claim-test
  (do-with-key
   (fn [k]
     (let [s (op-cache-storage/storage)]
       (testing "the first claim on a missing key wins by inserting a claim-only row"
         (is (true? (storage/try-claim! s k (u/minutes->ms 5))))
         (is (some? (:claim_started_at (entry-row k)))))
       (testing "a claim-only row is not an entry"
         (is (nil? (storage/read-entry s k))))
       (testing "a concurrent claim loses"
         (is (false? (storage/try-claim! s k (u/minutes->ms 5)))))
       (testing "writing the value releases the claim"
         (storage/write-entry! s k (byte-array [1 2 3]))
         (is (nil? (:claim_started_at (entry-row k))))
         (is (some? (storage/read-entry s k))))))))

(deftest claim-on-existing-entry-test
  (do-with-key
   (fn [k]
     (let [s (op-cache-storage/storage)]
       (storage/write-entry! s k (byte-array [1]))
       (testing "the first claim on an existing entry wins, without touching written_at (regression: #76856 --
                 freshness, purging, and the EE refresh scheduler all read it as 'when the value was last written')"
         (let [written-at (:written_at (entry-row k))]
           (is (true? (storage/try-claim! s k (u/minutes->ms 5))))
           (is (= written-at (:written_at (entry-row k))))))
       (testing "a concurrent claim loses while the claim is live"
         (is (false? (storage/try-claim! s k (u/minutes->ms 5)))))
       (testing "an abandoned claim (older than the caller's tolerance) is taken over"
         (is (true? (storage/try-claim! s k -1))))))))

(deftest release-claim-test
  (do-with-key
   (fn [k]
     (let [s (op-cache-storage/storage)]
       (testing "releasing the claim on a valued entry keeps the value"
         (storage/write-entry! s k (byte-array [1]))
         (is (true? (storage/try-claim! s k (u/minutes->ms 5))))
         (storage/release-claim! s k)
         (is (nil? (:claim_started_at (entry-row k))))
         (is (some? (storage/read-entry s k)))
         (storage/delete-entry! s k))
       (testing "releasing the claim on a claim-only row removes the row entirely"
         (is (true? (storage/try-claim! s k (u/minutes->ms 5))))
         (storage/release-claim! s k)
         (is (nil? (entry-row k))))))))

(deftest keys-written-since-test
  (do-with-key
   (fn [old-k]
     (do-with-key
      (fn [new-k]
        (let [s (op-cache-storage/storage)]
          (storage/write-entry! s old-k (byte-array [1]))
          (t2/update! :model/OpCacheEntry (codecs/bytes->hex old-k)
                      {:written_at (t/minus (t/offset-date-time) (t/hours 2))})
          (storage/write-entry! s new-k (byte-array [2]))
          (let [ks (into #{} (map codecs/bytes->hex) (storage/keys-written-since s (t/minus (t/instant) (t/hours 1))))]
            (testing "keys written since the threshold are returned"
              (is (contains? ks (codecs/bytes->hex new-k))))
            (testing "keys written before the threshold are not"
              (is (not (contains? ks (codecs/bytes->hex old-k))))))))))))

(deftest purge-test
  (do-with-key
   (fn [old-k]
     (do-with-key
      (fn [fresh-k]
        (do-with-key
         (fn [abandoned-claim-k]
           (let [s      (op-cache-storage/storage)
                 cutoff (t/instant)]
             (storage/write-entry! s old-k (byte-array [1]))
             (t2/update! :model/OpCacheEntry (codecs/bytes->hex old-k)
                         {:written_at (t/minus (t/offset-date-time) (t/days 40))})
             (is (true? (storage/try-claim! s abandoned-claim-k (u/minutes->ms 5))))
             (t2/update! :model/OpCacheEntry (codecs/bytes->hex abandoned-claim-k)
                         {:claim_started_at (t/minus (t/offset-date-time) (t/days 40))})
             (storage/write-entry! s fresh-k (byte-array [2]))
             (storage/purge-entries-written-before! s cutoff)
             (testing "entries written before the cutoff are purged"
               (is (nil? (entry-row old-k))))
             (testing "abandoned claim-only rows at least as old as the cutoff are purged"
               (is (nil? (entry-row abandoned-claim-k))))
             (testing "entries written after the cutoff survive"
               (is (some? (storage/read-entry s fresh-k))))))))))))

(deftest stats-and-delete-all-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (let [s (op-cache-storage/storage)
          k1 (byte-array (map #(mod (+ % 3) 256) (range 32)))
          k2 (byte-array (map #(mod (+ % 5) 256) (range 32)))]
      (testing "an empty cache has zero entries and no average size"
        (is (= {:entries 0, :average-value-size nil}
               (storage/stats s))))
      (storage/write-entry! s k1 (byte-array 10))
      (storage/write-entry! s k2 (byte-array 20))
      ;; a claim-only row is not an entry and must not count
      (is (true? (storage/try-claim! s (byte-array (repeat 32 7)) (u/minutes->ms 5))))
      (testing "stats count only valued entries, averaging stored sizes"
        (let [{:keys [entries average-value-size]} (storage/stats s)]
          (is (= 2 entries))
          (is (some? average-value-size))))
      (testing "delete-all-entries! empties the cache"
        (storage/delete-all-entries! s)
        (is (= {:entries 0, :average-value-size nil}
               (storage/stats s)))))))

(defn- raw-value
  "The raw stored bytes of the single op_cache row, read straight from the table."
  ^bytes [^Connection conn]
  ;; H2 stores unquoted identifiers uppercased, and `value` is an H2 keyword, so it must be quoted here
  (-> (jdbc/query {:connection conn} "select \"VALUE\" from op_cache limit 1")
      first
      :value
      byte-array))

(deftest encryption-at-rest-test
  (testing "With no encryption key, values are stored as plain text"
    (encryption-test/with-secret-key nil
      (mt/with-temp-empty-app-db [conn :h2]
        (mdb/setup-db! :create-sample-content? false)
        (let [s (op-cache-storage/storage)]
          (storage/write-entry! s (codecs/to-bytes "cache-key") (codecs/to-bytes "cache-value"))
          (is (= "cache-value" (codecs/bytes->str (raw-value conn))))))))
  (testing "With an encryption key, values are stored encrypted"
    (encryption-test/with-secret-key "key1"
      (mt/with-temp-empty-app-db [conn :h2]
        (mdb/setup-db! :create-sample-content? false)
        (let [s (op-cache-storage/storage)]
          (storage/write-entry! s (codecs/to-bytes "cache-key") (codecs/to-bytes "cache-value"))
          (let [raw (codecs/bytes->str (raw-value conn))]
            (is (str/starts-with? raw "AES/CBC/PKCS5Padding"))
            (is (not (str/includes? raw "cache-value"))))
          (testing "and read back decrypted"
            (is (= "cache-value"
                   (codecs/bytes->str (:value (storage/read-entry s (codecs/to-bytes "cache-key"))))))))))))

(deftest concurrent-write-race-test
  (testing "Concurrent write-entry! calls with the same key should not violate the PK constraint (#73770)"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (let [k           (byte-array (map #(mod (+ % 13) 256) (range 32)))
            ;; Force both threads into the INSERT call simultaneously, so they both attempt to insert the same
            ;; primary key and the race is deterministically exercised.
            latch       (CountDownLatch. 2)
            insert-var  #'t2/insert!
            orig-insert @insert-var
            coordinated (fn [& args]
                          (when (= (first args) :model/OpCacheEntry)
                            (.countDown latch)
                            (.await latch 5 TimeUnit/SECONDS))
                          (apply orig-insert args))
            s           (op-cache-storage/storage)]
        (with-redefs-fn {insert-var coordinated}
          (fn []
            (mt/with-log-messages-for-level [messages :error]
              (mt/repeat-concurrently 2 #(storage/write-entry! s k (codecs/to-bytes "result-bytes")))
              (testing "both threads reached the coordination point (otherwise the race wasn't exercised)"
                (is (zero? (.getCount latch))))
              (testing "no \"Error saving value to cache\" should be logged"
                (is (empty? (filter #(some-> % :message (str/includes? "Error saving value to cache"))
                                    (messages)))))
              (testing "the value was stored"
                (is (= "result-bytes"
                       (codecs/bytes->str (:value (storage/read-entry s k)))))))))))))
