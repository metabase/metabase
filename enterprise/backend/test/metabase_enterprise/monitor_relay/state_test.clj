(ns metabase-enterprise.monitor-relay.state-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase-enterprise.monitor-relay.state :as relay.state]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql Connection PreparedStatement SQLException)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- hashes ----------------------------------------------------

;; The vectors of the Monitor's `libs/contract/tests/test_push.py`.

(def ^:private user-row
  {:id 7, :user_id 7, :email "ann@example.com", :first_name "Ann", :last_name "Lée", :is_superuser false
   :is_active true, :sso_source nil, :locale nil, :date_joined "2026-01-01T00:00:00.000Z", :tenant_id nil
   :login_attributes "{\"team\":\"a\"}", :user_type "personal", :last_login "2026-10-28T09:15:02.250Z"
   :_u 1793178902250001, :_h "not part of the hash"})

(def ^:private card-row
  {:id 5, :card_id 5, :name "Orders \"EU\" \\ 🚀", :collection_id nil, :database_id 1, :query_type "native"
   :dataset_query "{\"native\":{\"query\":\"SELECT 1\n\tFROM t\u0001\"}}", :public_uuid nil, :made_public_by_id nil
   :archived false, :type "question"})

(def ^:private membership-row
  {:id 300, :group_id 2, :user_id 7, :present 1})

(defn- json
  "`s` with each single quote as a double quote."
  [s]
  (str/replace s "'" "\""))

(deftest ^:parallel canonical-test
  (testing "keys in order, no whitespace, and neither _h nor _u"
    (is (= (json (str "{'date_joined':'2026-01-01T00:00:00.000Z','email':'ann@example.com','first_name':'Ann','id':7,"
                      "'is_active':true,'is_superuser':false,'last_login':'2026-10-28T09:15:02.250Z','last_name':'Lée',"
                      "'locale':null,'login_attributes':'{\\'team\\':\\'a\\'}','sso_source':null,'tenant_id':null,"
                      "'user_id':7,'user_type':'personal'}"))
           (relay.state/canonical user-row)))
    (is (= "{\"group_id\":2,\"id\":300,\"present\":1,\"user_id\":7}" (relay.state/canonical membership-row))))
  (testing "text escapes the quote, the backslash and the control characters only"
    (is (= "{\"s\":\"\\\"\\\\\\b\\f\\n\\r\\t\\u0001\\u001f/é🚀\u007f\"}"
           (relay.state/canonical {:s "\"\\\b\f\n\r\t\u0001\u001f/é🚀\u007f"}))))
  (testing "every integer type is a decimal integer"
    (is (= "{\"a\":1,\"b\":-2,\"c\":3,\"d\":9007199254740993}"
           (relay.state/canonical {:a (int 1), :b -2, :c (bigint 3), :d (biginteger 9007199254740993)})))))

(deftest ^:parallel non-integer-number-test
  (testing "a row holds no number but an integer: a new column type fails here, not in a hash"
    (doseq [v [1.5 (float 1) 2M :keyword]]
      (is (thrown-with-msg? ExceptionInfo #"hashes only text, integers, booleans and nulls"
                            (relay.state/canonical {:id 1, :x v}))))))

(deftest ^:parallel row-hash-test
  (is (= "155532bebe0d87bc5817f32773f9e33c" (relay.state/row-hash user-row)))
  (is (= "b24fbb2a29b294b9fd836ab764c66590" (relay.state/row-hash card-row)))
  (is (= "b7304c600ecf9bffe9a36fadf68e253e" (relay.state/row-hash membership-row))))

(deftest ^:parallel buckets-test
  (let [rows    (map #(assoc % :_h (relay.state/row-hash %)) [card-row user-row membership-row])
        buckets [[0 2 "edcc05255bcbd6eda2ffe74038fc0152"] [1 1 "de23528f3a0916123693e639d4833b0a"]]]
    (testing "rows in id order fold into buckets of 256 ids"
      (is (= buckets (#'relay.state/fold rows))))
    (testing "a bucket's digest sorts its pairs by id"
      (is (= "edcc05255bcbd6eda2ffe74038fc0152"
             (relay.state/bucket-digest [[7 "155532bebe0d87bc5817f32773f9e33c"]
                                         [5 "b24fbb2a29b294b9fd836ab764c66590"]]))))
    (testing "the root of the buckets, and of a kind with no rows"
      (is (= "91e73d4b9088de2929338dee5273c959" (relay.state/root buckets)))
      (is (= "e3b0c44298fc1c149afbf4c8996fb924" (relay.state/root []))))))

(deftest ^:parallel low-water-test
  (let [r     1793178902250001
        clock #(apply merge {:r r, :o nil, :open-transactions? true} %&)]
    (testing "5 s before now, or before the oldest open transaction's start"
      (is (= (- r 5000000) (relay.state/low-water (clock))))
      (is (= (- r 65000000) (relay.state/low-water (clock {:o (- r 60000000)}))))
      (is (= (- r 5000000) (relay.state/low-water (clock {:o (+ r 1000)})))))
    (testing "at most 1 h before now"
      (is (= (- r 3600000000) (relay.state/low-water (clock {:o (- r 7200000000)})))))
    (testing "2 minutes before now, without a view of the open transactions"
      (is (= (- r 120000000) (relay.state/low-water (clock {:open-transactions? false})))))))

;;; ---------------------------------------------------- posts -----------------------------------------------------

(deftest ^:parallel rows-bodies-test
  (let [row   (fn [id h] {:id id, :_h h})
        lists (sorted-map 0 [[1 "a"] [2 "b"] [3 "c"]], 1 [[256 "x"]], 2 [], 4 [[1024 "y"]])
        rows  [(row 1 "a") (row 2 "B") (row 4 "d") (row 256 "x") (row 1024 "Y") (row 1030 "z")]]
    (testing "a row travels when its id is not listed or its hash differs; a listed id the read did not find is gone"
      (is (= [{:rows [(row 2 "B") (row 4 "d") (row 1024 "Y") (row 1030 "z")], :gone [3], :buckets [0 1 2 4]}]
             (#'relay.state/rows-bodies lists rows 100))))
    (testing "a bucket is in the post that carries the last of its rows; one with nothing to send in the next post"
      (is (= [{:rows [(row 2 "B")], :gone [], :buckets []}
              {:rows [(row 4 "d")], :gone [3], :buckets [0 1 2]}
              {:rows [(row 1024 "Y")], :gone [], :buckets []}
              {:rows [(row 1030 "z")], :gone [], :buckets [4]}]
             (#'relay.state/rows-bodies lists rows 1))))
    (testing "a post may carry only buckets"
      (is (= [{:rows [], :gone [], :buckets [5]}]
             (#'relay.state/rows-bodies (sorted-map 5 [[1280 "q"]]) [(row 1280 "q")] 100))))))

(deftest fetch-bodies-test
  (let [rows (into (sorted-map) (for [id [1 2 3 10 11 12]] [id {:id id, :group_id id, :name (str "g" id)}]))
        ids  (fn [bodies] (map (juxt :ids #(map :id (:rows %))) bodies))]
    (mt/with-dynamic-fn-redefs [relay.db/state-rows (fn [_kind [read & args]]
                                                      (case read
                                                        :ids  (keep rows (first args))
                                                        :page (let [[from limit] args]
                                                                (take limit (vals (subseq rows >= from))))))]
      (testing "the asked rows and the rows above, without the asked ones; an asked id not found goes last"
        (is (= [[[2 11 99] [2 3 10 11 12]]]
               (ids (#'relay.state/fetch-bodies :group [2 99 11] 2 100))))
        (is (= [[[2] [2 3]] [[11 99] [10 11]]]
               (ids (#'relay.state/fetch-bodies :group [2 99 11] 2 2)))))
      (testing "an asked id that was not found has a post of its own"
        (is (= [[[99] []]] (ids (#'relay.state/fetch-bodies :group [99] nil 100)))))
      (testing "no post when nothing was asked or found"
        (is (nil? (#'relay.state/fetch-bodies :group [] 12 100)))
        (is (nil? (#'relay.state/fetch-bodies :group [] nil 100))))
      (testing "the rows carry their hashes"
        (is (= (relay.state/row-hash {:id 1, :group_id 1, :name "g1"})
               (:_h (first (:rows (first (#'relay.state/fetch-bodies :group [1] nil 100)))))))))))

;;; ------------------------------------------------- the app DB --------------------------------------------------

(defn- app-db? []
  (#{:postgres :mysql} (mdb/db-type)))

(defn- now-sql []
  (if (= :mysql (mdb/db-type)) "NOW(6)" "now()"))

(defn- micros-now []
  (:r (relay.db/clock)))

(deftest updated-at-column-test
  (when (app-db?)
    (testing "the relay reads updated_at as an instant: timestamp with time zone on Postgres, timestamp on MySQL"
      (is (= (if (= :mysql (mdb/db-type))
               {"core_user" ["timestamp" 6], "report_card" ["timestamp" 6]}
               {"core_user" ["timestamp with time zone" 6], "report_card" ["timestamp with time zone" 6]})
             (into {}
                   (map (juxt :table_name (juxt :data_type :datetime_precision)))
                   (t2/query [(str "SELECT table_name AS table_name, data_type AS data_type,"
                                   " datetime_precision AS datetime_precision FROM information_schema.columns"
                                   " WHERE table_schema = "
                                   (if (= :mysql (mdb/db-type)) "DATABASE()" "current_schema()")
                                   " AND table_name IN ('core_user', 'report_card')"
                                   " AND column_name = 'updated_at'")])))))))

(deftest updated-at-index-test
  (when-let [indexes (when (app-db?) "('idx_core_user_updated_at', 'idx_report_card_updated_at')")]
    (testing "the migration indexes core_user and report_card by updated_at"
      (is (= #{"idx_core_user_updated_at" "idx_report_card_updated_at"}
             (set (map :index_name
                       (t2/query [(if (= :mysql (mdb/db-type))
                                    (str "SELECT DISTINCT index_name AS index_name FROM information_schema.statistics"
                                         " WHERE table_schema = DATABASE() AND column_name = 'updated_at'"
                                         " AND index_name IN " indexes)
                                    (str "SELECT indexname AS index_name FROM pg_indexes"
                                         " WHERE indexdef LIKE '%(updated_at)'"
                                         " AND indexname IN " indexes))]))))))))

(deftest micros-round-trip-test
  (when (app-db?)
    (mt/with-temp [:model/User user {}]
      (let [t       1793178902250001
            engine  (mdb/db-type)
            move!   #(t2/query [(str "UPDATE core_user SET updated_at = " (#'relay.sql/instant engine) " WHERE id = ?")
                                t (:id user)])
            changed #(set (map :id (relay.db/state-rows :user [:changed % 0 100000])))
            read    #(:_u (first (relay.db/state-rows :user [:ids [(:id user)]])))]
        (if (= :mysql engine)
          (#'relay.db/in-time-zone "+00:00" move!)
          (t2/with-transaction [_]
            (t2/query ["SET LOCAL TIME ZONE 'America/New_York'"])
            (move!)))
        (testing "a time in epoch microseconds becomes a timestamp and back exactly"
          (is (= t (read)))
          (when (= :postgres engine)
            (testing "also with the session in another time zone"
              (t2/with-transaction [_]
                (t2/query ["SET LOCAL TIME ZONE 'America/New_York'"])
                (is (= t (read)))
                (is (contains? (changed t) (:id user)))
                (is (not (contains? (changed (inc t)) (:id user))))))))
        (testing "a delta reads from the exact microsecond"
          (is (contains? (changed t) (:id user)))
          (is (not (contains? (changed (inc t)) (:id user)))))))))

(deftest user-times-test
  (when (app-db?)
    (mt/with-temp [:model/User user {}]
      (let [engine (mdb/db-type)
            at     (#'relay.sql/instant engine)
            move!  #(t2/query [(str "UPDATE core_user SET date_joined = " at ", last_login = " at " WHERE id = ?")
                               1793178902250001 1793178902250001 (:id user)])
            u      (:_u (first (relay.db/state-rows :user [:ids [(:id user)]])))]
        (if (= :mysql engine)
          (#'relay.db/in-time-zone "+00:00" move!)
          (move!))
        (mt/with-system-timezone-id! "America/New_York"
          (testing "a user's times are sent in UTC, also when the JVM runs in another time zone"
            (doseq [read [[:ids [(:id user)]] [:changed u (:id user) 1]]]
              (is (=? [{:id          (:id user)
                        :date_joined "2026-10-28T09:15:02.250Z"
                        :last_login  "2026-10-28T09:15:02.250Z"}]
                      (relay.rows/encode :user (relay.db/state-rows :user read)))
                  (str read)))))))))

(defn- delta-receiver
  "A fake receiver of deltas that keeps C in `cursor` and answers `max(C, next_since)`, as Metabase Monitor does.
  `parts` gets each part it takes."
  [cursor parts]
  (fn [_kind {:keys [next_since] :as body}]
    (swap! parts conj body)
    (swap! cursor (fn [c]
                    (if (and c (pos? (compare [(:t c) (:id c)] [(:t next_since) (:id next_since)])))
                      c
                      next_since)))
    {:status 200, :body {:stored (count (:rows body)), :unchanged 0, :since @cursor}}))

(defn- delta!
  "Runs the relay's delta of `kind` from `since` against `post`, with reads of at most `page-rows`."
  [post kind since page-rows]
  (#'relay.state/delta! {:post post, :page-rows page-rows, :deadline-passed? (constantly false)} kind since))

(defn- execute!
  "Runs `sql` with `params` on `conn`, and returns the rows it changed."
  [^Connection conn ^String sql & params]
  (with-open [^PreparedStatement stmt (.prepareStatement conn sql)]
    (doseq [[i param] (map-indexed vector params)]
      (.setObject stmt (int (inc i)) param))
    (.executeUpdate stmt)))

(defn- query-long [^Connection conn ^String sql]
  (with-open [stmt (.createStatement conn)
              rs   (.executeQuery stmt sql)]
    (.next rs)
    (.getLong rs 1)))

(defn- do-with-committed-user
  "Calls `f` with the id of a new user that other connections see, and deletes the user after. `mt/with-temp` keeps
  its rows in a transaction of its own."
  [f]
  (let [id (t2/insert-returning-pk! :model/User {:email      (str "relay-" (random-uuid) "@example.com")
                                                 :first_name "Before"
                                                 :last_name  "Relay"
                                                 :password   (str (random-uuid))})]
    (try
      (f id)
      (finally
        (t2/delete! :model/User :id id)))))

(deftest open-transaction-test
  (when (app-db?)
    (do-with-committed-user
     (fn [user-id]
       (let [cursor (atom nil)
             parts  (atom [])
             post   (delta-receiver cursor parts)
             since  {:t (- (micros-now) 60000000), :id 0}
             sent   #(set (keep (fn [row] (when (= user-id (:id row)) (:first_name row))) (mapcat :rows @parts)))]
         (with-open [^Connection conn (.getConnection (mdb/data-source))]
           (.setAutoCommit conn false)
           (try
             (let [start (if (= :mysql (mdb/db-type))
                           (do (execute! conn "START TRANSACTION WITH CONSISTENT SNAPSHOT")
                               (query-long conn "SELECT CAST(UNIX_TIMESTAMP(NOW(6)) * 1000000 AS SIGNED)"))
                           (query-long conn (str "SELECT " (#'relay.sql/micros :postgres "now()"))))]
               (is (= 1 (execute! conn (str "UPDATE core_user SET first_name = 'Held', updated_at = " (now-sql)
                                            " WHERE id = ?")
                                  user-id)))
               (when (= :mysql (mdb/db-type))
                 ;; InnoDB fills information_schema.innodb_trx again only once nobody read it for 100 ms.
                 (Thread/sleep 200))
               (testing "the clock sees the open transaction"
                 (is (some? (:o (relay.db/clock)))))
               (reset! cursor since)
               (is (nil? (delta! post :user since 1000)))
               (testing "a delta does not see a change that is not committed, and keeps C before its transaction"
                 (is (contains? (sent) "Before"))
                 (is (not (contains? (sent) "Held")))
                 (is (<= (:t (:next_since (peek @parts))) (- start 5000000)))
                 (is (<= (:t @cursor) (- start 5000000))))
               (.commit conn))
             (finally
               (.rollback conn)
               (.setAutoCommit conn true))))
         (testing "after the commit, the next delta from C returns it"
           (reset! parts [])
           (is (nil? (delta! post :user @cursor 1000)))
           (is (= #{"Held"} (sent)))))))))

(deftest one-updated-at-test
  (when (app-db?)
    (mt/with-temp [:model/User a {}
                   :model/User b {}
                   :model/User c {}
                   :model/User d {}
                   :model/User e {}]
      (let [ids    (sort (map :id [a b c d e]))
            _      (t2/query (into [(str "UPDATE core_user SET updated_at = " (now-sql)
                                         " WHERE id IN (?, ?, ?, ?, ?)")]
                                   ids))
            t      (:_u (first (relay.db/state-rows :user [:ids [(first ids)]])))
            since  {:t t, :id 0}
            cursor (atom since)
            parts  (atom [])]
        (is (nil? (delta! (delta-receiver cursor parts) :user since 2)))
        (testing "users changed in one statement share one updated_at, above L"
          (is (= #{t} (set (map :_u (relay.db/state-rows :user [:ids ids])))))
          (is (< (:t (:next_since (first @parts))) t)))
        (testing "with a limit of 2, three parts send each user once; C stays below them"
          (is (= [[(nth ids 0) (nth ids 1)] [(nth ids 2) (nth ids 3)] [(nth ids 4)]]
                 (map #(map :id (:rows %)) @parts)))
          (is (= [false false true] (map :last @parts))))
        (testing "each part sends the since of the previous answer, and reads from just after the previous part's last
                  row, not from that since"
          (is (= [since since since] (map :since @parts))))))))

(deftest mysql-fallback-test
  (when (= :mysql (mdb/db-type))
    (let [readable @#'relay.db/open-transactions-readable?
          clocks   (atom [])
          clock    (mt/original-fn #'relay.db/clock)]
      (try
        (mt/with-dynamic-fn-redefs [relay.db/mysql-oldest-transaction
                                    (fn []
                                      (throw (SQLException. "Access denied; you need the PROCESS privilege" "42000"
                                                            (int 1227))))
                                    relay.db/clock
                                    (fn []
                                      (let [reading (clock)]
                                        (swap! clocks conj reading)
                                        reading))]
          (let [parts (atom [])
                since {:t (- (micros-now) 1000000), :id 0}]
            (is (nil? (delta! (delta-receiver (atom since) parts) :user since 1000)))
            (testing "without the PROCESS privilege, a delta's last part ends 2 minutes before now"
              (is (=? {:open-transactions? false, :o nil} (peek @clocks)))
              (is (= {:t (- (:r (peek @clocks)) 120000000), :id 0} (:next_since (peek @parts)))))))
        (testing "the relay keeps to the fallback for the rest of this boot"
          (is (false? (:open-transactions? (relay.db/clock)))))
        (finally
          (reset! readable true))))))

(deftest postgres-untracked-test
  (when (= :postgres (mdb/db-type))
    (t2/with-connection [_conn]
      (t2/query ["SET track_activities = off"])
      (try
        (let [clocks (atom [])
              clock  (mt/original-fn #'relay.db/clock)
              parts  (atom [])
              since  {:t (- (micros-now) 1000000), :id 0}]
          (mt/with-dynamic-fn-redefs [relay.db/clock (fn []
                                                       (let [reading (clock)]
                                                         (swap! clocks conj reading)
                                                         reading))]
            (is (nil? (delta! (delta-receiver (atom since) parts) :user since 1000))))
          (testing "with track_activities off, Postgres shows no transaction's start, so a delta's last part ends 2
                    minutes before now"
            (is (=? {:o nil, :open-transactions? false} (peek @clocks)))
            (is (= {:t (- (:r (peek @clocks)) 120000000), :id 0} (:next_since (peek @parts))))))
        (finally
          (t2/query ["RESET track_activities"]))))))

(deftest mysql-time-zone-test
  (when (= :mysql (mdb/db-type))
    (let [seen   (atom nil)
          oldest (mt/original-fn #'relay.db/mysql-oldest-transaction)
          zone   #(:time_zone (t2/query-one ["SELECT @@session.time_zone AS time_zone"]))]
      (mt/with-dynamic-fn-redefs [relay.db/mysql-oldest-transaction (fn []
                                                                      (reset! seen (zone))
                                                                      (oldest))]
        (t2/with-connection [_conn]
          (let [saved (zone)]
            (t2/query ["SET time_zone = '+02:00'"])
            (try
              (relay.db/clock)
              (testing "the relay reads the open transactions in the server's time zone, as InnoDB gives them"
                (is (= "SYSTEM" @seen)))
              (testing "and sets the session's time zone back"
                (is (= "+02:00" (zone)))
                (relay.db/state-rows :user [:page 0 1])
                (is (= "+02:00" (zone))))
              (finally
                (t2/query ["SET time_zone = ?" saved])))))))))

;;; --------------------------------------------------- reads ------------------------------------------------------

(deftest fetch-reads-test
  (when (app-db?)
    (mt/with-temp [:model/PermissionsGroup g1 {}
                   :model/PermissionsGroup g2 {}
                   :model/PermissionsGroup g3 {}]
      (testing "a fetch by ids reads the asked rows that exist"
        (is (= [(:id g1) (:id g3)]
               (sort (map :id (relay.db/state-rows :group [:ids [(:id g1) (:id g3) Integer/MAX_VALUE]]))))))
      (testing "a page reads the ids from one, in order, at most the limit"
        (is (= [(:id g2) (:id g3)] (map :id (relay.db/state-rows :group [:page (:id g2) 2]))))
        (is (= [(:id g3)] (map :id (relay.db/state-rows :group [:page (:id g3) 2]))))))
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db)}
                   :model/Table    t2 {:db_id (:id db)}
                   :model/Field    f1 {:table_id (:id t1)}
                   :model/Field    f2 {:table_id (:id t2)}]
      (testing "fields and tables read through the overlay by ids, and from an id"
        (is (= [(:id f1) (:id f2)] (sort (map :id (relay.db/state-rows :field [:ids [(:id f1) (:id f2)]])))))
        (is (= [(:id f2)] (map :id (relay.db/state-rows :field [:page (:id f2) 10]))))
        (is (= [(:id t2)] (map :id (relay.db/state-rows :table [:page (:id t2) 10]))))))))

(deftest field-user-settings-read-test
  (when (app-db?)
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (:id db)}
                   :model/Field    field {:table_id (:id table), :data_sensitivity :PUBLIC}]
      (let [settings #(relay.rows/encode :field_user_settings
                                         (relay.db/state-rows :field_user_settings [:ids [(:id field)]]))
            merged   #(:data_sensitivity (first (relay.db/state-rows :field [:ids [(:id field)]])))]
        (testing "a value a user sets is a field_user_settings row, and the field's merged value"
          (t2/insert! :model/FieldUserSettings {:field_id (:id field), :data_sensitivity :PII})
          (is (=? [{:id (:id field), :field_id (:id field), :data_sensitivity "PII", :semantic_type_set false}]
                  (settings)))
          (is (= "PII" (merged))))
        (testing "a user clearing the last value deletes the row, and the field's own value is back"
          (t2/update! :model/FieldUserSettings (:id field) {:data_sensitivity nil})
          (is (= [] (settings)))
          (is (= "PUBLIC" (merged))))))))

(deftest pass-pages-by-whole-buckets-test
  (when (app-db?)
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (:id db)}]
      (t2/insert! :model/Field (for [i (range 700)]
                                 {:table_id (:id table), :name (str "f" i), :base_type :type/Text
                                  :database_type "TEXT"}))
      (let [pages      (atom [])
            state-rows (mt/original-fn #'relay.db/state-rows)]
        (mt/with-dynamic-fn-redefs [relay.db/state-rows (fn [kind read]
                                                          (let [rows (state-rows kind read)]
                                                            (swap! pages conj (map :id rows))
                                                            rows))]
          (let [chunk (relay.state/read-chunk :field 0 300)
                all   (state-rows :field [:page 0 Integer/MAX_VALUE])
                kept  (map (fn [page next-page]
                             (if next-page
                               (remove (set next-page) page)
                               page))
                           @pages
                           (concat (rest @pages) [nil]))]
            (testing "with pages of 300 rows, the read takes several pages"
              (is (< 2 (count @pages))))
            (testing "a page leaves its last bucket to the next page, so no bucket is split between pages"
              (is (apply distinct? (mapcat #(distinct (map (fn [id] (quot id 256)) %)) kept))))
            (testing "every row is read once, and the buckets are those of one read of the whole kind"
              (is (= (map :id all) (apply concat kept)))
              (is (= (vec (#'relay.state/fold (#'relay.state/hashed :field all))) (:buckets chunk)))
              (is (nil? (:next chunk))))))))))

;;; ---------------------------------------------------- passes ----------------------------------------------------

(defn- mirror-buckets [mirror]
  (#'relay.state/fold (for [[id h] (sort mirror)] {:id id, :_h h})))

(defn- pass-receiver
  "A fake receiver of state passes that keeps its mirror in `mirror`, an atom of kind to `{id h}`, and hands out the
  buckets that differ 64 at a time. `posts` gets each `[kind body]` it takes."
  [mirror posts]
  (let [passes   (atom {})
        number   (atom 0)
        hand-out (fn [kind pass]
                   (let [{:keys [differ out completed]} (get @passes kind)
                         open  (remove completed out)
                         more  (take (- 64 (count open)) (remove (set out) differ))
                         pairs (fn [b] (vec (filter #(= b (#'relay.state/bucket (key %))) (sort (get @mirror kind)))))]
                     (swap! passes update kind update :out into more)
                     (if (and (empty? open) (empty? more))
                       {:pass pass, :done true}
                       {:pass pass, :done false, :lists (for [b more] [b (pairs b)])})))]
    (fn [kind {:keys [step pass] :as body}]
      (swap! posts conj [kind body])
      {:status 200
       :body   (case step
                 "root"
                 (let [pass (swap! number inc)]
                   (swap! passes assoc kind {:buckets []})
                   {:pass pass, :done (= (:root body) (relay.state/root (mirror-buckets (get @mirror kind))))})

                 "buckets"
                 (do (swap! passes update-in [kind :buckets] into (:buckets body))
                     (if-not (:last body)
                       {:pass pass}
                       (let [by-b   #(into {} (map (fn [[b n d]] [b [n d]])) %)
                             relay  (by-b (get-in @passes [kind :buckets]))
                             mine   (by-b (mirror-buckets (get @mirror kind)))
                             differ (sort (filter #(not= (relay %) (mine %)) (set (concat (keys relay) (keys mine)))))]
                         (swap! passes update kind assoc :differ differ, :out [], :completed #{})
                         (hand-out kind pass))))

                 "rows"
                 (do (swap! mirror update kind #(apply dissoc (into (or % {}) (map (juxt :id :_h)) (:rows body))
                                                       (:gone body)))
                     (swap! passes update-in [kind :completed] into (:buckets body))
                     (hand-out kind pass)))})))

(defn- pass!
  "Runs a state pass of `kind` against `post`, run after run, until it is done."
  [post kind]
  (loop [passes {}, runs 0]
    (let [{:keys [passes failure]} (relay.state/passes! {:post             post
                                                         :page-rows        1000
                                                         :deadline-passed? (constantly false)}
                                                        passes
                                                        {kind {:due true}})]
      (is (nil? failure))
      (when (and (seq passes) (< runs 10))
        (recur passes (inc runs))))))

(defn- sent [posts step]
  (for [[_kind body] posts
        :when (= step (:step body))]
    body))

(deftest deleted-membership-test
  (when (app-db?)
    (mt/with-temp [:model/User                       user  {}
                   :model/PermissionsGroup           group {}
                   :model/PermissionsGroupMembership m     {:user_id (:id user), :group_id (:id group)}]
      (let [mirror (atom {})
            posts  (atom [])
            post   (pass-receiver mirror posts)]
        (pass! post :group_membership)
        (is (contains? (:group_membership @mirror) (:id m)))
        (t2/query ["DELETE FROM permissions_group_membership WHERE id = ?" (:id m)])
        (reset! posts [])
        (pass! post :group_membership)
        (testing "a membership deleted in the app DB is gone at the next pass's bucket read"
          (is (= [[(:id m)]] (keep (comp not-empty :gone) (sent @posts "rows"))))
          (is (= [] (mapcat :rows (sent @posts "rows"))))
          (is (not (contains? (:group_membership @mirror) (:id m)))))))))

(deftest table-rename-test
  (when (app-db?)
    (mt/with-temp [:model/Database db      {}
                   :model/Table    renamed {:db_id (:id db), :name "relay_before"}
                   :model/Table    other   {:db_id (:id db), :name "relay_other"}
                   :model/Field    f1      {:table_id (:id renamed), :name "a"}
                   :model/Field    f2      {:table_id (:id renamed), :name "b"}
                   :model/Field    _       {:table_id (:id other), :name "c"}]
      (let [mirror (atom {})
            posts  (atom [])
            post   (pass-receiver mirror posts)]
        (pass! post :field)
        (t2/update! :model/Table (:id renamed) {:name "relay_after"})
        (reset! posts [])
        (pass! post :field)
        (testing "after a table rename, the field pass sends that table's fields, and only those"
          (is (= #{(:id f1) (:id f2)} (set (map :id (mapcat :rows (sent @posts "rows"))))))
          (is (= #{"relay_after"} (set (map :table_name (mapcat :rows (sent @posts "rows")))))))
        (testing "a pass over an unchanged kind is done at its root"
          (reset! posts [])
          (pass! post :field)
          (is (= ["root"] (map (comp :step second) @posts))))))))
