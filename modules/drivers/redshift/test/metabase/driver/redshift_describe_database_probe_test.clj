(ns ^:mb/driver-tests metabase.driver.redshift-describe-database-probe-test
  "Diagnostic probe for `describe-database-exclude-metabase-cache-test` returning an empty schema set.

  That test's first assertion is a sense check: with an inclusion filter of `metabase_cache*,20*,pg_*`, at least
  one synced schema should match `20*` -- the per-run session schema, which the test itself creates. It fails
  with `synced-schemas` = `#{}`, meaning `describe-database` returned nothing at all.

  Three stages can produce that, and the failure alone does not say which:

    1. the query returned no rows for the session schema;
    2. `(filter (comp true? :selectable))` dropped them. That filter arrived with #81734, which moved the
       per-relation privilege check out of the `where` and into the select list. Its unit test mocks
       `reducible-query` and feeds real Clojure booleans, so a JDBC type mismatch -- the column arriving as a
       string, or under another key -- would pass that test and drop every row here;
    3. `syncable?` dropped them, i.e. `20*` does not match the schema name it is meant to.

  [[funnel-probe]] counts survivors at each stage against a live cluster, so one run names the stage. On
  failure the whole funnel is printed as the assertion message. [[session-schema-matches-20-star-test]]
  settles stage 3 with no cluster at all."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.redshift :as redshift]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sync :as driver.s]
   [metabase.test :as mt]
   [metabase.test.data.redshift :as redshift.tx]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private probe-patterns
  "The inclusion filter the failing test uses."
  "metabase_cache*,20*,pg_*")

(deftest session-schema-matches-20-star-test
  (testing "the `20*` segment matches a session schema name, so stage 3 is not what drops the rows"
    ;; No cluster needed: `include-schema?` is pure, and a session schema name is just `<utc-date>_<hour>_<uuid>_schema`.
    (let [session-schema "2026_09_04_15_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_schema"]
      (is (boolean (driver.s/include-schema? probe-patterns nil session-schema))
          "an inclusion filter of 20* should admit a session schema")
      (is (not (boolean (driver.s/include-schema? probe-patterns nil "public")))
          "and should still reject an unrelated schema"))))

(defn- funnel
  "Survivor counts at each stage of [[redshift/describe-database-tables]], plus what the `:selectable` column
  actually held. Everything the three hypotheses need in order to be told apart."
  [db session-schema]
  (let [sql       (#'redshift/get-tables-sql (#'redshift/exactly-named-schemas probe-patterns))
        rows      (into [] (sql-jdbc.execute/reducible-query db sql))
        twenties  (filter #(some->> (:schema %) (re-matches #"20.*")) rows)
        syncable? #(driver.s/include-schema? probe-patterns nil %)]
    {:session-schema           session-schema
     :narrowed-to              (#'redshift/exactly-named-schemas probe-patterns)
     ;; stage 1 -- what the query returned
     :rows                     (count rows)
     :distinct-schemas         (count (into #{} (map :schema) rows))
     :rows-in-20-schemas       (count twenties)
     :rows-in-this-run-schema  (count (filter #(= session-schema (:schema %)) rows))
     :row-keys                 (into (sorted-set) (mapcat keys) (take 200 rows))
     ;; stage 2 -- the true? :selectable filter, and the types behind it
     :selectable-types         (frequencies (map #(some-> ^Object (:selectable %) .getClass .getName) rows))
     :selectable-values        (frequencies (map :selectable rows))
     :rows-passing-selectable  (count (filter (comp true? :selectable) rows))
     :twenties-passing-selectable (count (filter (comp true? :selectable) twenties))
     ;; stage 3 -- the syncable? filter
     :rows-passing-syncable    (count (filter (comp syncable? :schema) rows))
     :twenties-passing-syncable (count (filter (comp syncable? :schema) twenties))
     ;; stage 4 -- end to end
     :described-tables         (count (into [] (#'redshift/describe-database-tables db)))
     :described-schemas        (into (sorted-set) (map :schema) (#'redshift/describe-database-tables db))
     :sample-row               (first rows)
     :sql                      (first sql)}))

(deftest ^:synchronized funnel-probe
  (testing "which stage of describe-database loses this run's session schema"
    (mt/test-driver :redshift
      (mt/dataset avian-singles
        (let [details (assoc (:details (mt/db))
                             :schema-filters-type "inclusion"
                             :schema-filters-patterns probe-patterns)]
          (mt/with-temp [:model/Database db {:engine :redshift, :details details}]
            (binding [redshift.tx/*override-describe-database-to-filter-by-db-name?* false]
              (let [f (funnel db (redshift.tx/unique-session-schema))]
                ;; The one claim the failing test makes. Everything measured rides along in the message, so a
                ;; single red run says which stage is at fault instead of only that the result was empty.
                (is (pos? (:twenties-passing-selectable f))
                    (u/pprint-to-str f))))))))))
