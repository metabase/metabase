(ns metabase.sync.metadata-sync.receive-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.search.core :as search]
   [metabase.sync.metadata-sync.accept :as accept]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.receive :as receive]
   [metabase.sync.metadata-sync.send :as send]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn- add-tables!
  "Add Tables, each `[schema name field-names]`, to the Database with `db-id`, and return their ids by name."
  [db-id tables]
  (into {}
        (for [[table-schema table-name field-names] tables]
          (let [table-id (t2/insert-returning-pk! :model/Table {:db_id db-id :schema table-schema :name table-name
                                                                :active true :initial_sync_status "complete"})]
            (doseq [[i field-name] (map-indexed vector field-names)]
              (t2/insert! :model/Field {:table_id table-id :name field-name :base_type :type/Text
                                        :database_type "TEXT" :position i :database_position i}))
            [table-name table-id]))))

(def ^:private some-tables
  [["PUBLIC" "orders" ["id" "total" "user_id"]]
   ["PUBLIC" "people" ["id" "name"]]
   ["SALES" "leads" ["id" "email"]]])

(defn- field-id [table-id field-name]
  (t2/select-one-pk :model/Field :table_id table-id :name field-name))

(defn- through-json [x]
  (json/decode+kw (json/encode x)))

(defn- sender-answer
  "The answer of the sender's Database named `sender-name` to `request`, through JSON both ways, as the app carries it.
  The sender and the receiver are in one app DB here, where two Databases cannot have one name. So the request is
  sent with the sender's name, and the answer gets the name of the request back."
  [sender-name request]
  (-> (send/changes-response (through-json (assoc request :database sender-name)))
      (assoc :database (:database request))
      through-json))

(defn- answer-of
  "An answer with `batches` that names the Database with `database-id`, as the answer to its request does."
  [database-id & batches]
  (let [{db-name :name engine :engine} (t2/select-one [:model/Database :name :engine] :id database-id)]
    {:format_version wire/format-version
     :database       db-name
     :engine         (name engine)
     :batches        (vec batches)}))

(defn- one-table-answer [receiver-id]
  (answer-of receiver-id
             {:type   "tables"
              :tables [{:schema "PUBLIC" :name "bird_sightings" :description "Every bird seen"
                        :fields [{:path ["id"] :base_type "type/Integer" :database_type "INT"
                                  :database_is_pk true :semantic_type "type/PK"}
                                 {:path ["species"] :base_type "type/Text" :database_type "TEXT"
                                  :fingerprint {:global {:distinct-count 3}} :fingerprint_version 5
                                  :last_analyzed "2026-01-01T00:00:00Z" :has_field_values "list"}
                                 {:path ["seen_at"] :base_type "type/Text" :database_type "TEXT"
                                  :coercion_strategy "Coercion/ISO8601->DateTime"
                                  :effective_type "type/DateTime"}
                                 {:path ["wings"] :base_type "type/Text" :database_type "TEXT"
                                  :effective_type "type/Integer"}]}]}))

(defn- deleting-fields-of!
  "Call `thunk`, then delete the Fields of the Databases with `db-ids`, the most nested first. `with-temp` deletes a
  Database in one statement, and on MySQL its cascade fails on a Field that another Field is nested under."
  [db-ids thunk]
  (try
    (thunk)
    (finally
      (field/delete-fields-for-databases! (vec db-ids)))))

(defn- seed!
  "Seed the receiver's Database `receiver-id` from the sender's Database named `sender-name` as the app does: request,
  answer, apply, while there is a next cursor. Returns the number of rounds and the summed counts."
  [sender-name receiver-id]
  (loop [rounds 1 after nil counts {}]
    (let [request              (receive/request receiver-id after)
          {:keys [next] :as r} (receive/apply-response! receiver-id (sender-answer sender-name request))
          counts               (merge-with + counts (:counts r))]
      (cond
        (nil? next)   {:rounds rounds :counts counts}
        (> rounds 50) (throw (ex-info "the seed does not end" {:rounds rounds}))
        :else         (recur (inc rounds) next counts)))))

(defn- metadata
  "The metadata of the Database with `db-id` that a seed copies, by name, so two Databases can be compared."
  [db-id]
  (let [tables (t2/select :model/Table :db_id db-id :active true)
        names  (into {} (map (juxt :id (juxt :schema :name))) tables)
        fields (when (seq tables) (t2/select :model/Field :table_id [:in (keys names)] :active true))
        by-id  (into {} (map (juxt :id identity)) fields)]
    (into {}
          (for [{table-id :id :as table} tables]
            [(names table-id)
             {:description         (:description table)
              :estimated_row_count (:estimated_row_count table)
              :fields              (into {}
                                         (for [field fields
                                               :when (= table-id (:table_id field))
                                               :let  [target (by-id (:fk_target_field_id field))]]
                                           [(:name field)
                                            {:base_type     (:base_type field)
                                             :database_type (:database_type field)
                                             :semantic_type (:semantic_type field)
                                             :fingerprint   (:fingerprint field)
                                             :fk_target     (when target [(names (:table_id target)) (:name target)])
                                             :field_values  (t2/select-one-fn :values :model/FieldValues
                                                                              :field_id (:id field)
                                                                              :type :full)}]))}]))))

(defn- do-with-sender-and-receiver!
  "Call `f` with the ids by name of the sender's Tables, the sender's Database name, and the receiver's Database id.
  The sender has [[some-tables]], an FK from orders.user_id to people.id, a description, a fingerprint, a row count
  and field values on orders."
  [f]
  (mt/with-temp [:model/Database {sender :id sender-name :name} {:initial_sync_status "complete"
                                                                 :timezone            "UTC"
                                                                 :dbms_version        {:flavor "H2"}}
                 :model/Database {receiver-id :id}              {:initial_sync_status "incomplete"}]
    (let [tables (add-tables! sender some-tables)]
      (t2/update! :model/Field :id (field-id (tables "orders") "user_id")
                  {:fk_target_field_id (field-id (tables "people") "id") :semantic_type :type/FK})
      (t2/update! :model/Field :id (field-id (tables "orders") "total")
                  {:fingerprint {:global {:distinct-count 2}} :fingerprint_version 5 :has_field_values :list})
      (t2/update! :model/Table :id (tables "orders") {:estimated_row_count 3 :description "All orders"})
      (t2/insert! :model/FieldValues {:field_id (field-id (tables "orders") "total") :type :full
                                      :values   ["1" "2"]})
      (f tables sender-name receiver-id sender))))

;;; ------------------------------------------------ Request ------------------------------------------------

(deftest request-test
  (mt/with-temp [:model/Database {db-id :id db-name :name} {:engine  :h2}
                 :model/Database {pg-id :id}               {:engine  :postgres
                                                            :details {:schema-filters-type     "inclusion"
                                                                      :schema-filters-patterns "PUBLIC"}}]
    (testing "a request names the Database by name and engine, and the format versions this receiver reads"
      (is (= {:database db-name :engine "h2" :format_versions [wire/format-version]} (receive/request db-id nil))))
    (testing "with its schema filters, when its driver has them"
      (is (=? {:engine "postgres" :schema_filters {:type "inclusion" :patterns "PUBLIC"}}
              (receive/request pg-id nil))))
    (testing "it carries the cursor it is given"
      (is (= {:kind "links" :key ["PUBLIC" "orders"]}
             (:after (receive/request db-id {:kind "links" :key ["PUBLIC" "orders"]})))))
    (testing "also one that only a newer sender writes: the receiver does not read a cursor"
      (is (= {:kind "remaps" :key nil :page 3}
             (:after (receive/request db-id {:kind "remaps" :key nil :page 3})))))))

;;; ------------------------------------------------ Seed ------------------------------------------------

(deftest seed-copies-the-metadata-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id sender]
     (let [{:keys [counts]} (seed! sender-name receiver-id)]
       (testing "the receiver has the sender's Tables, Fields, FK, fingerprints, row count and field values"
         (is (= (metadata sender) (metadata receiver-id))))
       (testing "and the database values"
         (is (=? {:timezone "UTC" :dbms_version {:flavor "H2"}} (t2/select-one :model/Database :id receiver-id))))
       (testing "the counts say what it wrote"
         (is (= {:values_dropped        0
                 :tables_skipped        0
                 :left_out              0
                 :database_updated      1
                 :tables_inserted       3
                 :tables_existing       0
                 :fields_inserted       7
                 :fks_set               1
                 :row_counts_set        1
                 :field_values_inserted 1}
                counts)))
       (testing "the Database and its Tables count as synced"
         (is (= "complete" (t2/select-one-fn :initial_sync_status :model/Database :id receiver-id)))
         (is (= #{"complete"} (set (t2/select-fn-set :initial_sync_status :model/Table :db_id receiver-id)))))))))

(deftest seed-in-many-rounds-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id sender]
     (with-redefs [pages/table-field-limit       1
                   pages/link-limit               1
                   pages/stats-field-values-limit 1]
       (let [{:keys [rounds]} (seed! sender-name receiver-id)]
         (testing "small limits make one round per Table, and the result is the same"
           (is (= 5 rounds))
           (is (= (metadata sender) (metadata receiver-id)))))))))

(deftest synced-only-after-the-last-answer-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [first-answer (sender-answer sender-name (receive/request receiver-id nil))]
       (is (some? (:next first-answer)))
       (receive/apply-response! receiver-id first-answer)
       (testing "an answer with a next cursor leaves the Database's first sync incomplete"
         (is (= "incomplete" (t2/select-one-fn :initial_sync_status :model/Database :id receiver-id))))))))

(deftest a-second-seed-changes-nothing-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (seed! sender-name receiver-id)
     (let [before (metadata receiver-id)
           {:keys [counts]} (seed! sender-name receiver-id)]
       (testing "a second seed only finds the Tables it has"
         (is (= {:values_dropped 0 :tables_skipped 0 :left_out 0 :database_updated 0 :tables_inserted 0
                 :tables_existing 3 :fields_inserted 0 :fks_set 0 :row_counts_set 0 :field_values_inserted 0}
                counts))
         (is (= before (metadata receiver-id))))))))

;;; ------------------------------------------------ Refusals ------------------------------------------------

(defn- refusal! [database-id response]
  (try
    (receive/apply-response! database-id response)
    nil
    (catch ExceptionInfo e
      (select-keys (ex-data e) [:status-code :error-code]))))

(deftest refusals-write-nothing-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [good (sender-answer sender-name (receive/request receiver-id nil))]
       (testing "another format version"
         (is (= {:status-code 422 :error-code "metadata-sync-format-version-differs"}
                (refusal! receiver-id (assoc good :format_version (inc wire/format-version))))))
       (testing "a malformed answer"
         (is (= {:status-code 422 :error-code "metadata-sync-malformed-response"}
                (refusal! receiver-id (assoc good :batches "not a list"))))
         (is (= {:status-code 422 :error-code "metadata-sync-malformed-response"}
                (refusal! receiver-id (update good :batches conj {:tables []})))))
       (testing "nothing was written"
         (is (= {} (metadata receiver-id))))
       (testing "the message says nothing of the answer's values"
         (is (not (re-find #"orders" (try (receive/apply-response! receiver-id (assoc good :batches "orders"))
                                          ""
                                          (catch ExceptionInfo e (ex-message e)))))))))))

(deftest databases-that-cannot-receive-test
  (testing "no such Database"
    (is (= {:status-code 404 :error-code "metadata-sync-no-database"}
           (refusal! Integer/MAX_VALUE {:format_version wire/format-version :batches []}))))
  (testing "a stub Database, the audit Database and a destination Database of database routing"
    (doseq [values [{:is_stub true} {:is_audit true} {:router_database_id (mt/id)}]]
      (mt/with-temp [:model/Database {db-id :id} values]
        (is (= {:status-code 400 :error-code "metadata-sync-database-not-loadable"}
               (refusal! db-id {:format_version wire/format-version :batches []})))
        (is (thrown-with-msg? ExceptionInfo #"does not take" (receive/request db-id nil)))))))

(deftest a-failure-while-applying-writes-nothing-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [good (sender-answer sender-name (receive/request receiver-id nil))]
       (mt/with-dynamic-fn-redefs [field/create-fields! (fn [_rows]
                                                          (throw (ex-info "the app DB refused orders" {})))]
         (testing "a write that fails refuses the whole answer, with its own code"
           (is (= {:status-code 422 :error-code "metadata-sync-apply-failed"} (refusal! receiver-id good))))
         (testing "and nothing of it is written: not the database values of its first batch, and no Table"
           (is (=? {:timezone nil :dbms_version nil} (t2/select-one :model/Database :id receiver-id)))
           (is (= {} (metadata receiver-id))))
         (testing "the message says nothing of the failure, which can hold the answer's values"
           (is (not (re-find #"orders" (try (receive/apply-response! receiver-id good)
                                            ""
                                            (catch ExceptionInfo e (ex-message e))))))))))))

(deftest a-failure-to-mark-the-database-synced-writes-nothing-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (mt/with-dynamic-fn-redefs [sync-util/set-initial-database-sync-complete!
                                (fn [_database] (throw (ex-info "the app DB is gone" {})))]
      (testing "the last answer is refused as any write that fails"
        (is (= {:status-code 422 :error-code "metadata-sync-apply-failed"}
               (refusal! receiver-id (one-table-answer receiver-id)))))
      (testing "and its Tables are not written"
        (is (= {} (metadata receiver-id)))))))

(deftest a-failure-while-applying-is-logged-test
  (do-with-sender-and-receiver!
   (fn [_tables sender-name receiver-id _sender]
     (let [good (sender-answer sender-name (receive/request receiver-id nil))]
       (mt/with-dynamic-fn-redefs [field/create-fields!
                                   (fn [_rows]
                                     (throw (ex-info "the app DB refused orders" {}
                                                     (java.sql.SQLException. "duplicate key orders" "23505"))))]
         (mt/with-log-messages-for-level [messages [metabase.sync.metadata-sync.receive :warn]]
           (refusal! receiver-id good)
           (let [logged (filter #(re-find #"could not be applied" (:message %)) (messages))]
             (testing "the failure is logged once, as an error, with the classes and SQLState of its causes"
               (is (=? [{:level :error :message #"(?s).*ExceptionInfo.*SQLException.*23505.*"}] logged)))
             (testing "and with a stack trace of where it failed"
               (is (re-find #"receive_test" (:message (first logged)))))
             (testing "but with no message of a cause, which can hold the answer's values"
               (is (not (re-find #"orders" (:message (first logged)))))))))))))

(deftest one-key-twice-in-a-batch-test
  (mt/with-temp [:model/Database {receiver-id :id} {}]
    (let [doc      {:schema "PUBLIC" :name "twice" :fields [{:path ["id"] :base_type "type/Integer"
                                                             :database_type "INTEGER"}]}
          response (answer-of receiver-id {:type "tables" :tables [doc doc]})]
      (testing "a key that an answer has twice inserts one Table"
        (is (=? {:counts {:tables_inserted 1}} (receive/apply-response! receiver-id response)))
        (is (= 1 (t2/count :model/Table :db_id receiver-id :name "twice")))))))

;;; ------------------------------------------ Checks before any write ------------------------------------------

(defn- refusal-message! [database-id response]
  (try
    (receive/apply-response! database-id response)
    ""
    (catch ExceptionInfo e
      (ex-message e))))

(deftest an-answer-of-another-database-is-refused-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [good (one-table-answer receiver-id)]
      (testing "an answer that names another Database"
        (is (= {:status-code 422 :error-code "metadata-sync-answer-of-another-database"}
               (refusal! receiver-id (assoc good :database "Some other Database")))))
      (testing "an answer that names another engine"
        (is (= {:status-code 422 :error-code "metadata-sync-answer-of-another-database"}
               (refusal! receiver-id (assoc good :engine "postgres")))))
      (testing "an answer that names no Database is malformed"
        (is (= {:status-code 422 :error-code "metadata-sync-malformed-response"}
               (refusal! receiver-id (dissoc good :database)))))
      (testing "nothing was written, and the Database does not count as synced"
        (is (= {} (metadata receiver-id)))
        (is (= "incomplete" (t2/select-one-fn :initial_sync_status :model/Database :id receiver-id))))
      (testing "the message does not repeat the name"
        (is (not (re-find #"Some other"
                          (refusal-message! receiver-id (assoc good :database "Some other Database")))))))))

(deftest values-the-receiver-does-not-accept-are-dropped-test
  (let [in-table (fn [answer column value] (assoc-in answer [:batches 0 :tables 0 column] value))
        in-field (fn [answer column value] (assoc-in answer [:batches 0 :tables 0 :fields 1 column] value))
        table    (fn [db-id] (t2/select-one :model/Table :db_id db-id))
        species  (fn [db-id] (t2/select-one :model/Field :table_id (:id (table db-id)) :name "species"))]
    (doseq [[what change check]
            [["a base type this version does not know is the unknown type, as sync gives a type it does not know"
              #(in-field % :base_type "type/Nonsense")
              #(is (=? {:base_type :type/* :effective_type :type/*} (species %)))]
             ["a semantic type it does not know is left out"
              #(in-field % :semantic_type "type/Nonsense") #(is (nil? (:semantic_type (species %))))]
             ["a coercion it does not know is left out, with the effective type it gives"
              #(-> % (in-field :coercion_strategy "Coercion/No") (in-field :effective_type "type/DateTime"))
              #(is (=? {:coercion_strategy nil :effective_type :type/Text} (species %)))]
             ["a Field visibility it does not know is left out" #(in-field % :visibility_type "invisible")
              #(is (= :normal (:visibility_type (species %))))]
             ["a has_field_values it does not know is left out" #(in-field % :has_field_values "sometimes")
              #(is (nil? (:has_field_values (species %))))]
             ["a value of the wrong kind for a keyword is left out" #(in-field % :has_field_values 5)
              #(is (nil? (:has_field_values (species %))))]
             ["a fingerprint that is not a fingerprint is left out, with its version and time"
              #(in-field % :fingerprint "none")
              #(is (=? {:fingerprint nil :fingerprint_version 0 :last_analyzed nil} (species %)))]
             ["a display name that is not a string is left out" #(in-field % :display_name {:a 1})
              #(is (= "Species" (:display_name (species %))))]
             ["a time that is not a time is left out" #(in-field % :last_analyzed "not a time")
              #(is (nil? (:last_analyzed (species %))))]
             ["a position that is not a number is left out" #(in-field % :position "first")
              #(is (= 0 (:position (species %))))]
             ["a data authority it does not know is left out" #(in-table % :data_authority "unknown")
              #(is (= :unconfigured (:data_authority (table %))))]
             ["a Table field order it does not know is left out" #(in-table % :field_order "sideways")
              #(is (= :database (:field_order (table %))))]
             ["a data source that belongs to one instance is left out" #(in-table % :data_source "metabase-transform")
              #(is (nil? (:data_source (table %))))]
             ["a Field display name longer than its column is left out"
              #(in-field % :display_name (apply str (repeat 300 "a")))
              #(is (= "Species" (:display_name (species %))))]
             ["a Table display name longer than its column is left out"
              #(in-table % :display_name (apply str (repeat 300 "a")))
              #(is (= "Bird Sightings" (:display_name (table %))))]
             ["a position that a 32-bit column cannot hold is left out" #(in-field % :position 99999999999)
              #(is (= 0 (:position (species %))))]
             ["a data layer it does not know is left out with the visibility type, which goes with it"
              #(-> % (in-table :visibility_type "hidden") (in-table :data_layer "nonsense"))
              #(is (=? {:visibility_type nil :data_layer :internal} (table %)))]]]
      (testing what
        (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
          (testing "the Table is inserted with the rest of its values, and the answer counts what it left out"
            (is (=? {:counts {:tables_inserted 1 :fields_inserted 4 :values_dropped pos-int? :tables_skipped 0}}
                    (receive/apply-response! receiver-id (change (one-table-answer receiver-id)))))
            (is (= "Every bird seen" (:description (table receiver-id)))))
          (check receiver-id))))
    (testing "a user-set column it does not know is left out of the settings row"
      (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
        (is (=? {:counts {:tables_inserted 1}}
                (receive/apply-response! receiver-id (in-table (one-table-answer receiver-id)
                                                               :user_set ["description" "owner_email"]))))
        (is (=? {:description_set true}
                (t2/select-one :model/TableUserSettings :table_id (:id (table receiver-id)))))))))

(deftest what-only-a-newer-sender-sends-is-left-out-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [tables  (-> (one-table-answer receiver-id)
                      (assoc :generation "abc")
                      (update-in [:batches 0] assoc :checksum "x")
                      (update-in [:batches 0 :tables 0] assoc :new_table_key 1)
                      (update-in [:batches 0 :tables 0 :fields 0] assoc :new_field_key 1)
                      (update :batches #(into [{:type "database" :timezone "UTC" :new_database_key 1}
                                               {:type "remaps" :tables [{:anything 1}]}]
                                              %))
                      (assoc :next {:kind "remaps" :key nil :page 3}))
          links   (assoc (answer-of receiver-id
                                    {:type   "links"
                                     :tables [{:schema "PUBLIC" :name "bird_sightings" :new_links_key 1
                                               :links  [{:kind   "fk" :field ["species"] :new_link_key 1
                                                         :target {:schema "PUBLIC" :table "bird_sightings"
                                                                  :field  ["id"] :new_target_key 1}}
                                                        {:kind "remap" :field ["wings"] :to ["species"]}]}]})
                         :next {:kind "stats"})
          stats   (answer-of receiver-id
                             {:type   "stats"
                              :tables [{:schema "PUBLIC" :name "bird_sightings" :estimated_row_count 5
                                        :new_stats_key 1
                                        :field_values [{:field ["species"] :values ["crow"] :has_more_values false
                                                        :new_values_key 1}]}]})]
      (testing "keys and batch types it does not know are left out, and the cursor is passed on as it is"
        (is (=? {:next   {:kind "remaps" :key nil :page 3}
                 :counts {:database_updated 1 :tables_inserted 1 :fields_inserted 4 :left_out 1}}
                (receive/apply-response! receiver-id tables))))
      (testing "a link of a kind it does not know is left out, and the FK next to it is filled"
        (is (=? {:counts {:fks_set 1 :left_out 1}} (receive/apply-response! receiver-id links))))
      (testing "stats with keys it does not know are applied"
        (is (=? {:counts {:row_counts_set 1 :field_values_inserted 1}}
                (receive/apply-response! receiver-id stats)))))))

(deftest nulls-and-left-out-optional-keys-are-applied-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [field  (fn [field-name] {:path [field-name] :base_type "type/Integer" :database_type "INT"
                                   :last_analyzed nil :user_set nil :description nil})
          answer (fn [& batches] (through-json (assoc (apply answer-of receiver-id batches) :next nil)))]
      (testing "a null where this version leaves a key out, and a Table entry with no Fields"
        (is (=? {:counts {:database_updated 0 :tables_inserted 3 :fields_inserted 2 :tables_skipped 0}}
                (receive/apply-response!
                 receiver-id
                 (answer {:type "database" :timezone nil :dbms_version nil}
                         {:type   "tables"
                          :tables [{:schema nil :name "people" :description nil :user_set nil :fields [(field "id")]}
                                   {:schema nil :name "orders" :data_source nil :fields [(field "user_id")]}
                                   {:schema nil :name "empty"}]}))))
        (is (= #{nil} (t2/select-fn-set :schema :model/Table :db_id receiver-id))))
      (testing "a links entry and a target with no schema, no links, and a link whose user_set is false"
        (is (=? {:counts {:fks_set 1}}
                (receive/apply-response!
                 receiver-id
                 (answer {:type   "links"
                          :tables [{:name  "orders"
                                    :links [{:kind "fk" :field ["user_id"] :target {:table "people" :field ["id"]}
                                             :user_set false}]}
                                   {:name "people" :links []}]})))))
      (testing "a stats entry with a null row count, or with no field values"
        (is (=? {:counts {:row_counts_set 1}}
                (receive/apply-response!
                 receiver-id
                 (answer {:type   "stats"
                          :tables [{:name "people" :estimated_row_count nil}
                                   {:name "orders" :estimated_row_count 5 :field_values nil}]}))))))))

(deftest a-fingerprint-with-nan-is-kept-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (receive/apply-response!
     receiver-id
     (through-json (assoc-in (one-table-answer receiver-id) [:batches 0 :tables 0 :fields 1 :fingerprint]
                             {:type {:type/Number {:min ##NaN :max ##Inf :avg 1.5}}})))
    (testing "NaN and Infinity, which JSON carries as strings, are read back as numbers, as the Field model reads them"
      (let [{:keys [fingerprint fingerprint_version]}
            (t2/select-one :model/Field :table_id (t2/select-one-pk :model/Table :db_id receiver-id) :name "species")]
        (is (= 5 fingerprint_version))
        (is (NaN? (get-in fingerprint [:type :type/Number :min])))
        (is (= ##Inf (get-in fingerprint [:type :type/Number :max])))))))

(deftest a-cursor-that-is-not-a-map-is-passed-on-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (doseq [cursor ["opaque" ["tables" 3]]]
      (testing (pr-str cursor)
        (is (= cursor (:next (receive/apply-response! receiver-id (assoc (answer-of receiver-id) :next cursor)))))
        (is (= cursor (:after (receive/request receiver-id cursor))))))))

(deftest a-database-value-longer-than-its-column-is-dropped-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (is (=? {:counts {:database_updated 1 :values_dropped 1}}
            (receive/apply-response! receiver-id (answer-of receiver-id {:type         "database"
                                                                         :timezone     (apply str (repeat 300 "a"))
                                                                         :dbms_version {:flavor "H2"}}))))
    (is (=? {:timezone nil :dbms_version {:flavor "H2"}} (t2/select-one :model/Database :id receiver-id)))))

(deftest entries-of-the-wrong-shape-are-skipped-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [field (fn [& path] {:path (vec path) :base_type "type/Integer" :database_type "INT"})]
      (testing "a Table entry of the wrong shape is skipped with its Fields, and counted"
        (is (=? {:counts {:tables_inserted 1 :fields_inserted 1 :tables_skipped 4}}
                (receive/apply-response!
                 receiver-id
                 (answer-of receiver-id
                            {:type   "tables"
                             :tables [{:schema "PUBLIC" :name "people" :fields [(field "id")]}
                                      {:schema "PUBLIC" :name "bad_fields" :fields "not a list"}
                                      {:schema "PUBLIC" :fields []}
                                      {:schema "PUBLIC" :name "orphan" :fields [(field "place" "lat")]}
                                      {:schema "PUBLIC" :name "twice" :fields [(field "id") (field "id")]}]}))))
        (is (= #{"people"} (t2/select-fn-set :name :model/Table :db_id receiver-id))))
      (testing "a database batch, links and stats entries of the wrong shape are left out, and counted"
        (is (=? {:counts {:database_updated 0 :fks_set 0 :row_counts_set 1 :left_out 4}}
                (receive/apply-response!
                 receiver-id
                 (answer-of receiver-id
                            {:type "database" :timezone 5}
                            {:type "links" :tables [{:schema "PUBLIC" :name "people"
                                                     :links  [{:kind "fk" :field "id" :target {}}]}
                                                    "not an entry"]}
                            {:type "stats" :tables [{:schema "PUBLIC" :name "people" :estimated_row_count "many"}
                                                    {:schema "PUBLIC" :name "people" :estimated_row_count 7
                                                     :field_values []}]}))))))))

(deftest a-name-longer-than-its-column-skips-the-table-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [long-name (apply str (repeat 300 "a"))
          field     (fn [field-name] {:path [field-name] :base_type "type/Integer" :database_type "INT"})]
      (testing "a Table or Field name this version's app DB cannot hold skips the Table, and is counted"
        (is (=? {:counts {:tables_inserted 1 :tables_skipped 2}}
                (receive/apply-response!
                 receiver-id
                 (answer-of receiver-id
                            {:type   "tables"
                             :tables [{:schema "PUBLIC" :name long-name :fields []}
                                      {:schema "PUBLIC" :name "long_field" :fields [(field long-name)]}
                                      {:schema "PUBLIC" :name "fine" :fields [(field "id")]}]}))))))))

(defn- app-db-columns
  "`{column {:size n :type java.sql.Types int}}` of the app DB table `table-name`, from the JDBC metadata."
  [table-name]
  (t2/with-connection [^java.sql.Connection conn]
    (let [md (.getMetaData conn)]
      (some (fn [table-name]
              (with-open [rs (.getColumns md (.getCatalog conn) nil table-name nil)]
                (not-empty (into {}
                                 (map (fn [row] [(keyword (u/lower-case-en (:column_name row)))
                                                 {:size (:column_size row) :type (:data_type row)}]))
                                 (resultset-seq rs)))))
            [table-name (u/upper-case-en table-name)]))))

(deftest column-limits-are-the-app-db-ones-test
  (doseq [[model table-name] {:model/Table "metabase_table" :model/Field "metabase_field"}
          :let [columns (app-db-columns table-name)]]
    (testing (str model " string columns hold at most the characters the receiver lets through")
      (doseq [[column limit] (get @#'accept/string-limits model)]
        (testing column
          (is (<= limit (get-in columns [column :size]))))))
    (testing (str model " integer columns are 32-bit")
      (doseq [column (get @#'accept/int-columns model)]
        (testing column
          (is (= java.sql.Types/INTEGER (get-in columns [column :type]))))))))

(deftest refusal-messages-hold-no-values-test
  (mt/with-temp [:model/Database {receiver-id :id} {}]
    (let [good (one-table-answer receiver-id)]
      (testing "a format version that is not a number is not repeated"
        (is (not (re-find #"wren" (refusal-message! receiver-id (assoc good :format_version "wren"))))))
      (testing "a format version that is a number is named"
        (is (re-find #"99" (refusal-message! receiver-id (assoc good :format_version 99)))))
      (testing "a malformed answer is not repeated"
        (is (not (re-find #"wren" (refusal-message! receiver-id (assoc good :batches "wren")))))))))

;;; ------------------------------------------------ User-set columns ------------------------------------------------

(deftest user-set-flags-are-copied-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [answer (-> (one-table-answer receiver-id)
                     (assoc-in [:batches 0 :tables 0 :user_set] ["description"])
                     (assoc-in [:batches 0 :tables 0 :fields 1 :user_set] ["description" "semantic_type"])
                     (update-in [:batches 0 :tables] conj {:schema "PUBLIC" :name "plain" :fields []}))]
      (receive/apply-response! receiver-id answer)
      (let [sightings (t2/select-one-pk :model/Table :db_id receiver-id :name "bird_sightings")
            plain     (t2/select-one-pk :model/Table :db_id receiver-id :name "plain")
            species   (field-id sightings "species")]
        (testing "a new Table has a settings row with the flags of the columns the sender's user set"
          (is (=? {:description_set true :visibility_type_set false :data_layer_set false :data_source_set false}
                  (t2/select-one :model/TableUserSettings :table_id sightings))))
        (testing "a new Field does too"
          (is (=? {:description_set true :semantic_type_set true :fk_target_field_id_set false}
                  (t2/select-one :model/FieldUserSettings :field_id species))))
        (testing "a Table and a Field with no user-set column have no settings row"
          (is (nil? (t2/select-one :model/TableUserSettings :table_id plain)))
          (is (nil? (t2/select-one :model/FieldUserSettings :field_id (field-id sightings "id")))))))))

(deftest user-set-columns-without-a-flag-are-copied-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (receive/apply-response!
     receiver-id
     (-> (one-table-answer receiver-id)
         (update-in [:batches 0 :tables 0] assoc :entity_type "entity/EventTable" :user_set ["entity_type"])
         (update-in [:batches 0 :tables 0 :fields 1] assoc
                    :visibility_type "details-only" :display_name "Kind" :user_set ["display_name" "visibility_type"])))
    (let [table-id (t2/select-one-pk :model/Table :db_id receiver-id)]
      (testing "a column a user set that has no flag is in the settings row with its value, so sync leaves it"
        (is (=? {:entity_type :entity/EventTable} (t2/select-one :model/TableUserSettings :table_id table-id)))
        (is (=? {:visibility_type :details-only :display_name "Kind"}
                (t2/select-one :model/FieldUserSettings :field_id (field-id table-id "species")))))
      (testing "and on the row"
        (is (=? {:entity_type :entity/EventTable} (t2/select-one :model/Table :id table-id)))
        (is (=? {:visibility_type :details-only :display_name "Kind"}
                (t2/select-one :model/Field :id (field-id table-id "species"))))))))

(deftest a-cleared-fk-takes-no-target-from-the-answer-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (receive/apply-response! receiver-id (update-in (one-table-answer receiver-id) [:batches 0 :tables 0 :fields 1]
                                                    assoc
                                                    :user_set ["fk_target_field_id"]
                                                    :fk_target_field_id (mt/id :venues :id)))
    (let [species (field-id (t2/select-one-pk :model/Table :db_id receiver-id) "species")]
      (testing "an FK a user set is named in user_set only when cleared, so an id of the sender's is not taken"
        (is (=? {:fk_target_field_id nil :fk_target_field_id_set true}
                (t2/select-one :model/FieldUserSettings :field_id species)))
        (is (nil? (t2/select-one-fn :fk_target_field_id :model/Field :id species)))))))

(deftest user-set-flags-of-a-nested-field-are-copied-test
  (mt/with-temp [:model/Database {receiver-id :id} {}]
    (deleting-fields-of!
     [receiver-id]
     (fn []
       (let [field (fn [path more] (merge {:path path :base_type "type/Text" :database_type "TEXT"} more))]
         (receive/apply-response!
          receiver-id
          (answer-of receiver-id {:type   "tables"
                                  :tables [{:schema "PUBLIC" :name "sightings"
                                            :fields [(field ["name"] {})
                                                     (field ["place"] {:base_type "type/Dictionary"})
                                                     (field ["place" "name"] {:user_set ["description"]})]}]}))
         (let [table-id  (t2/select-one-pk :model/Table :db_id receiver-id :name "sightings")
               place     (t2/select-one-pk :model/Field :table_id table-id :name "place")
               nested    (t2/select-one-pk :model/Field :table_id table-id :name "name" :parent_id place)
               field-ids (t2/select-pks-vec :model/Field :table_id table-id)]
           (testing "the flag is on the nested Field, not on the top-level Field with the same name"
             (is (= [nested] (t2/select-fn-vec :field_id :model/FieldUserSettings :field_id [:in field-ids]))))))))))

;;; ------------------------------------------------ Links and stats ------------------------------------------------

(defn- fk-answers
  "A tables answer with orders.user_id and people.id, the `user_set` of user_id being `field-user-set`, and a links
  answer with the FK from user_id to people.id, which `link-more` is merged into."
  [receiver-id field-user-set link-more]
  [(assoc (answer-of receiver-id
                     {:type   "tables"
                      :tables [{:schema "PUBLIC" :name "orders"
                                :fields [(cond-> {:path ["user_id"] :base_type "type/Integer" :database_type "INT"
                                                  :semantic_type "type/FK"}
                                           field-user-set (assoc :user_set field-user-set))]}
                               {:schema "PUBLIC" :name "people"
                                :fields [{:path ["id"] :base_type "type/Integer" :database_type "INT"}]}]})
          :next {:kind "links"})
   (answer-of receiver-id
              {:type   "links"
               :tables [{:schema "PUBLIC" :name "orders"
                         :links  [(merge {:kind "fk" :field ["user_id"]
                                          :target {:schema "PUBLIC" :table "people" :field ["id"]}}
                                         link-more)]}]})])

(deftest a-link-a-user-set-is-marked-as-set-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [[tables links] (fk-answers receiver-id nil {:user_set true})]
      (receive/apply-response! receiver-id tables)
      (is (=? {:counts {:fks_set 1}} (receive/apply-response! receiver-id links)))
      (let [orders    (t2/select-one-pk :model/Table :db_id receiver-id :name "orders")
            people    (t2/select-one-pk :model/Table :db_id receiver-id :name "people")
            user-id   (field-id orders "user_id")
            person-id (field-id people "id")]
        (testing "the FK is filled"
          (is (=? {:fk_target_field_id person-id :semantic_type :type/FK} (t2/select-one :model/Field :id user-id))))
        (testing "and marked as set by a user, with its target, as the sender has it"
          (is (=? {:fk_target_field_id person-id :fk_target_field_id_set true}
                  (t2/select-one :model/FieldUserSettings :field_id user-id))))))))

(deftest a-filled-fk-keeps-the-senders-columns-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [[tables links] (fk-answers receiver-id nil {})]
      (receive/apply-response! receiver-id (assoc-in tables [:batches 0 :tables 0 :fields 0 :has_field_values] "list"))
      (receive/apply-response! receiver-id links)
      (let [user-id (field-id (t2/select-one-pk :model/Table :db_id receiver-id :name "orders") "user_id")
            id      (field-id (t2/select-one-pk :model/Table :db_id receiver-id :name "people") "id")]
        (testing "a filled FK gets its target, and keeps the semantic type and list setting the sender sent"
          (is (=? {:fk_target_field_id id :semantic_type :type/FK :has_field_values :list}
                  (t2/select-one :model/Field :id user-id))))))))

(deftest a-link-for-an-fk-a-user-cleared-is-not-filled-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [[tables links] (fk-answers receiver-id ["fk_target_field_id"] {})]
      (receive/apply-response! receiver-id tables)
      (testing "a link for a Field whose entry says a user cleared its FK, which a newer sender can send, is not filled"
        (is (=? {:counts {:fks_set 0}} (receive/apply-response! receiver-id links)))
        (is (=? {:counts {:fks_set 0}} (receive/apply-response! receiver-id links)))
        (is (nil? (t2/select-one-fn :fk_target_field_id :model/Field
                                    :id (field-id (t2/select-one-pk :model/Table :db_id receiver-id :name "orders")
                                                  "user_id"))))))))

(deftest a-link-to-a-skipped-table-is-skipped-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [[tables links] (fk-answers receiver-id nil {})]
      (receive/apply-response! receiver-id (update-in tables [:batches 0 :tables] #(vec (take 1 %))))
      (testing "an FK whose target the receiver does not have, such as one in a Table it skipped, is skipped"
        (is (=? {:counts {:fks_set 0}} (receive/apply-response! receiver-id links)))))))

(deftest an-fk-the-sender-cleared-is-copied-as-cleared-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [[tables] (fk-answers receiver-id ["fk_target_field_id"] {})]
      (receive/apply-response! receiver-id tables)
      (let [user-id (field-id (t2/select-one-pk :model/Table :db_id receiver-id :name "orders") "user_id")]
        (testing "a Field whose FK a user of the sender cleared has no target, and the flag says a user set it"
          (is (=? {:fk_target_field_id nil} (t2/select-one :model/Field :id user-id)))
          (is (=? {:fk_target_field_id nil :fk_target_field_id_set true}
                  (t2/select-one :model/FieldUserSettings :field_id user-id))))))))

(deftest field-values-only-for-fields-that-may-have-them-test
  (doseq [[what species values] [["a sensitive Field" {:visibility_type "sensitive"} 0]
                                 ["a Field that does not list values" {:has_field_values "search"} 0]
                                 ["a Field that lists values" {} 1]]]
    (testing what
      (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
        (receive/apply-response! receiver-id (update-in (one-table-answer receiver-id) [:batches 0 :tables 0 :fields 1]
                                                        merge species))
        (is (=? {:counts {:field_values_inserted values}}
                (receive/apply-response!
                 receiver-id
                 (answer-of receiver-id {:type   "stats"
                                         :tables [{:schema       "PUBLIC" :name "bird_sightings"
                                                   :field_values [{:field ["species"] :values ["crow"]
                                                                   :has_more_values false}]}]}))))))))

(deftest stats-that-are-in-a-batch-twice-are-applied-once-test
  (mt/with-temp [:model/Database {receiver-id :id} {}
                 :model/Table    {table-id :id}    {:db_id receiver-id :schema "PUBLIC" :name "sightings"}
                 :model/Field    {species :id}     {:table_id table-id :name "species" :base_type :type/Text
                                                    :has_field_values :list}]
    (let [values {:field ["species"] :values ["wren"] :has_more_values false}
          entry  {:schema "PUBLIC" :name "sightings" :field_values [values values]}]
      (testing "a Field that is in the stats twice, and a Table that is, get one row of values"
        (is (=? {:counts {:field_values_inserted 1}}
                (receive/apply-response! receiver-id (answer-of receiver-id {:type "stats" :tables [entry entry]}))))
        (is (= 1 (t2/count :model/FieldValues :field_id species)))))))

;;; ------------------------------------------------ Nested Fields ------------------------------------------------

(defn- field-paths
  "The name path of each active Field of the Database with `db-id`, by its Table's name, with its base type."
  [db-id]
  (let [tables (t2/select-pk->fn :name :model/Table :db_id db-id :active true)
        fields (when (seq tables) (t2/select :model/Field :table_id [:in (keys tables)] :active true))
        by-id  (into {} (map (juxt :id identity)) fields)
        path   (fn path [{:keys [parent_id] field-name :name}]
                 (conj (if parent_id (path (by-id parent_id)) []) field-name))]
    (into #{} (map (fn [field] [(tables (:table_id field)) (path field) (:base_type field)])) fields)))

(deftest nested-fields-are-copied-under-their-parents-test
  (mt/with-temp [:model/Database {sender :id sender-name :name} {:initial_sync_status "complete"}
                 :model/Database {receiver-id :id}              {:initial_sync_status "incomplete"}
                 :model/Table    {table-id :id}                 {:db_id sender :schema "PUBLIC" :name "sightings"}
                 :model/Field    {place :id}                    {:table_id table-id :name "place"
                                                                 :base_type :type/Dictionary}
                 :model/Field    {coords :id}                   {:table_id table-id :name "coords"
                                                                 :base_type :type/Dictionary :parent_id place}
                 :model/Field    _                              {:table_id table-id :name "lat"
                                                                 :base_type :type/Float :parent_id coords}
                 :model/Field    _                              {:table_id table-id :name "name"
                                                                 :base_type :type/Text :parent_id place}
                 :model/Field    _                              {:table_id table-id :name "name"
                                                                 :base_type :type/Text}]
    (deleting-fields-of!
     [receiver-id]
     (fn []
       (let [{:keys [counts]} (seed! sender-name receiver-id)]
         (testing "every nested Field is copied, under the parent of the same path"
           (is (= (field-paths sender) (field-paths receiver-id))))
         (testing "and counted"
           (is (= 5 (:fields_inserted counts)))))))))

(deftest broken-field-paths-skip-their-table-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (deleting-fields-of!
     [receiver-id]
     (fn []
       (let [field  (fn [& path] {:path (vec path) :base_type "type/Text" :database_type "TEXT"})
             answer (fn [& fields]
                      (answer-of receiver-id {:type "tables" :tables [{:schema "PUBLIC" :name "sightings"
                                                                       :fields (vec fields)}]}))]
         (testing "a nested Field whose parent is not in its Table's entry"
           (is (=? {:counts {:tables_inserted 0 :tables_skipped 1}}
                   (receive/apply-response! receiver-id (answer (field "place") (field "coords" "lat"))))))
         (testing "a path that is in an entry twice"
           (is (=? {:counts {:tables_inserted 0 :tables_skipped 1}}
                   (receive/apply-response! receiver-id (answer (field "place") (field "place"))))))
         (testing "nothing was written"
           (is (= {} (metadata receiver-id))))
         (testing "a parent after its child is fine"
           (is (=? {:counts {:fields_inserted 2}}
                   (receive/apply-response! receiver-id (answer (field "place" "lat") (field "place")))))))))))

;;; ------------------------------------------- What the model would do -------------------------------------------

(def ^:private instance-columns
  "The columns that differ between two rows for the same warehouse table or column in two Databases."
  [:id :db_id :table_id :parent_id :created_at :updated_at :entity_id :fk_target_field_id])

(defn- model-value
  "`value` of `column` in an entry as the models take it: a type or enum as a keyword, a time as a time."
  [column value]
  (cond
    (#{:base_type :effective_type :coercion_strategy :semantic_type :has_field_values :visibility_type} column)
    (keyword value)

    (= :last_analyzed column)
    (u.date/parse value)

    :else
    value))

(defn- through-the-model!
  "Insert, through the models, the Table that the tables `entry` describes and its top-level Fields into the Database
  with `db-id`, as sync inserts a Table it finds: with the entry's values, active, synced, and with the effective type
  that sync gives a Field. Returns the new Table's id."
  [db-id {table-fields :fields :as entry}]
  (let [table-id (:id (first (table/create-tables! [(-> (dissoc entry :fields)
                                                        (assoc :db_id db-id :active true
                                                               :initial_sync_status "complete"))])))]
    (field/create-fields!
     (for [{:keys [path] :as field} table-fields
           :let [row (into {} (map (fn [[k v]] [k (model-value k v)])) (dissoc field :path))]]
       (cond-> (assoc row :table_id table-id :name (peek path) :active true)
         ;; as sync writes it: without a coercion, the effective type is the base type
         (nil? (:coercion_strategy row)) (assoc :effective_type (:base_type row)))))
    table-id))

(defn- row-columns
  "The rows of the Table with `table-id` and its Fields, without the columns that belong to one Database."
  [table-id]
  {:table  (apply dissoc (t2/select-one :model/Table :id table-id) instance-columns)
   :fields (into {} (map (juxt :name #(apply dissoc % instance-columns)))
                 (t2/select :model/Field :table_id table-id))})

(deftest a-seeded-table-is-the-same-as-one-inserted-through-the-model-test
  (mt/with-temp [:model/Database         {receiver-id :id} {:initial_sync_status "incomplete"}
                 :model/Database         {other-id :id}    {}
                 :model/PermissionsGroup {group-id :id}    {}]
    ;; A group with no permission on a Database gets one row per new Table and permission type.
    (t2/delete! :model/DataPermissions :group_id group-id :db_id [:in [receiver-id other-id]])
    (receive/apply-response! receiver-id (one-table-answer receiver-id))
    (let [seeded   (t2/select-one-pk :model/Table :db_id receiver-id)
          modelled (through-the-model! other-id (get-in (one-table-answer receiver-id) [:batches 0 :tables 0]))]
      (testing "the Table and its Fields have the values a model insert gives them"
        (is (= (row-columns modelled) (row-columns seeded))))
      (testing "an effective type with no coercion is the base type, as the model makes it"
        (is (= :type/Text (t2/select-one-fn :effective_type :model/Field :table_id seeded :name "wings"))))
      (testing "the Table gets the permissions a model insert gives"
        (let [perms #(set (map (fn [p] (dissoc p :id :db_id :table_id))
                               (t2/select :model/DataPermissions :table_id %)))]
          (is (some #(= group-id (:group_id %)) (perms seeded)))
          (is (= (perms modelled) (perms seeded))))))))

(defn- change-log-entries
  "The change log entries written while `thunk` runs, as `[table-name action]` and their count."
  [thunk]
  (let [top (or (:id (t2/query-one {:select [[[:max :id] :id]] :from [(t2/table-name :model/ChangeLog)]})) 0)]
    (thunk)
    (frequencies (map (juxt :table_name :action)
                      (t2/query {:select [:table_name :action] :from [(t2/table-name :model/ChangeLog)] :where [:> :id top]})))))

(deftest a-seed-writes-the-change-log-test
  ;; An OSS build writes no change log, even with the feature on, as in `metabase.change-log.events-test`.
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
        (testing "each inserted Table and Field has an entry, as a model insert gives it"
          (is (=? {["metabase_table" "insert"] 1
                   ["metabase_field" "insert"] 4}
                  (change-log-entries #(receive/apply-response! receiver-id (one-table-answer receiver-id))))))))))

(deftest a-seed-queues-the-new-tables-for-the-search-index-test
  (mt/with-temp [:model/Database {receiver-id :id} {:initial_sync_status "incomplete"}]
    (let [queued (atom [])
          update (mt/original-fn #'search/bulk-update!)]
      (mt/with-dynamic-fn-redefs [search/bulk-update! (fn [instances]
                                                        (swap! queued into instances)
                                                        (update instances))]
        (receive/apply-response! receiver-id (one-table-answer receiver-id)))
      (is (= [[:model/Table (t2/select-one-pk :model/Table :db_id receiver-id)]]
             (map (juxt t2/model :id) @queued))))))
