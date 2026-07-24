(ns metabase-enterprise.database-isolation.core-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.database-isolation.core :as isolation]
   [metabase-enterprise.database-isolation.provisioner :as iso.provisioner]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Fake provisioner
;;; ---------------------------------------------------------------------------

(defn- fake-provisioner
  "A DatabaseProvisioner that records `[op iso-or-schemas]` calls in `calls*` and
  performs no warehouse work. `:fail` (a set of ops) makes those ops throw."
  [calls* & {:keys [fail iso-details]
             :or   {fail        #{}
                    iso-details {:schema           "iso_schema"
                                 :database_details {:user "iso-user" :password "iso-pass"}}}}]
  (let [fail! (fn [op]
                (when (fail op)
                  (throw (ex-info (str "fake " (name op) " failure") {:op op}))))]
    (reify iso.provisioner/DatabaseProvisioner
      (details [_ _ _ iso]
        (swap! calls* conj [:details (:id iso)])
        (fail! :details)
        iso-details)
      (init! [_ _ _ iso]
        (swap! calls* conj [:init! (:id iso)])
        (fail! :init!)
        nil)
      (grant! [_ _ _ iso schemas]
        (swap! calls* conj [:grant! (:id iso) (vec schemas)])
        (fail! :grant!)
        nil)
      (destroy! [_ _ _ iso]
        (swap! calls* conj [:destroy! (select-keys iso [:id :schema :database_details])])
        (fail! :destroy!)
        nil))))

(defn- ops [calls] (mapv first calls))

;;; ---------------------------------------------------------------------------
;;; Lifecycle units (fake provisioner, any app db)
;;; ---------------------------------------------------------------------------

(deftest provision-returns-id-and-is-idempotent-test
  (mt/with-temp [:model/Database db {:engine :postgres :details {}}]
    (let [calls (atom [])
          prov  (fake-provisioner calls)
          id1   (isolation/provision! db #{"public"} prov)
          id2   (isolation/provision! db #{"public"} prov)]
      (is (pos-int? id1))
      (is (= id1 id2) "second provision reuses the standing isolation")
      (is (= [:details :init! :grant!] (ops @calls))
          "no DDL on the second provision")
      (is (=? {:status          :provisioned
               :schema          "iso_schema"
               :read_namespaces ["public"]}
              (t2/select-one :model/DatabaseIsolation :id id1))))))

(deftest provision-grants-union-of-new-namespaces-test
  (mt/with-temp [:model/Database db {:engine :postgres :details {}}]
    (let [calls (atom [])
          prov  (fake-provisioner calls)
          id1   (isolation/provision! db #{"public"} prov)
          id2   (isolation/provision! db #{"public" "extra"} prov)]
      (is (= id1 id2))
      (is (= [["public"] ["extra"]]
             (into [] (comp (filter #(= :grant! (first %))) (map peek)) @calls))
          "only the missing namespace is re-granted")
      (is (= ["extra" "public"]
             (:read_namespaces (t2/select-one :model/DatabaseIsolation :id id1)))
          "persisted read namespaces are the union"))))

(deftest provision-failure-fails-loud-and-is-retryable-test
  (mt/with-temp [:model/Database db {:engine :postgres :details {}}]
    (let [calls (atom [])]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)provisioning database isolation failed"
                            (isolation/provision! db #{"public"} (fake-provisioner calls :fail #{:init!})))
          "provisioning failure is a loud typed throw, never a silent fallback")
      (is (=? {:status :provisioning-failure}
              (t2/select-one :model/DatabaseIsolation :database_id (:id db)))
          "the failure lands on the row")
      (let [id (isolation/provision! db #{"public"} (fake-provisioner calls))]
        (is (pos-int? id) "a retry re-enters provisioning from the failure state")
        (is (=? {:status :provisioned}
                (t2/select-one :model/DatabaseIsolation :id id)))))))

(deftest provision-unsupported-driver-fails-loud-test
  (mt/with-temp [:model/Database db {:engine :h2 :details {}}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)does not support database isolation"
                          (isolation/provision! db #{"public"} (fake-provisioner (atom [])))))))

(deftest with-isolation-unknown-id-fails-loud-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)isolation"
                        (isolation/with-isolation Integer/MAX_VALUE :never))))

(deftest with-isolation-swaps-connection-details-test
  (mt/with-temp [:model/Database db {:engine :postgres :details {:user "prod-user" :host "h"}}]
    (let [id (isolation/provision! db #{"public"} (fake-provisioner (atom [])))]
      (testing "inside the frame every connection for the database resolves the iso principal"
        (isolation/with-isolation id
          (is (=? {:user "iso-user" :password "iso-pass" :host "h"}
                  (driver.conn/effective-details db)))))
      (testing "outside the frame the default principal is back"
        (is (= "prod-user" (:user (driver.conn/effective-details db)))))
      (testing "entering the frame touches last_used_at"
        (is (some? (:last_used_at (t2/select-one :model/DatabaseIsolation :id id)))))
      (testing "nesting a frame for the same database fails loud"
        (isolation/with-isolation id
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"[Nn]ested"
                                (isolation/with-isolation id :never))))))))

(deftest with-isolation-schema-accessor-test
  (mt/with-temp [:model/Database db {:engine :postgres :details {}}]
    (let [id (isolation/provision! db #{"public"} (fake-provisioner (atom [])))]
      (is (= "iso_schema" (isolation/isolation-schema id))))))

(deftest decommission-destroys-and-deletes-test
  (mt/with-temp [:model/Database db {:engine :postgres :details {}}]
    (let [calls (atom [])
          prov  (fake-provisioner calls)
          id    (isolation/provision! db #{"public"} prov)]
      (isolation/decommission! id prov)
      (is (nil? (t2/select-one :model/DatabaseIsolation :id id))
          "the row is gone")
      (is (= [[:destroy! {:id               (str "iso" id)
                          :schema           "iso_schema"
                          :database_details {:user "iso-user" :password "iso-pass"}}]]
             (filterv #(= :destroy! (first %)) @calls))
          "destroy! ran with the persisted identifiers")
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)isolation"
                            (isolation/with-isolation id :never))
          "the handle is dead after decommission"))))

(deftest decommission-failure-recorded-and-retryable-test
  (mt/with-temp [:model/Database db {:engine :postgres :details {}}]
    (let [calls (atom [])
          id    (isolation/provision! db #{"public"} (fake-provisioner calls))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)decommissioning database isolation failed"
                            (isolation/decommission! id (fake-provisioner calls :fail #{:destroy!}))))
      (is (=? {:status :decommissioning-failure}
              (t2/select-one :model/DatabaseIsolation :id id)))
      (isolation/decommission! id (fake-provisioner calls))
      (is (nil? (t2/select-one :model/DatabaseIsolation :id id))
          "a retry completes the teardown"))))

(deftest sweep-stale-decommissions-idle-only-test
  (mt/with-temp [:model/Database stale-db {:engine :postgres :details {}}
                 :model/Database fresh-db {:engine :postgres :details {}}]
    (let [calls    (atom [])
          prov     (fake-provisioner calls)
          stale-id (isolation/provision! stale-db #{"public"} prov)
          fresh-id (isolation/provision! fresh-db #{"public"} prov)]
      (t2/update! :model/DatabaseIsolation stale-id
                  {:last_used_at (t/minus (t/offset-date-time) (t/hours 2))})
      (let [swept (isolation/sweep-stale! {:idle-for (java.time.Duration/ofHours 1)} prov)]
        (is (= [stale-id] swept))
        (is (nil? (t2/select-one :model/DatabaseIsolation :id stale-id))
            "the stale isolation is decommissioned")
        (is (some? (t2/select-one :model/DatabaseIsolation :id fresh-id))
            "the fresh isolation survives")
        (is (= [{:id (str "iso" stale-id) :schema "iso_schema"
                 :database_details {:user "iso-user" :password "iso-pass"}}]
               (into [] (comp (filter #(= :destroy! (first %))) (map peek)) @calls))
            "destroy! ran exactly for the stale isolation"))
      (isolation/decommission! fresh-id prov))))

;;; ---------------------------------------------------------------------------
;;; The DB-enforced backstop (real postgres)
;;; ---------------------------------------------------------------------------

(defn- jdbc-spec
  "The JDBC spec for `db` under the CURRENT connection scope — inside a
  with-isolation frame this resolves the confined principal."
  [db]
  (sql-jdbc.conn/db->pooled-connection-spec db))

(deftest ^:mb/driver-tests postgres-isolation-backstop-test
  (mt/test-driver :postgres
    (let [db (mt/db)
          id (isolation/provision! db #{"public"})]
      (try
        (let [{iso-schema :schema {iso-user :user} :database_details}
              (t2/select-one :model/DatabaseIsolation :id id)]
          (testing "inside the frame the warehouse session user is the confined iso principal"
            (isolation/with-isolation id
              (is (= iso-user
                     (-> (jdbc/query (jdbc-spec db) ["SELECT current_user AS u"]) first :u)))
              (is (str/starts-with? iso-user "mb__isolation_"))))
          (testing "the principal can read granted production schemas"
            (isolation/with-isolation id
              (is (pos? (-> (jdbc/query (jdbc-spec db) ["SELECT count(*) AS c FROM public.venues"])
                            first :c long)))))
          (testing "the principal can write in its own scratch schema"
            (isolation/with-isolation id
              (jdbc/execute! (jdbc-spec db)
                             [(format "CREATE TABLE %s.ghy4188_ok (x int)" iso-schema)])
              (jdbc/execute! (jdbc-spec db)
                             [(format "DROP TABLE %s.ghy4188_ok" iso-schema)])))
          (testing "a write outside the scratch schema is DB-level permission denied"
            (isolation/with-isolation id
              (is (thrown-with-msg? Exception #"(?i)permission denied"
                                    (jdbc/execute! (jdbc-spec db)
                                                   ["CREATE TABLE public.ghy4188_evil (x int)"])))
              (is (thrown-with-msg? Exception #"(?i)permission denied"
                                    (jdbc/execute! (jdbc-spec db)
                                                   ["INSERT INTO public.venues (name) VALUES ('evil')"])))))
          (testing "decommission drops the schema and the user"
            (isolation/decommission! id)
            (is (nil? (t2/select-one :model/DatabaseIsolation :id id)))
            (is (not (driver/schema-exists? :postgres (:id db) iso-schema)))
            (is (empty? (jdbc/query (jdbc-spec db)
                                    ["SELECT 1 FROM pg_roles WHERE rolname = ?" iso-user])))))
        (finally
          (when (t2/exists? :model/DatabaseIsolation :id id)
            (isolation/decommission! id)))))))

(deftest ^:mb/driver-tests postgres-provision-is-idempotent-against-warehouse-test
  (mt/test-driver :postgres
    (let [db  (mt/db)
          id1 (isolation/provision! db #{"public"})
          id2 (isolation/provision! db #{"public"})]
      (try
        (is (= id1 id2))
        (finally
          (isolation/decommission! id1))))))
