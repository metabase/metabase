(ns metabase.cmd.envelope-encryption-test
  "Command-level integration tests for local envelope encryption (KEK/DEK), against a real test application database.
  Complements `metabase.cmd.rotate-encryption-key-test` (legacy-format prior art) with the envelope-specific
  behaviors: legacy->v2 upgrade on first rotation, second rotation touching only the DEK table, mint-new-DEK, deep
  re-encryption, and remove-encryption on a mixed-format database.

  Like the rotate-encryption-key command tests, the integration tests here run across the app-DB drivers (H2 plus
  Postgres/MySQL on CI) via `mt/test-drivers` + `mt/with-temp-empty-app-db`; drivers that are unavailable locally are
  simply skipped."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.deep-reencrypt :refer [deep-reencrypt!]]
   [metabase.cmd.mint-encryption-dek :refer [mint-encryption-dek!]]
   [metabase.cmd.remove-encryption :refer [remove-encryption!]]
   [metabase.cmd.rotate-encryption-key :refer [rotate-encryption-key!]]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.encryption.dek :as dek]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defn- clear-dek-cache-fixture!
  "Drop any process-cached unwrapped DEK material after this namespace's temp app DBs are gone. The cache is keyed by
  application-DB identity so it never collides across DBs, but clearing keeps the process tidy for later tests."
  [thunk]
  (try (thunk) (finally (dek/clear-cache!))))

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :once (fixtures/initialize :db) clear-dek-cache-fixture!)

(def ^:private app-db-drivers
  "App-DB drivers the integration tests parameterize over. Same prior art as the rotate-encryption-key command tests;
  unavailable drivers are skipped by `mt/test-drivers`."
  #{:h2 :postgres :mysql})

(defmacro ^:private with-app-db
  "Run `body` once per available app-DB driver, each time inside a fresh empty app DB. Reads/writes go through the
  bound `mdb.connection/*application-db*`, so the raw-table t2 helpers below work across drivers without hand-quoting
  identifiers -- no explicit `Connection` binding is needed."
  [& body]
  `(mt/test-drivers app-db-drivers
     (mt/with-temp-empty-app-db [_conn# driver/*driver*]
       ~@body)))

(def ^:private k1 "89ulvIGoiYw6mNELuOoEZphQafnF/zYe+3vT+v70D1A=")
(def ^:private k2 "yHa/6VEQuIItMyd5CNcgV9nXvzZcX6bWmiY0oOh6pLU=")
(def ^:private k3 "BCQbKNVu6N8TQ2BwyTC0U0oCBqsvFVr2uhEM/tRgJUM=")

;; Raw (untransformed) reads via bare-table t2 selects: a bare table keyword bypasses model transforms, so these return
;; the on-disk value, and t2 quotes identifiers per driver (so no H2-specific SQL is needed).
(defn- raw-setting [k]
  (t2/select-one-fn :value :setting :key k))

(defn- raw-column [table id-column id column]
  (t2/select-one-fn column table id-column id))

(defn- dek-rows
  "All DEK rows as `{:id .. :key_material <byte-array>}`, with `key_material` materialized to bytes *during* the query
  (the raw column is a JDBC Blob that throws \"object is already closed\" if read after its connection returns to the
  pool)."
  []
  (mapv (fn [[id wrapped]] {:id id :key_material wrapped})
        (sort-by key
                 (t2/select-fn->fn :id (comp dek/->bytes :key_material) :data_encryption_key {:order-by [[:id :asc]]}))))

(defn- insert-legacy-setting!
  "Write a *legacy*-format setting value directly, so we can prove rotation upgrades it. `encryption/encrypt` always
  produces the legacy CBC+HMAC format (it never consults the DEK store), so no store rebinding is needed here."
  [k v secret-hash]
  (t2/insert! :setting {:key k :value (encryption/encrypt secret-hash v)}))

(deftest rotate-unencrypted-db-with-env-unset-actually-encrypts-test
  (testing "rotating a previously-unencrypted DB to NEWKEY with MB_ENCRYPTION_SECRET_KEY UNSET must actually
           encrypt every value under NEWKEY — never leave plaintext behind a valid sentinel"
    (encryption-test/with-secret-key nil ; env var unset
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        (t2/insert! :model/Setting {:key "s" :value "plaintext for now"})
        (testing "precondition: the value is stored in plaintext (encryption disabled)"
          (is (= "plaintext for now" (raw-setting "s"))))
        ;; rotate to k1 while the env var is still unset
        (rotate-encryption-key! k1)
        (testing "the value is now v2-encrypted on disk — NOT plaintext"
          (let [raw (raw-setting "s")]
            (is (encryption/v2-string? raw) "value must be a real v2 envelope, not plaintext")
            (is (not= "plaintext for now" raw))))
        (testing "the sentinel is encrypted (not the plaintext-UUID 'poisoned' state)"
          (is (encryption/v2-string? (raw-setting "encryption-check"))))
        (testing "a DEK row exists, wrapped under NEWKEY"
          (is (pos? (count (dek-rows)))))
        (testing "the value reads back correctly under NEWKEY"
          (encryption-test/with-secret-key k1
            (is (= "plaintext for now" (t2/select-one-fn :value :model/Setting :key "s")))))
        (testing "and the data is genuinely protected: a wrong key cannot read it"
          (encryption-test/with-secret-key k2
            (is (not= "plaintext for now" (t2/select-one-fn :value :model/Setting :key "s")))))))))

(deftest first-rotation-upgrades-legacy-to-v2-and-rewraps-test
  (testing "rotating a legacy-format database upgrades its values to v2 and rewraps the DEK rows"
    (encryption-test/with-secret-key k1
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        ;; a v2 value written normally, plus a legacy value written directly
        (t2/insert! :model/Setting {:key "v2-setting" :value "v2 value"})
        (insert-legacy-setting! "legacy-setting" "legacy value" (encryption/secret-key->hash k1))
        (is (not (encryption/v2-string? (raw-setting "legacy-setting")))
            "precondition: legacy value is not v2")
        (let [wrapped-before (mapv :key_material (dek-rows))]
          (encryption-test/with-secret-key k1 (rotate-encryption-key! k2))
          (encryption-test/with-secret-key k2
            (testing "both values are now v2 and readable under the new key"
              (is (encryption/v2-string? (raw-setting "legacy-setting")))
              (is (encryption/v2-string? (raw-setting "v2-setting")))
              (is (= "legacy value" (t2/select-one-fn :value :model/Setting :key "legacy-setting")))
              (is (= "v2 value" (t2/select-one-fn :value :model/Setting :key "v2-setting"))))
            (testing "the DEK rows were rewrapped (same generations, different wrapped bytes)"
              (let [wrapped-after (mapv :key_material (dek-rows))]
                (is (= (count wrapped-before) (count wrapped-after)))
                (is (not= (mapv #(seq (dek/->bytes %)) wrapped-before)
                          (mapv #(seq (dek/->bytes %)) wrapped-after))))))
          (testing "the old key can no longer read the data"
            (encryption-test/with-secret-key k1
              (is (not= "legacy value" (t2/select-one-fn :value :model/Setting :key "legacy-setting"))))))))))

(defn- snapshot-all-encrypted-bytes
  "Snapshot the RAW stored bytes of every encrypted VALUE column the rotation walk covers: a plain setting, a
  database's `details`, a user's `settings`, and a secret's `value`. Returns a map the caller can compare byte-for-byte
  across a second rotation. Values are read raw (byte sequences) so we assert on the on-disk bytes, not the decrypted
  form.

  Deliberately excludes the `encryption-check` sentinel: it is a fresh random UUID re-encrypted on EVERY rotation, so
  it is *expected* to change (that is asserted separately)."
  [database-id user-id secret-id]
  {:setting        (raw-setting "walk-setting")
   :db-details     (raw-column :metabase_database :id database-id :details)
   :user-settings  (raw-column :core_user :id user-id :settings)
   ;; the secret value is a JDBC Blob: coerce to bytes *during* the query (select-fn runs in the connection scope)
   :secret-value   (mapv #(bit-and % 0xff)
                         (seq (t2/select-one-fn (comp dek/->bytes :value) :secret :id secret-id)))})

(deftest second-rotation-touches-only-dek-table-test
  (testing "after everything is v2, a second rotation rewraps DEK rows but rewrites NO encrypted value row"
    (encryption-test/with-secret-key k1
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        ;; populate every kind of encrypted column so the snapshot covers them all
        (t2/insert! :model/Setting {:key "walk-setting" :value "a plain setting value"})
        (let [database-id (t2/select-one-pk :model/Database)
              _        (t2/update! :model/Database database-id {:details {:db "/tmp/walk.db"}})
              u        (first (t2/insert-returning-instances! :model/User {:email "walk@n.test" :first_name "W"
                                                                          :last_name "K" :password "p"
                                                                          :is_active true :is_superuser false}))
              _        (t2/update! :model/User (:id u) {:settings {:locale "en"}})
              secret   (first (t2/insert-returning-instances! :model/Secret {:name "walk-secret" :kind "password"
                                                                            :value (.getBytes "shh walk" StandardCharsets/UTF_8)
                                                                            :creator_id (:id u)}))
              user-id  (:id u)
              secret-id (:id secret)]
          ;; first rotation: legacy/plaintext -> v2 under k2 (and mints/rewraps the DEK rows)
          (encryption-test/with-secret-key k1 (rotate-encryption-key! k2))
          (let [snapshot-before (snapshot-all-encrypted-bytes database-id user-id secret-id)
                sentinel-before (raw-setting "encryption-check")
                wrapped-before  (mapv #(seq (dek/->bytes (:key_material %))) (dek-rows))]
            (testing "precondition: after the first rotation every encrypted value is v2"
              (is (encryption/v2-string? (:setting snapshot-before)))
              (is (encryption/v2-string? (:db-details snapshot-before)))
              (is (encryption/v2-string? (:user-settings snapshot-before)))
              (is (encryption/v2-string? sentinel-before)))
            ;; second rotation: k2 -> k3. This must rewrap the DEK rows but touch no value row.
            (encryption-test/with-secret-key k2 (rotate-encryption-key! k3))
            (testing "every snapshotted encrypted VALUE is byte-identical after the second rotation"
              (is (= snapshot-before (snapshot-all-encrypted-bytes database-id user-id secret-id))))
            (testing "the sentinel, by contrast, is re-encrypted with a fresh UUID on every rotation (expected)"
              (is (not= sentinel-before (raw-setting "encryption-check"))))
            (testing "but the DEK rows were rewrapped (same generations, different wrapped bytes)"
              (let [wrapped-after (mapv #(seq (dek/->bytes (:key_material %))) (dek-rows))]
                (is (= (count wrapped-before) (count wrapped-after)))
                (is (not= wrapped-before wrapped-after))))
            (testing "and every value still reads correctly under the third key"
              (encryption-test/with-secret-key k3
                (is (= "a plain setting value" (t2/select-one-fn :value :model/Setting :key "walk-setting")))
                (is (= {:db "/tmp/walk.db"} (t2/select-one-fn :details :model/Database :id database-id)))
                (is (= {:locale "en"} (t2/select-one-fn :settings :model/User :id user-id)))
                (is (mt/secret-value-equals? "shh walk" (t2/select-one-fn :value :model/Secret :id secret-id)))))))))))

(deftest mid-walk-foreign-key-value-aborts-with-rollback-test
  (testing "a value encrypted under a foreign key, discovered mid-walk after the sentinel check passes, aborts the
           whole rotation with a full transaction rollback: a mid-rotation failure must never leave data
           half-re-encrypted"
    (encryption-test/with-secret-key k1
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        ;; the DB is correctly encrypted under k1 (valid sentinel). Insert a channel whose details are encrypted under
        ;; a DIFFERENT key (k2) directly, bypassing the model transform, so the sentinel check passes but the walk hits
        ;; an undecryptable value in a non-clearable column.
        (t2/insert! :model/Setting {:key "good" :value "good value"})
        (let [database-id (t2/select-one-pk :model/Database)
              _          (t2/update! :model/Database database-id {:details {:db "/tmp/good.db"}})
              channel-id (first (t2/insert-returning-pks! :channel
                                                          {:name       (mt/random-name)
                                                           :type       "channel/http"
                                                           :details    (encryption/encrypt (encryption/secret-key->hash k2)
                                                                                           "{\"url\":\"http://foreign\"}")
                                                           :active     true
                                                           :created_at :%now
                                                           :updated_at :%now}))
              good-before    (raw-setting "good")
              details-before (raw-column :metabase_database :id database-id :details)]
          (testing "rotation aborts because the foreign-key value cannot be decrypted"
            (encryption-test/with-secret-key k1
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"Can't decrypt app db with MB_ENCRYPTION_SECRET_KEY"
                   (rotate-encryption-key! k2)))))
          (testing "and NOTHING was written: the good rows are byte-identical (full rollback)"
            (is (= good-before (raw-setting "good")))
            (is (= details-before (raw-column :metabase_database :id database-id :details)))
            (testing "the good values still read under the original key k1"
              (encryption-test/with-secret-key k1
                (is (= "good value" (t2/select-one-fn :value :model/Setting :key "good")))
                (is (= {:db "/tmp/good.db"} (t2/select-one-fn :details :model/Database :id database-id))))))
          (testing "the channel row is untouched"
            (is (some? (t2/select-one-fn :details :channel :id channel-id)))))))))

(deftest mint-new-dek-is-instant-and-old-generations-stay-readable-test
  (encryption-test/with-secret-key k1
    (with-app-db
      (mdb/setup-db! :create-sample-content? true)
      (t2/insert! :model/Setting {:key "old" :value "written under gen 1"})
      (let [gen1-value (raw-setting "old")]
        (is (= 1 (count (dek-rows))))
        (mint-encryption-dek!)
        (testing "a new generation was added; the old value's row is untouched"
          (is (= 2 (count (dek-rows))))
          (is (= gen1-value (raw-setting "old"))))
        (testing "new writes use the new generation; both remain readable"
          (t2/insert! :model/Setting {:key "new" :value "written under gen 2"})
          (is (= 2 (encryption/v2-generation-id-of-string (raw-setting "new"))))
          (is (= "written under gen 1" (t2/select-one-fn :value :model/Setting :key "old")))
          (is (= "written under gen 2" (t2/select-one-fn :value :model/Setting :key "new"))))))))

(deftest deep-reencrypt-moves-all-values-to-newest-generation-and-deletes-old-deks-test
  (encryption-test/with-secret-key k1
    (with-app-db
      (mdb/setup-db! :create-sample-content? true)
      (t2/insert! :model/Setting {:key "old" :value "gen1 value"})
      (mint-encryption-dek!) ; now gen 2 active
      (t2/insert! :model/Setting {:key "new" :value "gen2 value"})
      (is (= 1 (encryption/v2-generation-id-of-string (raw-setting "old"))))
      (is (= 2 (count (dek-rows))))
      (deep-reencrypt!)
      (testing "every value is now under the newest generation and old DEK rows are gone"
        (is (= 1 (count (dek-rows))))
        (is (= 2 (encryption/v2-generation-id-of-string (raw-setting "old"))))
        (is (= 2 (encryption/v2-generation-id-of-string (raw-setting "new"))))
        (is (= "gen1 value" (t2/select-one-fn :value :model/Setting :key "old")))
        (is (= "gen2 value" (t2/select-one-fn :value :model/Setting :key "new")))))))

(deftest remove-encryption-on-mixed-format-db-yields-plaintext-test
  (testing "remove-encryption decrypts both legacy and v2 values and empties the DEK table"
    (encryption-test/with-secret-key k1
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        (t2/insert! :model/Setting {:key "v2-setting" :value "v2 value"})
        (insert-legacy-setting! "legacy-setting" "legacy value" (encryption/secret-key->hash k1))
        (let [u (first (t2/insert-returning-instances! :model/User {:email "n@n.test" :first_name "N" :last_name "B"
                                                                    :password "p" :is_active true :is_superuser false}))]
          (t2/insert-returning-instances! :model/Secret {:name "s" :kind "password"
                                                         :value (.getBytes "shh" StandardCharsets/UTF_8)
                                                         :creator_id (:id u)}))
        (is (pos? (count (dek-rows))))
        (remove-encryption!)
        (testing "settings are plaintext, sentinel is 'unencrypted', DEK table is empty"
          (is (= "unencrypted" (raw-setting "encryption-check")))
          (is (not (encryption/possibly-encrypted-string? (raw-setting "v2-setting"))))
          (is (not (encryption/possibly-encrypted-string? (raw-setting "legacy-setting"))))
          (is (= "v2 value" (raw-setting "v2-setting")))
          (is (= "legacy value" (raw-setting "legacy-setting")))
          (is (zero? (count (dek-rows)))))))))

(deftest wrong-current-key-aborts-without-modification-test
  (testing "rotating with the wrong current key aborts before touching any rows"
    (encryption-test/with-secret-key k1
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        (t2/insert! :model/Setting {:key "s" :value "hello"})
        (let [value-before   (raw-setting "s")
              wrapped-before (mapv #(seq (dek/->bytes (:key_material %))) (dek-rows))]
          (encryption-test/with-secret-key k2 ; wrong key for this db
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Database was encrypted with a different key"
                 (rotate-encryption-key! k1))))
          (testing "nothing changed"
            (is (= value-before (raw-setting "s")))
            (is (= wrapped-before (mapv #(seq (dek/->bytes (:key_material %))) (dek-rows))))
            (encryption-test/with-secret-key k1
              (is (= "hello" (t2/select-one-fn :value :model/Setting :key "s"))))))))))

;;; ---------------------------- activation is derived from the database, not the process ----------------------------

(deftest v2-survives-application-db-instance-and-pool-churn-test
  (testing "whether v2 writes are enabled is derived from the database itself, so it survives the physical DB being
           re-wrapped in a fresh `ApplicationDB` instance (new unique id) or reached through a rebuilt data source
           (new pool object)"
    (encryption-test/with-secret-key k1
      ;; a named in-memory H2 DB that outlives any single connection, so two independent DataSource objects can reach
      ;; the same physical DB -- the pool-rebuild scenario
      (let [db-name (str "envelope_churn_test_" (mt/random-name))
            url     (str "jdbc:h2:mem:" db-name ";DB_CLOSE_DELAY=-1")
            ds1     (mdb.data-source/raw-connection-string->DataSource url)]
        (try
          (mdb/with-application-db (mdb/application-db :h2 ds1)
            (mdb/setup-db! :create-sample-content? true)
            (t2/insert! :model/Setting {:key "before-churn" :value "written before churn"})
            (is (encryption/v2-string? (raw-setting "before-churn"))
                "precondition: the DB is encrypted and new writes are v2"))
          (testing "a NEW ApplicationDB instance (fresh unique id) over the SAME data source still writes and reads v2"
            (mdb/with-application-db (mdb/application-db :h2 ds1)
              (t2/insert! :model/Setting {:key "after-instance-churn" :value "instance churn"})
              (is (encryption/v2-string? (raw-setting "after-instance-churn"))
                  "v2 must not be lost when the ApplicationDB instance (and its unique id) churns")
              (is (= "written before churn" (t2/select-one-fn :value :model/Setting :key "before-churn")))))
          (testing "a NEW data source over the SAME physical DB still writes and reads v2"
            (let [ds2 (mdb.data-source/raw-connection-string->DataSource url)]
              (mdb/with-application-db (mdb/application-db :h2 ds2)
                (t2/insert! :model/Setting {:key "after-pool-churn" :value "pool churn"})
                (is (encryption/v2-string? (raw-setting "after-pool-churn"))
                    "v2 must not be lost when the data-source object changes (nothing guarantees 1:1 data-source <-> physical DB)")
                (is (= "instance churn" (t2/select-one-fn :value :model/Setting :key "after-instance-churn"))))))
          (finally
            (with-open [conn (.getConnection ds1)]
              (.execute (.createStatement conn) "SHUTDOWN"))))))))

(deftest remove-encryption-derives-no-store-test
  (testing "after remove-encryption, the same physical DB resolves no DEK store -- under the same AND a fresh
           `ApplicationDB` instance -- and a set MB_ENCRYPTION_SECRET_KEY does not silently mint DEKs"
    (encryption-test/with-secret-key k1
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        (is (some? (dek/store)) "precondition: the encrypted DB derives a store")
        (remove-encryption!)
        (testing "same instance: no store; writes are legacy (the key is still set) and no DEK rows appear"
          (is (nil? (dek/store)))
          (t2/insert! :model/Setting {:key "post-removal" :value "post removal"})
          (let [raw (raw-setting "post-removal")]
            (is (not (encryption/v2-string? raw)))
            (is (encryption/possibly-encrypted-string? raw) "key still set => legacy-encrypted, not plaintext"))
          (is (zero? (count (dek-rows))) "no DEK may be silently minted against a plaintext DB"))
        (testing "a fresh ApplicationDB instance over the same data source also derives no store"
          (mdb/with-application-db (mdb/application-db driver/*driver* (:data-source (mdb/app-db)))
            (is (nil? (dek/store)))
            (t2/insert! :model/Setting {:key "post-removal-fresh" :value "post removal fresh"})
            (is (not (encryption/v2-string? (raw-setting "post-removal-fresh"))))
            (is (zero? (count (dek-rows))))))))))

(deftest unreadable-sentinel-derives-no-store-test
  (testing "if the sentinel cannot even be queried (no tables yet -- early boot, broken DB), the DB is treated as
           NOT encrypted: no store, and writes stay on the legacy path"
    ;; the app-DB store resolver is installed process-wide by the `:once` fixture's `initialize :db` (via app-DB
    ;; setup), so `dek/store` really consults it here
    (encryption-test/with-secret-key k1
      (with-app-db
        ;; deliberately NO setup-db!: this app DB has no tables at all, so the sentinel query throws inside the
        ;; resolver
        (is (nil? (dek/store)))
        (let [ct (encryption/maybe-encrypt "sensitive")]
          (is (encryption/possibly-encrypted-string? ct) "the key is set, so the value is still (legacy-)encrypted")
          (is (not (encryption/v2-string? ct)) "but never v2: no store may be derived from an unreadable DB"))))))

(deftest encrypt-db-invalidates-derived-activation-under-same-instance-test
  (testing "encrypting a DB invalidates the cached 'not encrypted' answer: the SAME ApplicationDB instance (same
           unique id) that derived and cached 'no store' on the plaintext DB must write v2 right after the encrypt
           command flips the DB's state"
    (encryption-test/with-secret-key nil ; env unset => setup leaves the DB plaintext
      (with-app-db
        (mdb/setup-db! :create-sample-content? true)
        (is (nil? (dek/store))
            "precondition: the plaintext DB derives no store (and the resolver caches that 'false' for this instance)")
        ;; encrypt via the command, under the same bound ApplicationDB instance
        (rotate-encryption-key! k1)
        (encryption-test/with-secret-key k1
          (t2/insert! :model/Setting {:key "post-encrypt" :value "written after encryption"})
          (is (encryption/v2-string? (raw-setting "post-encrypt"))
              "a write under the SAME instance must be v2: encrypt-db must have invalidated the cached 'not encrypted' answer")
          (is (= "written after encryption" (t2/select-one-fn :value :model/Setting :key "post-encrypt"))))))))

(deftest transient-sentinel-failure-is-not-cached-test
  (testing "a sentinel query that throws yields 'no store' for that call only: the error-derived answer is never
           cached, so the very next resolver call re-derives from the (healthy) encrypted DB and hands out a store"
    (encryption-test/with-secret-key k1
      (with-app-db
        (mdb/setup-db! :create-sample-content? true) ; a genuinely encrypted DB
        ;; a fresh ApplicationDB instance over the same data source: fresh unique id, so no cached answer exists yet
        ;; and the resolver must derive on first use
        (mdb/with-application-db (mdb/application-db driver/*driver* (:data-source (mdb/app-db)))
          (let [orig   t2/select-one-fn
                threw? (atom false)]
            (with-redefs [t2/select-one-fn (fn [& args]
                                             (if (compare-and-set! threw? false true)
                                               (throw (ex-info "simulated transient sentinel failure (pool blip)" {}))
                                               (apply orig args)))]
              (is (nil? (dek/store))
                  "while the sentinel query fails, the resolver hands out no store (v2 writes stay off)")
              (is (some? (dek/store))
                  "the failure answer was not cached: the next call re-derives 'encrypted' and hands out a store"))))))))

(deftest dek-table-is-copied-by-dump-load-test
  (testing "the wrapped-DEK table is in the dump/load copy set, so an encrypted dump carries its DEK rows and its v2
           values stay readable on the target (mixed-format DBs must move between hosts transparently).
           If this table were ever dropped from `copy/entities`, encrypted dumps would silently lose their key
           material and become unreadable."
    (is (contains? (set copy/entities) :model/DataEncryptionKey))))
