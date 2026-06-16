(ns metabase.app-db.mysql-cascade-probe-test
  "Diagnostic A/B probe for the MySQL 9.7 multi-level ON DELETE CASCADE regression.

  Background: deleting a `metabase_database` row and relying on DB-level `ON DELETE CASCADE` leaves orphaned
  `report_card` and `metabase_field` rows on `mysql:latest` (9.7.0) but not on 9.6.0 / 8.x. The production fix
  (`remove-sqlite-sample-database-on-downgrade!`) deletes children explicitly, so the mechanism was never pinned.

  This probe issues ONE bare `DELETE FROM metabase_database` against the real schema's FK fan-out and records exactly
  what happened, to distinguish three hypotheses:

    H1  SQL-layer cascade executor row-skip bug (9.7's trigger-executor rewrite, WL#17024).
        Signature: DELETE does NOT throw, @@foreign_key_checks=1, all FK delete-rules are CASCADE,
        yet children survive, deterministically across runs. -> genuine server cascade bug.

    H2  Mid-cascade error abort. SQL-layer cascade = a statement sequence; if one child DML errors the cascade
        aborts partway. Signature: DELETE THROWS (capture SQLState/message), or survivors vary across runs.

    H3  `foreign_key_checks` disabled somewhere. Signature: @@foreign_key_checks=0 -> NO cascade at all
        (metabase_table survives too, not just fields/cards).

  This runs only when the app DB is MySQL. The in-process run can only OBSERVE @@innodb_native_foreign_keys
  (read-only startup var). To complete the A/B, run this same test against servers started with different configs:

    docker run mysql:8.4    ...                              # InnoDB-native FK path (baseline, expect 0 orphans)
    docker run mysql:9.6    ...                              # SQL-layer, pre-trigger-rewrite (expect 0 orphans)
    docker run mysql:latest ...                              # 9.7.x SQL-layer (expect orphans if H1)
    docker run mysql:latest --innodb-native-foreign-keys=ON  # 9.7.x reverted to native (expect 0 orphans -> confirms H1)

  Compare the printed [CASCADE-PROBE] reports across those four runs."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private runs 3)

(defn- scalar
  "Run a one-column, one-row SQL query and return the single value, or `::unsupported` if the statement errors
  (e.g. a system variable that doesn't exist on this server version)."
  [sql]
  (try
    (-> (t2/query [sql]) first vals first)
    (catch Throwable _ ::unsupported)))

(defn- server-facts []
  {:version                    (scalar "SELECT VERSION()")
   :innodb_native_foreign_keys (scalar "SELECT @@innodb_native_foreign_keys")
   :foreign_key_checks         (scalar "SELECT @@foreign_key_checks")
   :enable_cascade_triggers    (scalar "SELECT @@enable_cascade_triggers")})

(defn- fk-delete-rules
  "DELETE_RULE for every FK whose parent is one of the tables we delete from. Confirms these relations are actually
  declared ON DELETE CASCADE in the live schema (so survivors mean the engine skipped a CASCADE, not a RESTRICT)."
  []
  (t2/query
   ["SELECT table_name, referenced_table_name, constraint_name, delete_rule
       FROM information_schema.referential_constraints
      WHERE constraint_schema = DATABASE()
        AND referenced_table_name IN ('metabase_database', 'metabase_table')
      ORDER BY referenced_table_name, table_name"]))

(defn- insert-fan-out!
  "Insert the bundled sample-content fan-out under a fresh sample `metabase_database` and return the ids needed to
  measure survivors and to tear everything down. Shape mirrors `migrate-away-from-sqlite-sample-database-on-downgrade-test`:
  8 tables x 7 fields, 39 cards, plus dashcards and a series."
  []
  (let [sample    (first (t2/insert-returning-instances! :model/Database
                                                         {:engine :h2 :is_sample true :details {:db "mem:probe"}}))
        db-id     (:id sample)
        table-ids (vec (t2/insert-returning-pks! :model/Table
                                                 (for [i (range 8)]
                                                   {:db_id db-id :name (str "probe_table_" i) :active true})))
        field-ids (vec (t2/insert-returning-pks! :model/Field
                                                 (for [tid table-ids
                                                       i   (range 7)]
                                                   {:table_id tid :name (str "field_" i)
                                                    :base_type :type/Text :database_type "TEXT" :position i})))
        card-ids  (vec (t2/insert-returning-pks! :model/Card
                                                 (for [i (range 39)]
                                                   {:name (str "probe card " i) :display "table"
                                                    :dataset_query {} :visualization_settings {}
                                                    :creator_id (mt/user->id :rasta)
                                                    :database_id db-id
                                                    :table_id (nth table-ids (mod i (count table-ids)))})))]
    {:db-id db-id :table-ids table-ids :field-ids field-ids :card-ids card-ids}))

(defn- survivors
  "Count rows of each child relation still present after the cascade DELETE. All zeros == cascade reached everything."
  [{:keys [db-id table-ids field-ids card-ids]}]
  {:metabase_database (t2/count :metabase_database :id db-id)
   :metabase_table    (t2/count :metabase_table :id [:in table-ids])
   :metabase_field    (t2/count :metabase_field :id [:in field-ids])
   :report_card       (t2/count :report_card :id [:in card-ids])})

(defn- teardown! [{:keys [db-id table-ids field-ids card-ids]}]
  ;; Disable FK checks so we can nuke whatever the (possibly partial) cascade left behind, in any order.
  (t2/query ["SET FOREIGN_KEY_CHECKS = 0"])
  (try
    (doseq [[table ids] [[:report_card card-ids]
                         [:metabase_field field-ids]
                         [:metabase_table table-ids]]
            :when (seq ids)]
      (t2/query {:delete-from table :where [:in :id ids]}))
    (t2/query {:delete-from :metabase_database :where [:= :id db-id]})
    (finally
      (t2/query ["SET FOREIGN_KEY_CHECKS = 1"]))))

(defn- one-run! []
  (let [ids (insert-fan-out!)
        ;; The whole point: a bare cascade DELETE, no app-level child cleanup. Capture an error if it aborts (H2).
        delete-result (try
                        (t2/query ["DELETE FROM metabase_database WHERE id = ?" (:db-id ids)])
                        {:threw? false}
                        (catch java.sql.SQLException e
                          {:threw? true :sql-state (.getSQLState e) :message (.getMessage e)}))
        result {:delete delete-result :survivors (survivors ids)}]
    (teardown! ids)
    result))

(deftest ^:mb/driver-tests mysql-cascade-reach-probe-test
  (when (= :mysql (mdb/db-type))
    (let [facts   (server-facts)
          rules   (fk-delete-rules)
          results (vec (repeatedly runs one-run!))
          orphan-sets (->> results
                           (map (comp #(into {} (remove (comp zero? val) %)) :survivors))
                           distinct)
          any-threw?  (some (comp :threw? :delete) results)
          deterministic? (= 1 (count orphan-sets))]
      (println "\n========== [CASCADE-PROBE] ==========")
      (println "server:" (pr-str facts))
      (println "fk-delete-rules:")
      (doseq [r rules] (println "  " (pr-str r)))
      (println "per-run results:")
      (doseq [[i r] (map-indexed vector results)]
        (println (format "  run %d: delete=%s survivors=%s" i (pr-str (:delete r)) (pr-str (:survivors r)))))
      (println "deterministic?" deterministic? " any-delete-threw?" (boolean any-threw?))
      (let [all-zero? (every? (fn [r] (every? zero? (vals (:survivors r)))) results)
            table-survived? (some (fn [r] (pos? (:metabase_table (:survivors r)))) results)
            verdict (cond
                      all-zero?                         :no-regression
                      (= 0 (:foreign_key_checks facts)) :H3-foreign_key_checks-off
                      table-survived?                   :H3-or-total-cascade-off
                      any-threw?                        :H2-mid-cascade-abort
                      (not deterministic?)              :H2-nondeterministic
                      :else                             :H1-sql-layer-executor-rowskip)]
        (println "VERDICT:" verdict)
        (println "=====================================\n")
        ;; Not an assertion of correctness - a diagnostic record. Surface the facts; never red on a real server.
        (is (some? (:version facts)) "probe ran against a live MySQL server")))))
