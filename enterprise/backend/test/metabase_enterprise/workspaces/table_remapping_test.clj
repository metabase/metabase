(ns metabase-enterprise.workspaces.table-remapping-test
  "Tests for the public writer API in `metabase-enterprise.workspaces.table-remapping`.
   Exercises the round-trip between `add-mapping!`, `remap-table`, `remove-mapping!`,
   `all-mappings-for-db`, `clear-mappings-for-db!`, and `add-transform-target-mapping!`."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.driver :as driver]
   [metabase.driver.connection.workspaces :as driver.conn.w]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- clean-db-fixture!
  "Run `f` with mappings cleared before and after so tests don't leak state."
  [db-id f]
  (ws.table-remapping/clear-mappings-for-db! db-id)
  (try (f)
       (finally (ws.table-remapping/clear-mappings-for-db! db-id)
                (sync-tables/sync-tables-and-database!
                 (t2/select-one :model/Database db-id)))))

(defn- with-provisioned-workspace-db!
  "Set the `instance-workspace` setting so `db-workspace-namespace` returns
   `{:schema output-schema}` for `db-id`, run `f`, clear it on the way out.
   Enables `:workspaces` for the duration."
  [db-id output-schema f]
  (mt/with-premium-features #{:workspaces}
    (try
      (ws/set-instance-workspace! {:name "table-remapping-test-ws"
                                   :databases {db-id {:input_schemas ["_"]
                                                      :output        {:schema output-schema}}}})
      (f)
      (finally
        (ws/clear-instance-workspace!)))))

(deftest remap-table-returns-nil-when-no-mapping-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (is (nil? (ws.table-remapping/remap-table (mt/id) {:schema "nope_schema" :name "nope_table"}))))))

(deftest add-then-remap-table-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id)
      {:schema "PUBLIC" :table "ORDERS"}
      {:schema "ws_schema" :table "orders_copy"})
     (is (= {:db nil :schema "ws_schema" :name "orders_copy"}
            (ws.table-remapping/remap-table (mt/id) {:schema "PUBLIC" :name "ORDERS"}))))))

(deftest all-mappings-for-db-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "ORDERS"}   {:schema "ws_schema" :table "orders_copy"})
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "PRODUCTS"} {:schema "ws_schema" :table "products_copy"})
     (is (= {{:db "" :schema "PUBLIC" :table "ORDERS"}   {:db "" :schema "ws_schema" :table "orders_copy"}
             {:db "" :schema "PUBLIC" :table "PRODUCTS"} {:db "" :schema "ws_schema" :table "products_copy"}}
            (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest remove-mapping!-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "ORDERS"} {:schema "ws_schema" :table "orders_copy"})
     (ws.table-remapping/remove-mapping! (mt/id) {:schema "PUBLIC" :table "ORDERS"})
     (is (nil? (ws.table-remapping/remap-table (mt/id) {:schema "PUBLIC" :name "ORDERS"}))))))

(deftest clear-mappings-for-db!-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "ORDERS"}   {:schema "ws_schema" :table "orders_copy"})
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "PRODUCTS"} {:schema "ws_schema" :table "products_copy"})
     (ws.table-remapping/clear-mappings-for-db! (mt/id))
     (is (= {} (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest add-mapping!-is-idempotent-test
  (testing "duplicate inserts no-op via app-db/update-or-insert! (no exception, no extra row)"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id) {:schema "PUBLIC" :table "ORDERS"} {:schema "ws_schema" :table "orders_copy"})
       (is (some? (ws.table-remapping/add-mapping!
                   (mt/id) {:schema "PUBLIC" :table "ORDERS"} {:schema "ws_schema" :table "orders_copy"}))
           "second identical insert resolves cleanly without throwing")
       (is (= {{:db "" :schema "PUBLIC" :table "ORDERS"} {:db "" :schema "ws_schema" :table "orders_copy"}}
              (ws.table-remapping/all-mappings-for-db (mt/id)))
           "only one row persists")))))

;; ------------------------------------------------- add-transform-target-mapping! -------------------------------------------------

(deftest add-transform-target-mapping!-writes-app-db-test
  (testing "add-transform-target-mapping! writes the app-db cache using the workspace's output schema as the to-schema and a collision-resistant to-table"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-provisioned-workspace-db!
         (mt/id) "ws_fresh"
         (fn []
           (ws.table-remapping/add-transform-target-mapping!
            (mt/id) {:schema "PUBLIC" :name "ORDERS" :type :table})
           (is (= {:db nil :schema "ws_fresh" :name "PUBLIC__ORDERS"}
                  (ws.table-remapping/remap-table (mt/id) {:schema "PUBLIC" :name "ORDERS"}))
               "to-side is rewritten to <from-schema>__<from-name> so cross-schema collisions are avoided")))))))

(deftest add-transform-target-mapping!-is-idempotent-test
  (testing "calling add-transform-target-mapping! twice leaves the app-db with a single row (no duplicate-key explosion)"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-provisioned-workspace-db!
         (mt/id) "ws_idem"
         (fn []
           (let [target {:schema "PUBLIC" :name "ORDERS" :type :table}]
             (ws.table-remapping/add-transform-target-mapping! (mt/id) target)
             (ws.table-remapping/add-transform-target-mapping! (mt/id) target)
             (is (= {{:db "" :schema "PUBLIC" :table "ORDERS"} {:db "" :schema "ws_idem" :table "PUBLIC__ORDERS"}}
                    (ws.table-remapping/all-mappings-for-db (mt/id)))))))))))

(defn- with-provisioned-workspace-db-namespace!
  "Variant of `with-provisioned-workspace-db!` that takes a full
   `::table-namespace` map (`{:db ?, :schema ?}`) instead of just a schema
   string. Used to exercise cross-DB workspaces (SQL Server / BigQuery) where
   the to-side `:db` slot must flow through to the `TableRemapping` row.
   Enables `:workspaces` for the duration."
  [db-id output-namespace f]
  (mt/with-premium-features #{:workspaces}
    (try
      (ws/set-instance-workspace! {:name "ws-3-slot"
                                   :databases {db-id {:input_schemas ["_"]
                                                      :output        output-namespace}}})
      (f)
      (finally
        (ws/clear-instance-workspace!)))))

(deftest add-transform-target-mapping!-flows-both-slots-from-namespace-test
  (testing "When the workspace output namespace populates :db, both slots flow into the TableRemapping row"
    ;; Requires the :sqlserver driver class on the test classpath - same skip pattern as the
    ;; per-driver spec-for-table tests above. Run with:
    ;;   ./bin/test-agent --drivers=sqlserver,h2 :only '[...this test...]'
    (when (workspaces.tu/driver-loadable? :sqlserver)
      ;; Synthesize the canonical Database row's :engine after :model/Database is created
      ;; so spec-for-table dispatches as SQL Server, populating :db on the from-side.
      (clean-db-fixture!
       (mt/id)
       (fn []
         (with-redefs [t2/select-one (let [orig t2/select-one]
                                       (fn [model & args]
                                         (let [row (apply orig model args)]
                                           (if (and row
                                                    (= model :model/Database)
                                                    (= (:id row) (mt/id)))
                                             (-> row
                                                 (assoc :engine :sqlserver
                                                        :details {:db "AnalyticsDB"}))
                                             row))))]
           (with-provisioned-workspace-db-namespace!
             (mt/id) {:db "WS_DB" :schema "ws_alice"}
             (fn []
               (let [to-spec (ws.table-remapping/add-transform-target-mapping!
                              (mt/id) {:schema "dbo" :name "orders" :type :table})]
                 (testing "to-side spec carries both :db and :schema from the workspace namespace"
                   (is (= "WS_DB" (:db to-spec)))
                   (is (= "ws_alice" (:schema to-spec)))
                   (is (= "dbo__orders" (:name to-spec))
                       "table is renamed via remapped-table-name to avoid cross-schema collisions"))
                 (testing "TableRemapping row stores both slots, source-side too"
                   (is (= {{:db "AnalyticsDB" :schema "dbo"      :table "orders"}
                           {:db "WS_DB"       :schema "ws_alice" :table "dbo__orders"}}
                          (ws.table-remapping/all-mappings-for-db (mt/id)))
                       "from_db = AnalyticsDB (from spec-for-table on :sqlserver), to_db = WS_DB (from workspace namespace)")))))))))))

(deftest workspace-remap-schema+name-redirects-sync-fetch-test
  (testing "sync's fetch-metadata hook returns [to-schema to-table-name] when a TableRemapping exists"
    (let [db-id (mt/id)]
      (clean-db-fixture!
       db-id
       (fn []
         (is (nil? (ws.table-remapping/workspace-remap-schema+name db-id {:schema "PUBLIC" :name "ORDERS"}))
             "without a remapping, the hook returns nil so sync queries the logical table")
         (ws.table-remapping/add-mapping! db-id
                                          {:schema "PUBLIC"     :table "ORDERS"}
                                          {:schema "mb_iso_ws"  :table "orders_copy"})
         (is (= {:db nil :schema "mb_iso_ws" :name "orders_copy"}
                (ws.table-remapping/workspace-remap-schema+name db-id {:schema "PUBLIC" :name "ORDERS"}))
             "with a remapping, the hook returns the isolated warehouse location so sync asks the driver there"))))))

(deftest fk-metadata-mysql-swaps-connection-to-iso-db-test
  (testing "fk-metadata on a MySQL workspace with a :db swap must run describe-fks under the iso DB.
            Bug GHY-3599: fk-metadata didn't wrap its describe-fks call in with-swapped-connection-details,
            so the JDBC connection talked to the canonical bound DB instead of the iso DB, missing every FK
            that lives in the iso DB."
    (mt/with-model-cleanup [:model/Database]
      (let [db-id          (:id (t2/insert-returning-instance!
                                 :model/Database
                                 {:engine  :mysql
                                  :name    "mysql-fk-fixture"
                                  :details {:db "appdata"}}))
            ;; Capture both the swap-state and what schema-names the driver call received.
            describe-calls (atom [])]
        (try
          (ws.table-remapping/clear-mappings-for-db! db-id)
          (ws.table-remapping/add-mapping! db-id
                                           {:db "appdata" :schema nil :table "orders"}
                                           {:db "appdata_ws" :schema nil :table "orders_copy"})
          (with-redefs [driver/database-supports?      (constantly true)
                        driver/describe-fks            (fn [_driver _db & {:keys [schema-names]}]
                                                         (swap! describe-calls conj
                                                                {:swap-active?  (driver.conn.w/has-connection-swap? db-id)
                                                                 :schema-names  schema-names})
                                                         [])]
            (let [db (t2/select-one :model/Database :id db-id)]
              ;; Sync FK probe runs with the canonical input-schema patterns. On MySQL `:schema` is
              ;; never populated, so the iso DB swap is the only way the probe reaches `appdata_ws`.
              (doall (fetch-metadata/fk-metadata db :schema-names ["appdata"]))))
          (is (seq @describe-calls)
              "describe-fks should be called at least once during fk-metadata")
          (is (every? :swap-active? @describe-calls)
              (str "MySQL fk-metadata must wrap describe-fks in with-swapped-connection-details "
                   "so JDBC connections target the iso DB. Captured calls: "
                   (pr-str @describe-calls)))
          (finally
            (ws.table-remapping/clear-mappings-for-db! db-id)))))))

(deftest workspace-remap-schema+name-mysql-fills-db-slot-test
  (testing "MySQL: hook receives `{:schema nil :name X}` from sync but must still match a remap row
            whose canonical from-spec carries `:db <bound-db>`. The hook enriches the from-spec from
            the database row's `:details :db` before matching, so the lookup succeeds."
    ;; Insert raw via t2 so `mt/with-temp`'s post-create sync hook does not try
    ;; to connect to MySQL on the test host.
    (mt/with-model-cleanup [:model/Database]
      (let [db-id (:id (t2/insert-returning-instance!
                        :model/Database
                        {:engine  :mysql
                         :name    "mysql-fixture"
                         :details {:db "appdata"}}))]
        (try
          (ws.table-remapping/clear-mappings-for-db! db-id)
          (ws.table-remapping/add-mapping! db-id
                                           {:db "appdata" :schema nil :table "orders"}
                                           {:db "appdata_ws" :schema nil :table "orders_copy"})
          (testing "from-spec without :db (the sync caller's shape) still resolves"
            (is (= {:db "appdata_ws" :schema nil :name "orders_copy"}
                   (ws.table-remapping/workspace-remap-schema+name db-id {:schema nil :name "orders"}))))
          (finally
            (ws.table-remapping/clear-mappings-for-db! db-id)))))))

(deftest table-fields-metadata-honors-workspace-remapping-test
  (testing "sync/fetch-metadata/table-fields-metadata asks the driver about the remapped warehouse table"
    (let [db-id          (mt/id)
          describe-calls (atom [])]
      (clean-db-fixture!
       db-id
       (fn []
         (ws.table-remapping/add-mapping! db-id
                                          {:schema "PUBLIC"    :table "ORDERS"}
                                          {:schema "mb_iso_ws" :table "orders_copy"})
         (with-redefs [driver/describe-fields
                       (fn [_driver _db & {:keys [table-names schema-names]}]
                         (swap! describe-calls conj {:path         :describe-fields
                                                     :table-names  table-names
                                                     :schema-names schema-names})
                         #{})
                       driver/describe-table
                       (fn [_driver _db table]
                         (swap! describe-calls conj {:path   :describe-table
                                                     :schema (:schema table)
                                                     :name   (:name table)})
                         {:fields #{}})]
           (let [logical-table (t2/instance :model/Table
                                            {:id 999 :name "ORDERS" :schema "PUBLIC" :db_id db-id})]
             (fetch-metadata/table-fields-metadata
              (t2/select-one :model/Database :id db-id)
              logical-table))
           (is (= 1 (count @describe-calls)))
           (let [call (first @describe-calls)]
             (testing "driver is asked about the remapped (to_schema, to_table_name), not the logical source"
               (case (:path call)
                 :describe-fields
                 (do (is (= ["orders_copy"] (:table-names call)))
                     (is (= ["mb_iso_ws"]   (:schema-names call))))
                 :describe-table
                 (do (is (= "orders_copy" (:name call)))
                     (is (= "mb_iso_ws"   (:schema call))))
                 (is false (str "unexpected path " (:path call))))))))))))

(deftest add-transform-target-mapping!-requires-workspaced-db-test
  (testing "throws with a clear error when db is not workspaced (db-workspace-namespace returns nil)"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [ex (try
                  (ws.table-remapping/add-transform-target-mapping!
                   (mt/id) {:schema "PUBLIC" :name "ORDERS" :type :table})
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
         (is (some? ex) "add-transform-target-mapping! must throw when the db is not workspaced")
         (is (re-find #"not workspaced" (ex-message ex)))
         (is (= (mt/id) (:db-id (ex-data ex)))))
       (testing "no app-db row was written"
         (is (nil? (ws.table-remapping/remap-table (mt/id) {:schema "PUBLIC" :name "ORDERS"}))))))))

;;; ------------------------------------------------- remapped-table-name -------------------------------------------------
;;;
;;; Unit tests for the rename helper. Two source tables sharing a `:table` slot under different
;;; `:schema` slots must produce distinct `:table` slots after the rewrite, even when the driver's
;;; identifier limit forces truncation.

(deftest ^:parallel remapped-table-name-short-passthrough-test
  (testing "inputs under the driver's limit pass through as schema__table"
    (is (= {:db "" :schema "public" :table "public__orders"}
           (ws.table-remapping/remapped-table-name
            :postgres {:db "" :schema "public" :table "orders"})))))

(deftest ^:parallel remapped-table-name-determinism-test
  (testing "same input -> same output"
    (let [in {:db "" :schema "schema_a" :table "orders"}]
      (is (= (ws.table-remapping/remapped-table-name :postgres in)
             (ws.table-remapping/remapped-table-name :postgres in))))))

(deftest ^:parallel remapped-table-name-distinct-schemas-test
  (testing "two source tables with same :table under different :schema produce distinct :table slots"
    (let [a (ws.table-remapping/remapped-table-name :postgres {:db "" :schema "schemaA" :table "orders"})
          b (ws.table-remapping/remapped-table-name :postgres {:db "" :schema "schemaB" :table "orders"})]
      (is (= "schemaA__orders" (:table a)))
      (is (= "schemaB__orders" (:table b)))
      (is (not= (:table a) (:table b))))))

(deftest ^:parallel remapped-table-name-honors-driver-limit-test
  (testing "Postgres (63) hashes long names; H2 (256) leaves them readable"
    (let [long-schema (apply str (repeat 40 "a"))
          long-table  (apply str (repeat 40 "b"))
          in          {:db "" :schema long-schema :table long-table}
          pg          (ws.table-remapping/remapped-table-name :postgres in)
          h2          (ws.table-remapping/remapped-table-name :h2 in)]
      (is (<= (count (:table pg)) 63))
      (is (re-find #"_[0-9a-z]{8}$" (:table pg))
          "Postgres output ends in an 8-char base36 disambiguating suffix")
      (is (= (str long-schema "__" long-table) (:table h2))
          "H2's 256-char headroom leaves the readable concatenation alone"))))

(deftest ^:parallel remapped-table-name-collision-resistance-under-truncation-test
  (testing "different long inputs that share a prefix produce distinct outputs after truncation"
    (let [base (apply str (repeat 60 "x"))
          a    (ws.table-remapping/remapped-table-name :postgres {:db "" :schema (str base "_a") :table "tbl"})
          b    (ws.table-remapping/remapped-table-name :postgres {:db "" :schema (str base "_b") :table "tbl"})]
      (is (<= (count (:table a)) 63))
      (is (<= (count (:table b)) 63))
      (is (not= (:table a) (:table b))
          "the hash suffix discriminates inputs that would collide after naive truncation"))))

(deftest ^:parallel remapped-table-name-truncation-shape-test
  (testing "with max-len = 20"
    ;; Layout, position by position:
    ;;
    ;; positions:    1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20
    ;;
    ;; verbatim:     s  c  h  e  m  a  A  _  _  t  a  b  l  e  _  f  i  t  s            (19, verbatim)
    ;; at limit:     s  c  h  e  m  a  A  _  _  t  a  b  l  e  _  f  i  t  s  !         (20, verbatim)
    ;; over limit:   s  c  h  e  m  a  A  _  _  t  a  _  <-------- 8-char hash -------->
    ;;               [-- first (max-len - 9) chars of raw -][- _ + 8 base36 chars (9 total) -]
    ;;
    ;; When raw exceeds max-len, the function preserves the first (max-len - 9) chars of raw
    ;; and appends an underscore + 8-char base36 hash of the FULL pre-truncation raw. So two
    ;; inputs sharing those first chars still get distinct outputs via the hash.
    (testing "verbatim cases (raw <= max-len)"
      (doseq [[case-name {:keys [table-spec expected-output]}]
              {"raw is 18 chars, under limit"
               {:table-spec      {:db "" :schema "schemaA" :table "table_fits"}
                :expected-output "schemaA__table_fits"}

               "raw is 20 chars, exactly at limit"
               {:table-spec      {:db "" :schema "schemaA" :table "table_fits!"}
                :expected-output "schemaA__table_fits!"}}]
        (testing case-name
          (let [out (:table (ws.table-remapping/remapped-table-name-with-limit table-spec 20))]
            (is (= expected-output out))
            (is (>= 20 (count out)) "output is at or under the limit")))))
    (testing "overflow cases (raw > max-len): output is <first 11 chars of raw>_<8-char base36 hash of full raw>"
      ;; The hash is deterministic, so we pin the entire 20-char output literally.
      ;; All three raws share the prefix "schemaA__ta" -- the hash discriminates them.
      (doseq [[case-name {:keys [table-spec expected-output]}]
              {"raw is 21 chars: 1 over the limit"
               {:table-spec      {:db "" :schema "schemaA" :table "table_no_fit"}
                :expected-output "schemaA__ta_lnvvf3pc"}

               "raw is 27 chars: shares the first 11 chars with the 21-char case above"
               {:table-spec      {:db "" :schema "schemaA" :table "table_alpha_long"}
                :expected-output "schemaA__ta_s6fpa2r3"}

               "raw is 28 chars: also shares the first 11 chars"
               {:table-spec      {:db "" :schema "schemaA" :table "table_beta_longer"}
                :expected-output "schemaA__ta_rmulb7o0"}}]
        (testing case-name
          (let [out (:table (ws.table-remapping/remapped-table-name-with-limit table-spec 20))]
            (is (= expected-output out))
            (is (= 20 (count out)) "output is exactly the limit")))))))

(deftest ^:parallel remapped-table-name-byte-aware-truncation-test
  (testing "limit is enforced in UTF-8 bytes, not Java chars, and truncation never splits a multi-byte codepoint"
    ;; Each Japanese char is 1 Java char and 3 UTF-8 bytes. With six of them in the schema,
    ;; raw = "ああああああ__orders" -> 14 chars but 26 bytes. With max-bytes = 20:
    ;;   - char-based logic would see 14 <= 20 and skip truncation (BUG: 26 bytes overflows Postgres)
    ;;   - byte-aware logic truncates because string-byte-count returns 26
    ;;
    ;; Truncation is codepoint-safe: head-room = 20 - 9 = 11 bytes; we fit only 3 full
    ;; Japanese chars (9 bytes) plus the 9-byte ASCII suffix = 18 bytes total, which is
    ;; at-or-under the limit without ever splitting a 3-byte codepoint into 1.5.
    (let [out (:table (ws.table-remapping/remapped-table-name-with-limit
                       {:db "" :schema "ああああああ" :table "orders"}
                       20))]
      (is (= "あああ_pgiv8lx2" out))
      (is (= 12 (count out)) "12 java chars: 3 Japanese + underscore + 8 ASCII hash chars")
      (is (= 18 (u/string-byte-count out))
          "18 UTF-8 bytes: 9 from the 3 Japanese + 9 from the ASCII suffix; <=20 bytes")
      (is (>= 20 (u/string-byte-count out)) "output respects the byte limit"))))

(deftest ^:parallel remapped-table-name-postgres-real-limit-test
  (testing "with the real :postgres limit of 63: a long schema__table concatenation truncates to 54 chars + '_' + 8-char hash"
    ;; raw = "marketing_analytics_warehouse_production__monthly_customer_lifetime_value_summary" (81 chars)
    ;; head-len = 63 - 9 = 54, head = first 54 chars of raw.
    (let [out (:table (ws.table-remapping/remapped-table-name
                       :postgres
                       {:db "" :schema "marketing_analytics_warehouse_production"
                        :table "monthly_customer_lifetime_value_summary"}))]
      (is (= "marketing_analytics_warehouse_production__monthly_cust_x5niligw" out))
      (is (= 63 (count out)) "output is exactly the Postgres identifier limit"))))

(deftest ^:parallel remapped-table-name-mysql-empty-schema-test
  (testing "MySQL has no schema dimension (qualified-name-components is []) -- empty :schema produces __table without throwing"
    (is (= "__orders"
           (:table (ws.table-remapping/remapped-table-name
                    :mysql {:db "" :schema "" :table "orders"}))))))

;;; ------------------------------------------------- cross-schema collision ------------------------------------------------

(deftest add-transform-target-mapping!-cross-schema-collision-test
  (testing "two source tables sharing :name across different :schema land at distinct warehouse identifiers"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-provisioned-workspace-db!
         (mt/id) "ws_collide"
         (fn []
           (let [a-spec (ws.table-remapping/add-transform-target-mapping!
                         (mt/id) {:schema "schemaA" :name "ORDERS" :type :table})
                 b-spec (ws.table-remapping/add-transform-target-mapping!
                         (mt/id) {:schema "schemaB" :name "ORDERS" :type :table})]
             (testing "the two writers return distinct to-side specs"
               (is (= "schemaA__ORDERS" (:name a-spec)))
               (is (= "schemaB__ORDERS" (:name b-spec))))
             (testing "both rows are present and resolve to distinct warehouse names"
               (is (= {:db nil :schema "ws_collide" :name "schemaA__ORDERS"}
                      (ws.table-remapping/remap-table (mt/id) {:schema "schemaA" :name "ORDERS"}))
                   "schemaA.ORDERS resolves to a unique warehouse identifier")
               (is (= {:db nil :schema "ws_collide" :name "schemaB__ORDERS"}
                      (ws.table-remapping/remap-table (mt/id) {:schema "schemaB" :name "ORDERS"}))
                   "schemaB.ORDERS resolves to a different warehouse identifier")))))))))

;;; --------------------------- Pre-sync ordering: to-side has no :model/Table yet -------------------------------
;;;
;;; A `TableRemapping` row can be inserted before sync has run on the workspace's destination schema, so the
;;; `(to_schema, to_table_name)` pair has no corresponding `:model/Table` row in the app DB yet. Every code path
;;; that consumes the remapping must operate on the schema/table strings alone — none should require a hydrated
;;; `:model/Table` for the to-side. These tests pin that contract so a future change that adds `:model/Table`
;;; lookup on the to-side surfaces immediately.

(deftest remap-table-works-without-to-side-model-table-test
  (testing "remap-table returns the [to-schema to-table-name] pair even when no :model/Table exists for it"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [to-schema "ws_unsynced"
             to-table  "orders_workspace_copy"]
         (testing "precondition: no :model/Table row exists for the to-side"
           (is (nil? (t2/select-one :model/Table :db_id (mt/id) :schema to-schema :name to-table))))
         (ws.table-remapping/add-mapping! (mt/id)
                                          {:schema "PUBLIC"   :table "ORDERS"}
                                          {:schema to-schema  :table to-table})
         (is (= {:db nil :schema to-schema :name to-table}
                (ws.table-remapping/remap-table (mt/id) {:schema "PUBLIC" :name "ORDERS"}))
             "remap-table operates on strings only — no :model/Table lookup on the to-side"))))))

(deftest workspace-remap-schema+name-works-without-to-side-model-table-test
  (testing "the sync hook returns [to-schema to-table-name] even when no :model/Table exists for it"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [to-schema "ws_unsynced"
             to-table  "orders_workspace_copy"]
         (is (nil? (t2/select-one :model/Table :db_id (mt/id) :schema to-schema :name to-table))
             "precondition: no :model/Table row exists for the to-side")
         (ws.table-remapping/add-mapping! (mt/id)
                                          {:schema "PUBLIC"   :table "ORDERS"}
                                          {:schema to-schema  :table to-table})
         (is (= {:db nil :schema to-schema :name to-table}
                (ws.table-remapping/workspace-remap-schema+name (mt/id) {:schema "PUBLIC" :name "ORDERS"}))
             "sync hook returns the remap pair regardless of to-side sync state"))))))

(deftest all-mappings-for-db-works-without-to-side-model-tables-test
  (testing "all-mappings-for-db returns rows whose to-side has no :model/Table yet"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping! (mt/id) {:schema "PUBLIC" :table "ORDERS"}   {:schema "ws_unsynced" :table "orders_copy"})
       (ws.table-remapping/add-mapping! (mt/id) {:schema "PUBLIC" :table "PEOPLE"}   {:schema "ws_unsynced" :table "people_copy"})
       (ws.table-remapping/add-mapping! (mt/id) {:schema "PUBLIC" :table "PRODUCTS"} {:schema "ws_unsynced" :table "products_copy"})
       (let [mappings (ws.table-remapping/all-mappings-for-db (mt/id))]
         (is (= {{:db "" :schema "PUBLIC" :table "ORDERS"}   {:db "" :schema "ws_unsynced" :table "orders_copy"}
                 {:db "" :schema "PUBLIC" :table "PEOPLE"}   {:db "" :schema "ws_unsynced" :table "people_copy"}
                 {:db "" :schema "PUBLIC" :table "PRODUCTS"} {:db "" :schema "ws_unsynced" :table "products_copy"}}
                mappings)
             "all-mappings-for-db is purely (db, schema, name) string-based — no :model/Table required"))))))

;; ----------------------------- spec-for-table -----------------------------
;;
;; Per-driver hierarchy resolution. Verifies the {db, schema, table} shape we'd
;; persist in `:model/TableRemapping` rows for a given (database, table) pair.

(deftest ^:parallel spec-for-table-h2-test
  (testing "H2 (default test driver) populates :schema only"
    (let [database  {:engine :h2 :name "test-data (h2)"}
          table-row {:name "ORDERS" :schema "PUBLIC"}
          spec      (ws.table-remapping/spec-for-table database table-row)]
      (is (= "" (:db spec)) "db slot is the empty-string sentinel for non-catalog drivers")
      (is (= "PUBLIC" (:schema spec)))
      (is (= "ORDERS" (:table spec))))))

(deftest ^:parallel spec-for-table-mysql-engine-test
  (testing "MySQL populates neither :db nor :schema (bare table)"
    (let [database {:engine :mysql :name "test-data"}
          table    {:name "orders" :schema nil}
          {:keys [db schema]} (ws.table-remapping/spec-for-table database table)]
      (is (= "" db))
      (is (= "" schema)))))

;; The clickhouse / bigquery `spec-for-table` tests below exercise the per-driver branches
;; of `engine-namespace-positions`. They require the driver to be loaded —
;; not for warehouse interaction, but because `(driver/qualified-name-components engine)`
;; triggers driver lazy-load via `dispatch-on-initialized-driver`. Skipped when the driver
;; isn't on the test classpath.

(deftest spec-for-table-clickhouse-engine-test
  (when (workspaces.tu/driver-loadable? :clickhouse)
    (testing "ClickHouse fills :schema from the Table row's :schema column (CH sync stores its database name there)"
      (let [database (assoc (t2/select-one :model/Database :id (mt/id)) :engine :clickhouse)
            table    (t2/select-one :model/Table :id (mt/id :orders))
            {:keys [db schema]} (ws.table-remapping/spec-for-table database table)]
        (is (= "" db) "no catalog level on ClickHouse")
        (is (= (:schema table) schema)
            "schema-position reads off Table.:schema (= CH warehouse database name as recorded by sync)")))))

(deftest spec-for-table-bigquery-engine-test
  (when (workspaces.tu/driver-loadable? :bigquery-cloud-sdk)
    (testing "BigQuery fills :db from connection details :project-id"
      (let [database {:engine :bigquery-cloud-sdk
                      :name "ignored"
                      :details {:project-id "my-proj"}}
            table    {:name "orders" :schema "ds"}
            {:keys [db schema table]} (ws.table-remapping/spec-for-table database table)]
        (is (= "my-proj" db))
        (is (= "ds" schema))
        (is (= "orders" table))))))

(deftest spec-for-table-bigquery-no-project-id-test
  (when (workspaces.tu/driver-loadable? :bigquery-cloud-sdk)
    (testing "BigQuery without explicit :project-id leaves :db empty (does not leak credentials blob)"
      (let [database {:engine :bigquery-cloud-sdk
                      :name "ignored"
                      :details {:service-account-json "{\"private_key\": \"secret\"}"}}
            table    {:name "orders" :schema "ds"}
            {:keys [db]} (ws.table-remapping/spec-for-table database table)]
        (is (= "" db) "service-account-json must NOT be used as a project id")))))

;; ----------------------------- Per-driver addressing truth table -----------------------------
;;
;; Mirrors the per-driver table in
;;   ai-reports/2026-05-01-canonical-table-addressing-scheme.md
;; Update both together. This is the executable spec for the addressing contract:
;;
;;   1. `qualified-name-components` returns the documented value per driver.
;;   2. `spec-for-table` populates exactly the slots `qualified-name-components`
;;      lists, with empty-string sentinels everywhere else.
;;
;; Pure: no warehouse connection. Each row needs the driver class on the test
;; classpath — `workspaces.tu/driver-loadable?` skip pattern is reused.

(def ^:private addressing-truth-table
  "Per-driver addressing contract. Each row:
     [driver           expected-components   db-name-or-details          table-row                                expected-spec]

   `db-name-or-details` is the canonical Database row data the test uses. For
   drivers where the rewriter only cares about `:name` (Postgres/Redshift/H2/
   MySQL/ClickHouse) we pass a `:name`. For BigQuery we pass `:details
   {:project-id ...}` — that's the only detail key `spec-for-table` reads, and
   making it visible here documents the load-bearing contract."
  ;; driver               components       database-fields                                  table-row                          expected-spec
  [[:postgres             [:schema]        {:name "analytics"}                              {:schema "public"  :name "orders"} {:db ""              :schema "public"   :table "orders"}]
   [:redshift             [:schema]        {:name "analytics"}                              {:schema "public"  :name "orders"} {:db ""              :schema "public"   :table "orders"}]
   [:h2                   [:schema]        {:name "mem:test"}                               {:schema "PUBLIC"  :name "ORDERS"} {:db ""              :schema "PUBLIC"   :table "ORDERS"}]
   [:mysql                [:db]            {:name "ignored" :details {:db "analytics"}}     {:schema nil      :name "orders"} {:db "analytics"     :schema ""         :table "orders"}]
   [:clickhouse           [:schema]        {:name "ignored"}                                {:schema "analytics" :name "events"} {:db ""              :schema "analytics" :table "events"}]
   [:sqlserver            [:db :schema]    {:name "ignored" :details {:db "AnalyticsDB"}}   {:schema "dbo"    :name "orders"} {:db "AnalyticsDB"   :schema "dbo"      :table "orders"}]
   [:bigquery-cloud-sdk   [:db :schema]    {:name "ignored" :details {:project-id "metabase-prod"}} {:schema "core"   :name "orders"} {:db "metabase-prod" :schema "core"     :table "orders"}]])

(deftest ^:parallel addressing-truth-table-qualified-name-components-test
  (testing "qualified-name-components returns the documented AST positions per driver"
    (doseq [[driver expected-components & _] addressing-truth-table]
      (when (workspaces.tu/driver-loadable? driver)
        (testing (str driver)
          (is (= expected-components
                 (driver/qualified-name-components driver))
              "Update the canonical-table-addressing scheme doc and this row together if this changes."))))))

(deftest ^:parallel addressing-truth-table-spec-for-table-test
  (testing "spec-for-table produces the documented {:db, :schema, :table} shape per driver"
    (doseq [[driver _components db-fields table-row expected-spec] addressing-truth-table]
      (when (workspaces.tu/driver-loadable? driver)
        (testing (str driver)
          (let [database (assoc db-fields :engine driver)]
            (is (= expected-spec
                   (ws.table-remapping/spec-for-table database table-row)))))))))

(deftest ^:parallel addressing-truth-table-slot-population-invariant-test
  (testing "Invariant: slot is non-empty iff qualified-name-components includes it"
    (doseq [[driver components db-fields table-row _expected-spec] addressing-truth-table]
      (when (workspaces.tu/driver-loadable? driver)
        (testing (str driver)
          (let [database  (assoc db-fields :engine driver)
                spec      (ws.table-remapping/spec-for-table database table-row)
                comp-set  (set components)]
            (is (= (contains? comp-set :db) (not= "" (:db spec)))
                (str ":db slot population must match qualified-name-components — got "
                     (pr-str spec)))
            (is (= (contains? comp-set :schema) (not= "" (:schema spec)))
                (str ":schema slot population must match qualified-name-components — got "
                     (pr-str spec)))))))))

;; ----------------------------- Cache invalidation hooks -----------------------------
;;
;; Inserting or deleting a TableRemapping must invalidate the QP results cache for the
;; affected database. Otherwise a query cached *before* a remap was registered would
;; silently return canonical-table results forever — Phase 2's SQL rewriter never runs
;; on cache hits, so a stale entry leaks production data into the workspace.

(defn- cache-config-invalidated-at [db-id]
  (t2/select-one-fn :invalidated_at :model/CacheConfig
                    :model    "database"
                    :model_id db-id))

(defn- with-database-cache-config!
  "Ensure a `:database` CacheConfig row exists for `db-id` with a known `invalidated_at`.
   Runs `f` with the row's actual stored `invalidated_at` (read back to avoid
   `OffsetDateTime` vs `ZonedDateTime` typing mismatches across drivers) and cleans
   up the row on the way out."
  [db-id f]
  (try
    (t2/insert! :model/CacheConfig
                {:model           "database"
                 :model_id        db-id
                 :strategy        :ttl
                 :config          {:multiplier 10 :min_duration_ms 1}
                 :invalidated_at  (t/offset-date-time 2020 1 1)})
    (f (cache-config-invalidated-at db-id))
    (finally
      (t2/delete! :model/CacheConfig :model "database" :model_id db-id))))

(deftest cache-invalidation-on-insert-test
  (testing "inserting a TableRemapping bumps cache_config.invalidated_at for the database"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-database-cache-config!
         (mt/id)
         (fn [initial-invalidated-at]
           (ws.table-remapping/add-mapping!
            (mt/id)
            {:schema "PUBLIC" :table "ORDERS"}
            {:schema "ws_schema" :table "orders_copy"})
           (let [after (cache-config-invalidated-at (mt/id))]
             (is (some? after) "cache config still exists")
             (is (t/after? after initial-invalidated-at)
                 "invalidated_at was bumped past its previous value"))))))))

(deftest cache-invalidation-on-delete-test
  (testing "deleting a TableRemapping bumps cache_config.invalidated_at for the database"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-database-cache-config!
         (mt/id)
         (fn [_]
           (ws.table-remapping/add-mapping!
            (mt/id)
            {:schema "PUBLIC" :table "ORDERS"}
            {:schema "ws_schema" :table "orders_copy"})
           (let [post-insert (cache-config-invalidated-at (mt/id))]
             (Thread/sleep (long 10)) ; ensure timestamp clock advances
             (ws.table-remapping/remove-mapping! (mt/id) {:schema "PUBLIC" :table "ORDERS"})
             (let [post-delete (cache-config-invalidated-at (mt/id))]
               (is (t/after? post-delete post-insert)
                   "delete bumped invalidated_at past its post-insert value")))))))))

(deftest cache-invalidation-only-affects-target-database-test
  (testing "inserting a remap on db A doesn't invalidate db B's cache config"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [other-db-id 999999]
         (with-database-cache-config!
           (mt/id)
           (fn [_]
             (with-database-cache-config!
               other-db-id
               (fn [other-initial]
                 (ws.table-remapping/add-mapping!
                  (mt/id)
                  {:schema "PUBLIC" :table "ORDERS"}
                  {:schema "ws_schema" :table "orders_copy"})
                 (let [other-after (cache-config-invalidated-at other-db-id)]
                   (is (= (t/instant other-initial) (t/instant other-after))
                       "the other database's invalidated_at is untouched")))))))))))

;;; -------------------------- DEV-1898: filter-workspace-side-tables --------------------------

(deftest filter-workspace-side-tables-no-rows-test
  (testing "without any remap rows, the filter is identity"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [tuples #{{:schema "public" :name "orders"}
                      {:schema "public" :name "users"}}]
         (is (= tuples (ws.table-remapping/filter-workspace-side-tables tuples (mt/id)))))))))

(deftest filter-workspace-side-tables-drops-only-to-side-test
  (testing "with a remap row, only the to-side (schema, name) tuple is dropped"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public"   :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [tuples   #{{:schema "public"   :name "orders"}
                        {:schema "public"   :name "users"}
                        {:schema "ws_alice" :name "orders"}}
             filtered (ws.table-remapping/filter-workspace-side-tables tuples (mt/id))]
         (is (= #{{:schema "public" :name "orders"}
                  {:schema "public" :name "users"}}
                filtered)
             "ws_alice.orders is removed; canonical tuples pass through"))))))

(deftest filter-workspace-side-tables-scoped-by-database-test
  (testing "remappings on db A do not affect filtering on db B"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public"   :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [other-db-id 999999
             tuples      #{{:schema "ws_alice" :name "orders"}}]
         (is (= tuples (ws.table-remapping/filter-workspace-side-tables tuples other-db-id))
             "another database's table-list is untouched"))))))

(deftest sync-tables-and-database-skips-workspace-side-tuples-test
  (testing "DEV-1898: sync-tables-and-database! does not create :model/Table rows for workspace-side tuples"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (mt/with-temp [:model/Table _ {:db_id  (mt/id)
                                      :schema "public"
                                      :name   "dev_1898_orders"}]
         (ws.table-remapping/add-mapping!
          (mt/id)
          {:schema "public"      :table "dev_1898_orders"}
          {:schema "ws_dev_1898" :table "dev_1898_orders"})
         ;; Simulate a driver whose describe-database surfaces both the canonical
         ;; and workspace-isolation schemas.
         (let [fake-metadata {:tables #{{:schema "public"      :name "dev_1898_orders"}
                                        {:schema "ws_dev_1898" :name "dev_1898_orders"}}}]
           (with-redefs [fetch-metadata/db-metadata (constantly fake-metadata)]
             (sync-tables/sync-tables-and-database! (t2/select-one :model/Database (mt/id)))))
         (let [created-pairs (set (t2/select-fn-set (juxt :schema :name)
                                                    :model/Table
                                                    :db_id (mt/id)
                                                    :name  "dev_1898_orders"))]
           (is (contains? created-pairs ["public" "dev_1898_orders"])
               "canonical Table row exists")
           (is (not (contains? created-pairs ["ws_dev_1898" "dev_1898_orders"]))
               "workspace-side Table row is filtered out and never persisted")))))))

;;; -------------------------- expand-schema-names-with-workspace --------------------------

(deftest expand-schema-names-no-rows-test
  (testing "without remap rows, schema-names pass through unchanged"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (is (= ["public" "analytics"]
              (ws.table-remapping/expand-schema-names-with-workspace
               ["public" "analytics"] (mt/id))))))))

(deftest expand-schema-names-adds-workspace-schemas-test
  (testing "input schemas with active remappings get their to-side schema added"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [expanded (ws.table-remapping/expand-schema-names-with-workspace
                       ["public" "analytics"] (mt/id))]
         (is (= #{"public" "analytics" "ws_alice"} (set expanded))
             "ws_alice is appended; analytics (no remap) untouched"))))))

(deftest expand-schema-names-no-duplicates-test
  (testing "expansion does not introduce duplicates if to-schema is already in input"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [expanded (ws.table-remapping/expand-schema-names-with-workspace
                       ["public" "ws_alice"] (mt/id))]
         (is (= 2 (count expanded)) "no duplicate ws_alice")
         (is (= #{"public" "ws_alice"} (set expanded))))))))

;;; -------------------------- rewrite-fk-result-canonical --------------------------

(deftest rewrite-fk-no-remappings-test
  (testing "without remap rows, rows pass through unchanged"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [rows [{:fk-table-schema "public" :fk-table-name "orders" :fk-column-name "user_id"
                    :pk-table-schema "public" :pk-table-name "users"  :pk-column-name "id"}]]
         (is (= rows (ws.table-remapping/rewrite-fk-result-canonical rows (mt/id)))))))))

(deftest rewrite-fk-translates-both-sides-test
  (testing "FK row referencing workspace identifiers on both ends gets translated"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "users"}
        {:schema "ws_alice" :table "users"})
       (let [workspace-row {:fk-table-schema "ws_alice" :fk-table-name "orders" :fk-column-name "user_id"
                            :pk-table-schema "ws_alice" :pk-table-name "users"  :pk-column-name "id"}
             [out]         (ws.table-remapping/rewrite-fk-result-canonical [workspace-row] (mt/id))]
         (is (= "public" (:fk-table-schema out)))
         (is (= "orders" (:fk-table-name out)))
         (is (= "public" (:pk-table-schema out)))
         (is (= "users"  (:pk-table-name out))))))))

(deftest rewrite-fk-leaves-non-remapped-targets-alone-test
  (testing "FK to a canonical-only table (no remap) passes through; remapped end is rewritten"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [row   {:fk-table-schema "ws_alice" :fk-table-name "orders" :fk-column-name "audit_id"
                    :pk-table-schema "audit"    :pk-table-name "events" :pk-column-name "id"}
             [out] (ws.table-remapping/rewrite-fk-result-canonical [row] (mt/id))]
         (is (= "public" (:fk-table-schema out))
             "remapped fk-side is back-translated")
         (is (= "orders" (:fk-table-name out)))
         (is (= "audit"  (:pk-table-schema out))
             "non-remapped pk-side passes through unchanged")
         (is (= "events" (:pk-table-name out))))))))

(deftest rewrite-fk-self-referential-test
  (testing "self-referential FK within a remapped table is translated on both sides"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "employees"}
        {:schema "ws_alice" :table "employees"})
       (let [row   {:fk-table-schema "ws_alice" :fk-table-name "employees" :fk-column-name "manager_id"
                    :pk-table-schema "ws_alice" :pk-table-name "employees" :pk-column-name "id"}
             [out] (ws.table-remapping/rewrite-fk-result-canonical [row] (mt/id))]
         (is (= "public" (:fk-table-schema out)))
         (is (= "public" (:pk-table-schema out)))
         (is (= "employees" (:fk-table-name out)))
         (is (= "employees" (:pk-table-name out))))))))

;;; -------------------------- inject-workspace-canonical-tuples --------------------------

(deftest inject-canonical-tuples-no-rows-test
  (testing "without remap rows, tuples pass through unchanged"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [tuples #{{:schema "public" :name "orders"}}]
         (is (= tuples (ws.table-remapping/inject-workspace-canonical-tuples tuples (mt/id)))))))))

(deftest inject-canonical-tuples-adds-from-side-test
  (testing "for each remap row, the from-side tuple is added so the diff doesn't retire the canonical Table"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "my_transform_output"}
        {:schema "ws_alice" :table "my_transform_output"})
       ;; Simulating describe-database AFTER filter-workspace-side-tables ran:
       ;; only canonical input schema is present, no workspace-side tuples.
       (let [tuples   #{{:schema "public" :name "src"}}
             injected (ws.table-remapping/inject-workspace-canonical-tuples tuples (mt/id))]
         (is (contains? injected {:schema "public" :name "src"})
             "non-remapped canonical tuple still present")
         (is (contains? injected {:schema "public" :name "my_transform_output"})
             "synthetic canonical tuple injected for the remapped table"))))))

(deftest inject-canonical-tuples-deduplicates-test
  (testing "if the canonical tuple is already present (e.g. before the workspace transform was wired up), no duplication"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public" :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [tuples   #{{:schema "public" :name "orders"}}
             injected (ws.table-remapping/inject-workspace-canonical-tuples tuples (mt/id))]
         (is (= 1 (count injected)) "set semantics dedupe by value"))))))

(deftest sync-does-not-retire-canonical-tables-with-active-remappings-test
  (testing "Canonical Table rows whose physical backing is in the isolation schema must not be retired
            on a sync where describe-database doesn't surface the canonical name."
    (clean-db-fixture!
     (mt/id)
     (fn []
       (mt/with-temp [:model/Table _ {:db_id  (mt/id)
                                      :schema "public"
                                      :name   "ws_canonical_keep"
                                      :active true}]
         (ws.table-remapping/add-mapping!
          (mt/id)
          {:schema "public"   :table "ws_canonical_keep"}
          {:schema "ws_alice" :table "ws_canonical_keep"})
         ;; describe-database returns ONLY the workspace-side tuple (which DEV-1898
         ;; will filter out) and an unrelated canonical table. The canonical
         ;; ws_canonical_keep does not physically exist on the warehouse.
         (let [fake-metadata {:tables #{{:schema "public"   :name "unrelated_table"}
                                        {:schema "ws_alice" :name "ws_canonical_keep"}}}]
           (with-redefs [fetch-metadata/db-metadata (constantly fake-metadata)]
             (sync-tables/sync-tables-and-database! (t2/select-one :model/Database (mt/id)))))
         (let [{:keys [active]} (t2/select-one [:model/Table :active] :db_id (mt/id) :name "ws_canonical_keep")]
           (is (true? active)
               "canonical Table row with an active remap stays active across syncs")))))))

;;; -------------------------- engine-namespace-positions: unknown-engine handling --------------------------
;;;
;;; Third-party drivers participate via `metabase.driver.sql/table-qualification-style`
;;; (+ `db-slot-value` for the `:db-table` and `:db-schema-table` shapes).
;;; The default for drivers that don't override is `:schema-table`, so unknown
;;; engines silently get `{:db nil :schema (:schema table)}` -- the most common
;;; SQL identifier shape, and a safe degrade.

(driver/register! ::ws-test-unknown-driver, :abstract? true)

(deftest engine-namespace-positions-unknown-driver-defaults-to-schema-table-test
  (testing "Unknown engine gets the default :schema-table shape -- no throw, no surprise"
    (is (= {:db nil :schema "public"}
           (ws/engine-namespace-positions {:engine ::ws-test-unknown-driver :name "x"}
                                          {:schema "public" :name "orders"})))))

;;; -------------------------- GHY-3553: MySQL-shape sentinel-leak regressions --------------------------
;;;
;;; MySQL stores `:schema` as `""` (the no-level sentinel) at the storage layer but
;;; sync tuples / FK-result rows / describe-database tuples carry `:schema nil`. Pre-fix,
;;; the three workspace-aware filter/inject/rewrite fns built comparison keys from raw
;;; storage values, so the comparison never matched on schema-less drivers. Result:
;;;
;;;   - `filter-workspace-side-tables` leaked iso-DB tuples through to sync.
;;;   - `inject-workspace-canonical-tuples` failed to inject, so canonical rows were retired.
;;;   - `rewrite-fk-result-canonical` silently no-op'd; iso-DB FK rows leaked.
;;;
;;; The fix (commit db39a79608a) routes both sides of every comparison through
;;; `denormalize-level`. These tests lock that fix in by simulating the MySQL shape:
;;; `add-mapping!` with `:schema nil`, then call the fn with sync tuples carrying
;;; `:schema nil`.

(deftest filter-workspace-side-tables-mysql-shape-test
  (testing "MySQL: storage `\"\"` schema sentinel matches sync `:schema nil` tuple"
    (clean-db-fixture!
     (mt/id)
     (fn []
       ;; MySQL-style mapping: no schema layer; only :db and :table.
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:db "test_data"     :schema nil :table "orders"}
        {:db "ws_iso_alice"  :schema nil :table "orders"})
       ;; Sync surfaces both the canonical and iso-DB tuples with :schema nil.
       (let [tuples   #{{:schema nil :name "orders"}
                        {:schema nil :name "users"}}
             filtered (ws.table-remapping/filter-workspace-side-tables tuples (mt/id))]
         ;; Pre-fix: filtered == tuples (the iso row leaks). Post-fix: orders drops out.
         ;; NOTE: `filter-workspace-side-tables` keys only on `(schema, name)` so it can't
         ;; distinguish canonical-DB orders from iso-DB orders on MySQL. The filter is run
         ;; per-DB at a higher layer; the regression here is that without denormalization
         ;; the row never drops at all (`"" != nil`). See namespace docstring.
         (is (= #{{:schema nil :name "users"}} filtered)
             "iso-DB orders tuple is dropped despite storage `\"\"` vs sync `nil`"))))))

(deftest inject-workspace-canonical-tuples-mysql-shape-test
  (testing "MySQL: synthetic canonical tuple carries `:schema nil` to match sync diff key shape"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:db "test_data"    :schema nil :table "my_output"}
        {:db "ws_iso_alice" :schema nil :table "my_output"})
       ;; Sync diff input: describe-database surfaced only the unrelated table after
       ;; filter-workspace-side-tables ran. The canonical `:schema nil` tuple is absent.
       (let [tuples   #{{:schema nil :name "unrelated"}}
             injected (ws.table-remapping/inject-workspace-canonical-tuples tuples (mt/id))]
         (is (contains? injected {:schema nil :name "my_output"})
             "synthetic canonical tuple uses `:schema nil`, not `\"\"`; sync diff keys won't retire it")
         (is (contains? injected {:schema nil :name "unrelated"})
             "non-remapped tuple passes through"))))))

(deftest rewrite-fk-result-canonical-mysql-shape-test
  (testing "MySQL: FK rows with `:fk-table-schema nil` translate via storage `\"\"` sentinel"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:db "test_data"    :schema nil :table "orders"}
        {:db "ws_iso_alice" :schema nil :table "orders"})
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:db "test_data"    :schema nil :table "users"}
        {:db "ws_iso_alice" :schema nil :table "users"})
       ;; JDBC FK enumeration in the iso DB returns rows whose schema is nil (MySQL
       ;; has no schema layer). Pre-fix, the storage `""` schema sentinel built a
       ;; lookup key `["" "orders"]` that never matched the row's `[nil "orders"]`.
       (let [row   {:fk-table-schema nil :fk-table-name "orders" :fk-column-name "user_id"
                    :pk-table-schema nil :pk-table-name "users"  :pk-column-name "id"}
             [out] (ws.table-remapping/rewrite-fk-result-canonical [row] (mt/id))]
         ;; Output schemas are denormalized too: storage `""` -> output `nil`.
         (is (nil? (:fk-table-schema out))
             "fk-side schema rewrites to canonical (denormalized nil)")
         (is (= "orders" (:fk-table-name out))
             "fk-side name rewrites to canonical")
         (is (nil? (:pk-table-schema out))
             "pk-side schema rewrites to canonical (denormalized nil)")
         (is (= "users" (:pk-table-name out))
             "pk-side name rewrites to canonical"))))))
