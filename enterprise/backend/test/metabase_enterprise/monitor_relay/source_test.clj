(ns metabase-enterprise.monitor-relay.source-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase-enterprise.monitor-relay.rows-test :as rows-test]
   [metabase-enterprise.monitor-relay.source :as relay.source]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.app-db.core :as mdb]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(deftest ^:parallel chunks-test
  (testing "chunks keep order and hold at most max-rows rows"
    (is (= [[{:id 1} {:id 2}] [{:id 3} {:id 4}] [{:id 5}]]
           (relay.source/chunks (map #(hash-map :id %) [1 2 3 4 5]) 2 1000)))
    (is (= [] (relay.source/chunks [] 2 1000))))
  (testing "a chunk ends before it passes max-bytes, but always holds a row"
    ;; Each row is 109 bytes of JSON with its separator.
    (let [row {:x (apply str (repeat 100 "x"))}]
      (is (= [[row] [row] [row]] (relay.source/chunks [row row row] 10 150)))
      (is (= [[row row] [row]] (relay.source/chunks [row row row] 10 250)))))
  (testing "each row keeps its JSON, which its request sends"
    (is (every? #(relay.client/json-size %) (first (relay.source/chunks [{:id 1}] 10 1000))))))

(defmacro ^:private with-login-rows
  "Runs `body` with the relay reading a `login` stream whose rows are `rows`."
  {:style/indent 1}
  [rows & body]
  `(let [rows# ~rows]
     (mt/with-dynamic-fn-redefs [relay.db/stream-page   (fn [_stream# after# limit#]
                                                          (take limit# (filter #(> (:event_id %) after#) rows#)))
                                 relay.db/stream-range  (fn [_stream# lo# hi# limit#]
                                                          (take limit# (filter #(<= lo# (:event_id %) hi#) rows#)))
                                 relay.source/sequences (fn [& _streams#] {:login 99})]
       ~@body)))

(defn- ids [page]
  (map :event_id (:rows page)))

(deftest ^:parallel page-test
  (with-login-rows (map #(hash-map :event_id %) [1 2 3 7 8 9 10 11])
    (testing "a page re-reads the gaps, then reads above next_from, in id order, with the sequence value"
      (let [page (relay.source/page :login {:next_from 8, :gaps [[4 6] [2 3]]} true 100)]
        (is (= [2 3 9 10 11] (ids page)))
        (is (= {:gap_reads [[2 3] [4 6]], :sequence 99, :more? false} (dissoc page :rows)))))
    (testing "gap rows count against the page's rows; a full page says more rows may remain"
      (let [page (relay.source/page :login {:next_from 8, :gaps [[2 6]]} true 3)]
        (is (= [2 3 9] (ids page)))
        (is (= [[2 6]] (:gap_reads page)))
        (is (:more? page))))
    (testing "a gap read that stops at the limit covers only up to the last id it read"
      (let [page (relay.source/page :login {:next_from 8, :gaps [[1 8]]} true 2)]
        (is (= [1 2] (ids page)))
        (is (= [[1 2]] (:gap_reads page)))
        (is (:more? page))))
    (testing "without gaps? the page reads no gap"
      (let [page (relay.source/page :login {:next_from 8, :gaps [[1 8]]} false 100)]
        (is (= [9 10 11] (ids page)))
        (is (= [] (:gap_reads page)))))
    (testing "next_from defaults to 0"
      (is (= [1 2 3] (ids (relay.source/page :login {} true 3)))))
    (testing "a gap that reaches above next_from sends each row once, in id order"
      (is (= [8 9 10 11] (ids (relay.source/page :login {:next_from 8, :gaps [[8 10]]} true 100)))))))

(deftest ^:parallel page-sequence-test
  (testing "a page reads its own stream's sequence value, after its rows"
    (let [reads (atom [])]
      (mt/with-dynamic-fn-redefs [relay.db/stream-page   (fn [& _] (swap! reads conj :rows) [{:event_id 1}])
                                  relay.source/sequences (fn [& args] (swap! reads conj (vec args)) {:login 9})]
        (is (= 9 (:sequence (relay.source/page :login {:next_from 0} false 10))))
        (is (= [:rows [[:login]]] @reads))))))

(deftest ^:parallel page-cut-test
  (testing "a page that passes the body size is cut, and its gap reads cover only the rows it sends"
    (let [big (apply str (repeat (* 3 1024 1024) "x"))]
      (with-login-rows (concat (map #(hash-map :event_id %, :user_agent big) [1 2 3])
                               (map #(hash-map :event_id %) [7 8]))
        (let [page (relay.source/page :login {:next_from 6, :gaps [[1 3] [4 5]]} true 100)]
          (is (= [1 2] (ids page)))
          (is (= [[1 2]] (:gap_reads page)))
          (is (:more? page)))))))

(deftest ^:parallel change-page-cut-test
  (testing "a change page whose state passes the body size sends fewer log rows, with the state they touch"
    (let [big     (apply str (repeat (* 3 1024 1024) "x"))
          entries (for [id (range 1 5)] {:id id, :table_name "report_card", :row_id id, :action "update"})]
      (mt/with-dynamic-fn-redefs [relay.db/stream-page   (fn [_stream after limit]
                                                           (take limit (filter #(> (:id %) after) entries)))
                                  relay.source/sequences (fn [& _streams] {:change 4})
                                  relay.db/state-rows    (fn [_kind [_read _column ids]]
                                                           (for [id ids] {:id id, :card_id id, :name big}))]
        (let [page (relay.source/page :change {:next_from 0} false 100)]
          (is (= [1 2] (map :id (:rows page))))
          (is (= [1 2] (map :id (get-in page [:state :card :rows]))))
          (is (=? {:sequence 4, :more? true} page)))))))

(deftest change-page-growth-test
  (let [fields     {5 100}
        wide       (apply str (repeat 600 "é"))
        reads      (atom 0)
        read-state (mt/original-fn #'relay.source/read-state)
        page       (fn [entries next-from]
                     (reset! reads 0)
                     (with-redefs [relay.source/max-body-bytes 2000]
                       (mt/with-dynamic-fn-redefs
                         [relay.db/stream-page    (fn [_stream after limit]
                                                    (take limit (filter #(> (:id %) after) entries)))
                          relay.source/sequences  (fn [& _streams] {:change (count entries)})
                          relay.source/read-state (fn [found part]
                                                    (swap! reads + (count part))
                                                    (read-state found part))
                          relay.db/state-rows     (fn [kind [_read _column ids]]
                                                    (case kind
                                                      :table (for [id ids] {:id id, :table_id id, :name (str "t" id)})
                                                      :field (for [table-id ids, i (range (fields table-id 1))]
                                                               {:id (+ (* 1000 table-id) i), :table_id table-id})
                                                      :card  (for [id ids] {:id id, :card_id id, :name wide})))]
                         (relay.source/page :change {:next_from next-from} false 100))))
        tables     (vec (for [id (range 1 9)] {:id id, :table_name "metabase_table", :row_id id, :action "update"}))]
    (testing "a change page tries the first 1, 2, 4, ... log rows, and sends the longest whose state fits: here the
              fifth table's 100 fields cut it after the fourth"
      (let [{:keys [rows state more?]} (page tables 0)]
        (is (= [1 2 3 4] (map :id rows)))
        (is (= [1 2 3 4] (map :id (get-in state [:table :rows]))))
        (is (= #{1 2 3 4} (set (map :table_id (get-in state [:field :rows])))))
        (is (true? more?))
        (testing "it reads each log row's state once, and the state of at most twice the log rows it sends"
          (is (= 8 @reads)))))
    (testing "one log row goes with its state, whatever its size"
      (let [{:keys [rows state]} (page tables 4)]
        (is (= [5] (map :id rows)))
        (is (= 100 (count (get-in state [:field :rows]))))
        (is (= 1 @reads))))
    (testing "the size is the state's JSON in UTF-8 bytes: two cards of 600 two-byte characters do not fit in 2000"
      (is (= [1] (map :id (:rows (page [{:id 1, :table_name "report_card", :row_id 1, :action "update"}
                                        {:id 2, :table_name "report_card", :row_id 2, :action "update"}]
                                       0))))))))

(defn- first-row-of
  "A `first-row` for [[relay.source/floor-search]] over `times`, a map of id to time, and `cutoff`. It counts its reads
  in `reads`."
  [times cutoff reads]
  (let [rows (into (sorted-map) times)]
    (fn [id]
      (swap! reads inc)
      (when-let [[row-id time] (first (subseq rows >= id))]
        {:id row-id, :after? (>= time cutoff)}))))

(deftest ^:parallel floor-search-test
  (let [times (into {} (for [id (range 1 101) :when (not (#{5 6 7 50} id))] [id (* 10 id)]))
        floor #(relay.source/floor-search (first-row-of times % (atom 0)) 100)]
    (testing "the floor is the first row whose time is at or after the cutoff, past missing ids"
      (is (= [1 1 2 4 8 51 100] (map floor [0 10 11 40 41 495 1000]))))
    (testing "nil when no row is at or after the cutoff"
      (is (nil? (floor 1001))))
    (testing "rows above top are not searched"
      (is (nil? (relay.source/floor-search (first-row-of times 700 (atom 0)) 60)))))
  (testing "it reads about log2 of top rows"
    (let [reads (atom 0)]
      (is (= 123456789 (relay.source/floor-search (fn [id]
                                                    (swap! reads inc)
                                                    {:id id, :after? (>= id 123456789)})
                                                  1000000000)))
      (is (<= @reads 30)))))

(deftest ^:parallel history-floors-test
  (let [since (atom [])]
    (mt/with-dynamic-fn-redefs [relay.source/sequences (fn [] {:change 5, :login 50, :execution 70, :view 9, :audit 30})
                                relay.db/time-floor    (fn [stream instant]
                                                         (swap! since conj instant)
                                                         ({:login 12, :view 15} stream))
                                relay.db/first-row     (fn [_stream id instant]
                                                         (swap! since conj instant)
                                                         (when (<= id 40) {:id id, :after? (>= id 20)}))]
      (testing "per fact stream, the earliest row at or after since, and at most the sequence value + 1; the change log
                has no history"
        (is (= {:login 12, :execution 71, :view 10, :audit 20}
               (relay.source/history-floors "2026-06-24T10:00:00Z"))))
      (testing "since may carry an offset; the queries take it as an instant"
        (is (= {:login 12, :execution 71, :view 10, :audit 20}
               (relay.source/history-floors "2026-06-24T10:00:00.000000+00:00")))
        (is (= #{(t/instant "2026-06-24T10:00:00Z")} (set @since)))))
    (testing "a stream whose sequence value is unknown is left out"
      (mt/with-dynamic-fn-redefs [relay.source/sequences (fn [] {:login 50})
                                  relay.db/time-floor    (fn [_ _] nil)]
        (is (= {:login 51} (relay.source/history-floors "2026-06-24T10:00:00Z")))))))

(deftest tracked-settings-test
  (testing "the tracked settings that the app DB or the environment sets, as Metabase applies them"
    (mt/with-temporary-setting-values [report-timezone    "Europe/Lisbon"
                                       download-row-limit nil
                                       site-name          "Not tracked"]
      (mt/with-temp-env-var-value! [mb-enable-public-sharing "false"]
        (let [tracked (relay.source/tracked-settings)]
          (is (= {"enable-public-sharing" "false", "report-timezone" "Europe/Lisbon"}
                 (select-keys tracked ["enable-public-sharing" "report-timezone" "download-row-limit" "site-name"])))
          (is (every? #(or (#{"enable-public-sharing" "report-timezone" "download-row-limit" "site-url"} %)
                           (str/starts-with? % "enable-embedding"))
                      (keys tracked)))
          (is (every? string? (vals tracked))))))))

(deftest sync-report-test
  (when-not (= :h2 (mdb/db-type))
    (mt/with-temporary-setting-values [report-timezone "Europe/Lisbon"]
      (let [report (relay.source/sync-report "boot" true nil)]
        (testing "the /sync report carries the relay's version, whether Metabase logs its changes, and the tracked
                  settings with the others"
          (is (=? {:relay_version "0.4.0"
                   :boot_id       "boot"
                   :settings      {:log_enabled boolean?
                                   :change_log  true
                                   :tracked     {"report-timezone" "Europe/Lisbon"}}}
                  report))
          (is (= (relay.source/tracked-settings) (get-in report [:settings :tracked]))))
        (testing "the change log is reported as a stream, with its smallest id"
          (is (int? (get-in report [:sequences :change])))
          (is ((some-fn nil? int?) (:change_oldest report))))
        (testing "each fact once: a tracked setting is not also a field of its own"
          (is (= #{:node_id :boot_id :relay_version :metabase_version :site_uuid :capabilities :settings :sequences
                   :change_oldest}
                 (set (keys report))))
          (is (= #{:log_enabled :change_log :pii_retention :source_address_header :not_behind_proxy :tracked}
                 (set (keys (:settings report))))))
        (testing "the history floors go only when there are some"
          (is (= {:since "s1", :floors {:login 1}}
                 (:history (relay.source/sync-report "boot" true {:since "s1", :floors {:login 1}}))))
          (is (not (contains? report :history))))))))

(deftest app-db-capabilities-test
  (when-not (= :h2 (mdb/db-type))
    (testing "the capabilities are the flags of the Monitor's rows.yaml"
      (let [capabilities (relay.source/capabilities*)]
        (is (= #{:data_sensitivity :user_data_sensitivity :login_history :view_log_populated :audit_log_populated
                 :pulse_tables :notification_tables :snippets :tenants :login_attributes}
               (set (keys capabilities))))
        (is (every? boolean? (vals capabilities)))
        (is (=? {:data_sensitivity    true
                 :login_history       true
                 :notification_tables true
                 :tenants             true
                 :login_attributes    true}
                capabilities))))))

(defn- store-as-is!
  "Stores `value` in `column` of the row of `table` with `id`, past the model's transforms."
  [table column id value]
  (t2/query [(format "UPDATE %s SET %s = ? WHERE id = ?" table column) value id]))

(defn- row-of [kind id-key id]
  (first (filter #(= id (id-key %)) (relay.rows/encode kind (relay.db/state-rows kind [:in (relay.sql/state-id kind) [id]])))))

(deftest postgres-sequence-after-setval-test
  (when (= :postgres (mdb/db-type))
    (testing "a sequence moved with setval(..., false), as a restore leaves it, reports the highest id given out"
      (let [seq-name (:execution (t2/query-one [(relay.sql/postgres-sequence-names-sql)]))
            top      (or (:m (t2/query-one ["SELECT max(id) AS m FROM query_execution"])) 0)]
        (t2/query [(str "SELECT setval('" seq-name "', " (inc top) ", false)")])
        (is (= top (:execution (relay.source/sequences))))))))

(deftest postgres-sequence-of-a-copied-serial-default-test
  (when (= :postgres (mdb/db-type))
    (testing "a column whose serial default was copied with LIKE ... INCLUDING ALL owns no sequence, as Metabase's 064
              migration leaves query_execution; the relay finds the sequence through the default"
      (try
        (t2/query ["CREATE TABLE relay_seq_old (id serial PRIMARY KEY)"])
        (t2/query ["CREATE TABLE relay_seq_new (LIKE relay_seq_old INCLUDING ALL)"])
        (is (nil? (:s (t2/query-one ["SELECT pg_get_serial_sequence('relay_seq_new', 'id') AS s"]))))
        (is (= "relay_seq_old_id_seq"
               (:seq (t2/query-one [(relay.sql/postgres-default-sequence-sql "relay_seq_new")]))))
        (finally
          (t2/query ["DROP TABLE IF EXISTS relay_seq_new"])
          (t2/query ["DROP TABLE IF EXISTS relay_seq_old"]))))))

(deftest app-db-test
  (when-not (= :h2 (mdb/db-type))
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (let [public-uuid (str (random-uuid))
            details     "{\"emails\":[\"outside@example.com\"]}"]
        (mt/with-temp [:model/Database          db      {:engine :postgres}
                       :model/User              user    {:email "relay-user@example.com"}
                       :model/Card              card    {:database_id (:id db), :public_uuid public-uuid}
                       :model/QueryExecution    qe      {:hash         (qp.util/query-hash {})
                                                         :running_time 1
                                                         :result_rows  1
                                                         :native       true
                                                         :error        "boom"
                                                         :executor_id  (:id user)
                                                         :card_id      (:id card)
                                                         :context      :ad-hoc
                                                         :started_at   (OffsetDateTime/parse
                                                                        "2026-10-27T22:04:05.123456Z")}
                       :model/Table             table   {:db_id (:id db), :visibility_type nil}
                       :model/TableUserSettings _       {:table_id (:id table), :visibility_type :hidden
                                                         :visibility_type_set true}
                       :model/Field             field   {:table_id (:id table), :semantic_type :type/Category}
                       :model/FieldUserSettings _       {:field_id (:id field), :semantic_type :type/Email
                                                         :semantic_type_set true}
                       :model/Pulse             pulse   {}
                       :model/PulseChannel      channel {:pulse_id (:id pulse), :channel_type :email, :details {}}]
          (testing "an execution reads with its joins, the hash as lower-case hex, and flags as booleans"
            (is (=? {:event_id       (:id qe)
                     :started_at     "2026-10-27T22:04:05.123Z"
                     :user_email     "relay-user@example.com"
                     :card_id        (:id card)
                     :card_is_public true
                     :has_error      true
                     :error_text     "boom"
                     :is_native_flag true
                     :query_hash     #"[0-9a-f]{64}"}
                    (first (relay.rows/encode :execution (relay.db/stream-range :execution (:id qe) (:id qe) 10))))))
          (testing "the execution sequence has given out the execution's id"
            (is (<= (:id qe) (:execution (relay.source/sequences)))))
          (testing "public_uuid is not masked while public sharing is off"
            (is (= public-uuid (:public_uuid (row-of :card :card_id (:id card))))))
          (testing "fields and tables carry the values users set"
            (is (=? {:semantic_type "type/Email", :active true} (row-of :field :field_id (:id field))))
            (is (=? {:visibility_type "hidden"} (row-of :table :table_id (:id table)))))
          ;; Only the relay's reads run under the key: a setting stored without it no longer reads.
          (encryption-test/with-secret-key rows-test/secret-key
            (store-as-is! "report_card" "public_uuid" (:id card) (encryption/encrypt public-uuid))
            (store-as-is! "pulse_channel" "details" (:id channel) (encryption/encrypt details))
            (testing "public_uuid and pulse channel details are decrypted, the details as their stored JSON text"
              (is (= public-uuid (:public_uuid (row-of :card :card_id (:id card)))))
              (is (= details (:details (row-of :pulse_channel :channel_id (:id channel))))))))))))

(deftest app-db-history-floors-test
  (when-not (= :h2 (mdb/db-type))
    (let [user-id (mt/user->id :rasta)
          at      #(OffsetDateTime/parse (str % "T00:00:00Z"))
          login   #(hash-map :user_id user-id, :device_id (str (random-uuid)), :device_description "relay"
                             :ip_address "192.0.2.1", :timestamp (at %))
          view    #(hash-map :user_id user-id, :model "card", :model_id 1, :timestamp (at %))
          qe      #(hash-map :hash (qp.util/query-hash {}), :running_time 1, :result_rows 1, :native false
                             :context :ad-hoc, :started_at (at %))
          audit   #(hash-map :topic :card-create, :user_id user-id, :model "Card", :model_id 1, :details {}
                             :timestamp (at %))]
      ;; The rows from other tests are from now. Postgres partitions query_execution up to soon after now, and a MySQL
      ;; TIMESTAMP ends in 2038.
      (mt/with-temp [:model/LoginHistory   l1 (login "2001-01-01")
                     :model/LoginHistory   l2 (login "2001-01-02")
                     :model/ViewLog        v1 (view "2001-01-01")
                     :model/ViewLog        v2 (view "2001-01-02")
                     :model/QueryExecution q1 (qe "2001-01-01")
                     :model/QueryExecution q2 (qe "2001-01-02")
                     :model/AuditLog       _  (audit "2037-01-01")
                     :model/AuditLog       a2 (audit "2037-01-02")
                     :model/AuditLog       _  (audit "2037-01-03")]
        (testing "a stream with an index on its time finds its earliest row at or after since"
          (doseq [[stream r1 r2] [[:login l1 l2] [:view v1 v2] [:execution q1 q2]]]
            (testing stream
              (is (= (:id r1) (relay.db/time-floor stream (t/instant "2001-01-01T00:00:00Z"))))
              (is (= (:id r2) (relay.db/time-floor stream (t/instant "2001-01-01T12:00:00Z")))))))
        (testing "audit_log finds its floor by a binary search on id"
          (is (= (:id a2) (:audit (relay.source/history-floors "2037-01-01T12:00:00Z")))))
        (testing "with no row at or after since, each floor is the stream's sequence value + 1"
          (is (= (update-vals (dissoc (relay.source/sequences) :change) inc)
                 (relay.source/history-floors "2037-01-04T00:00:00Z"))))))))

;;; ------------------------------------------------- change pages -------------------------------------------------

(defn- app-db? []
  (#{:postgres :mysql} (mdb/db-type)))

(defmacro ^:private with-change-log
  "Runs `body` with Metabase logging its changes."
  [& body]
  `(mt/with-premium-features #{:audit-app}
     (mt/with-temporary-setting-values [~'change-log-enabled true]
       ~@body)))

(defn- logged-by
  "The change log's rows that `thunk` writes, as the relay reads them, start markers aside."
  [thunk]
  (let [top (or (:id (t2/query-one ["SELECT MAX(id) AS id FROM change_log"])) 0)]
    (thunk)
    (vec (remove #(= "*" (:table_name %)) (relay.db/stream-page :change top 1000)))))

(deftest change-state-test
  (when (app-db?)
    (mt/with-temp [:model/Database db      {}
                   :model/Table    renamed {:db_id (:id db), :name "relay_before"}
                   :model/Table    other   {:db_id (:id db), :name "relay_other"}
                   :model/Field    f1      {:table_id (:id renamed), :name "a", :data_sensitivity :PUBLIC}
                   :model/Field    f2      {:table_id (:id renamed), :name "b"}
                   :model/Field    _       {:table_id (:id other), :name "c"}]
      (with-change-log
        (testing "a table rename sends the table, and the fields of that table only, with the new name"
          (let [logged (logged-by #(t2/update! :model/Table (:id renamed) {:name "relay_after"}))
                state  (relay.source/change-state logged)]
            (is (=? [{:table_name "metabase_table", :row_id (:id renamed), :action "update"}] logged))
            (is (= [:field :table] (keys state)))
            (is (=? {:rows [{:id (:id renamed), :name "relay_after"}], :gone []} (:table state)))
            (is (= #{[(:id f1) "relay_after"] [(:id f2) "relay_after"]}
                   (set (map (juxt :id :table_name) (get-in state [:field :rows])))))
            (is (= [] (get-in state [:field :gone])))))
        (testing "a value a user sets on a table sends the table with the value merged in, and no field: a field row
                  takes no value a user sets on its table"
          (let [logged (logged-by #(t2/insert! :model/TableUserSettings {:table_id            (:id other)
                                                                         :visibility_type     :hidden
                                                                         :visibility_type_set true}))
                state  (relay.source/change-state logged)]
            (is (=? [{:table_name "metabase_table_user_settings", :row_id (:id other), :action "insert"}] logged))
            (is (= [:table] (keys state)))
            (is (=? {:rows [{:id (:id other), :visibility_type "hidden"}], :gone []} (:table state)))))
        (testing "a value a user sets sends the field user settings row, and the field with the value merged in"
          (let [logged (logged-by #(t2/insert! :model/FieldUserSettings {:field_id (:id f1), :data_sensitivity :PII}))]
            (is (=? [{:table_name "metabase_field_user_settings", :row_id (:id f1), :action "insert"}] logged))
            (is (=? {:field_user_settings {:rows [{:id (:id f1), :data_sensitivity "PII"}], :gone []}
                     :field               {:rows [{:id (:id f1), :data_sensitivity "PII"}], :gone []}}
                    (relay.source/change-state logged)))))
        (testing "a user clearing the last value deletes the row: it is gone, and the field's own value is back"
          (let [logged (logged-by #(t2/update! :model/FieldUserSettings (:id f1) {:data_sensitivity nil}))]
            (is (=? {:field_user_settings {:rows [], :gone [(:id f1)]}
                     :field               {:rows [{:id (:id f1), :data_sensitivity "PUBLIC"}], :gone []}}
                    (relay.source/change-state logged)))))))
    (mt/with-temp [:model/User                  user  {:email "relay-before@example.com"}
                   :model/PermissionsGroup      group {}
                   :model/Pulse                 pulse {}
                   :model/PulseChannel          pc    {:pulse_id (:id pulse), :channel_type :email, :details {}}
                   :model/PulseChannelRecipient pcr   {:pulse_channel_id (:id pc), :user_id (:id user)}]
      (with-change-log
        (testing "a user's change sends the user, and the recipients that carry the user's email"
          (is (=? {:user                    {:rows [{:id (:id user), :email "relay-after@example.com"}], :gone []}
                   :pulse_channel_recipient {:rows [{:id (:id pcr), :email "relay-after@example.com"}], :gone []}}
                  (relay.source/change-state
                   (logged-by #(t2/update! :model/User (:id user) {:email "relay-after@example.com"}))))))
        (testing "a deleted group is gone"
          (let [logged (logged-by #(t2/delete! :model/PermissionsGroup (:id group)))]
            (is (=? [{:table_name "permissions_group", :row_id (:id group), :action "delete"}] logged))
            (is (= {:group {:rows [], :gone [(:id group)]}}
                   (relay.source/change-state logged)))))
        (testing "a start marker, and a table no kind reads, change no kind"
          (is (= {} (relay.source/change-state [{:id 1, :table_name "*", :row_id 0, :action "start"}
                                                {:id 2, :table_name "collection", :row_id 1, :action "update"}]))))))))

(deftest change-page-test
  (when (app-db?)
    (mt/with-temp [:model/PermissionsGroup group {}]
      (with-change-log
        (let [[entry] (logged-by #(t2/update! :model/PermissionsGroup (:id group) {:name "relay-renamed"}))
              page    (relay.source/page :change {:next_from (dec (:id entry))} false 100)]
          (testing "a change page carries its log rows, its sequence value, and the state rows they touch"
            (is (=? {:rows     [{:id (:id entry), :table_name "permissions_group", :row_id (:id group)
                                 :action "update"}]
                     :sequence #(<= (:id entry) %)
                     :state    {:group {:rows [{:id (:id group), :name "relay-renamed"}], :gone []}}}
                    page))))))))

;;; --------------------------------------------------- snapshots --------------------------------------------------

(deftest snapshot-page-test
  (when (app-db?)
    (mt/with-temp [:model/PermissionsGroup _ {}
                   :model/PermissionsGroup _ {}
                   :model/PermissionsGroup _ {}]
      (let [pages (loop [from 0, pages []]
                    (let [page  (relay.source/snapshot-page :group from 2)
                          pages (conj pages page)]
                      (if (:last page) pages (recur (inc (:to page)) pages))))]
        (testing "a snapshot reads every row of its kind, in id pages of at most the limit, each from the id after the
                  last page's to"
          (is (= (map :id (t2/query ["SELECT id FROM permissions_group ORDER BY id"]))
                 (mapcat #(map :id (:rows %)) pages))))
        (testing "each page but the last ends at its last row's id; the last page is open-ended"
          (is (every? #(and (false? (:last %)) (= (:id (peek (:rows %))) (:to %))) (butlast pages)))
          (is (=? {:to nil, :last true} (peek pages))))
        (testing "each page carries the change log's sequence value"
          (is (every? (comp int? :at) pages)))))))
