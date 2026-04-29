(ns ^:mb/driver-tests metabase.query-processor.json-field-alias-test
  "Regression tests for compiling queries that reference JSON-unfolded fields through aliases containing characters
  that HoneySQL would otherwise treat as identifier separators (notably `/`). See #70445."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test.data.env :as tx.env]))

(defn- drivers-with-nested-field-support
  "Active SQL test drivers that support JSON unfolding (`:nested-field-columns`) or native nested
  fields (`:nested-fields`). The bug this test guards against is about SQL identifier quoting, so
  non-SQL drivers (e.g. Mongo) are excluded. Uses a stub database so this works without any live DB
  connection."
  []
  (for [driver (tx.env/test-drivers)
        ;; force the driver namespace to load so its hierarchy derivations and `database-supports?`
        ;; defmethods are registered.
        :let   [_       (driver/the-driver driver)
                stub-db {:lib/type :metadata/database, :engine driver, :id -1, :details {}}]
        :when  (and (isa? driver/hierarchy driver :sql)
                    (or (driver/database-supports? driver :nested-field-columns stub-db)
                        (driver/database-supports? driver :nested-fields stub-db)))]
    driver))

(defn- json-field-slash-alias-metadata-provider [driver]
  (let [;; BigQuery's query-processor calls `project-id-for-current-query` during compilation, which
        ;; asserts on a valid `:service-account-json`. We short-circuit that by pre-populating the
        ;; cached `:project-id-from-credentials` in the mock details. Other drivers ignore this key.
        details (cond-> {}
                  (= driver :bigquery-cloud-sdk) (assoc :project-id-from-credentials "test-project"))
        base (lib.tu/mock-metadata-provider
              {:database (assoc meta/database :engine driver :id 1 :details details)
               :tables   [(merge (meta/table-metadata :venues)
                                 {:id     1
                                  :db-id  1
                                  :name   "json_alias_test"
                                  :schema nil})]
               :fields   [(merge (meta/field-metadata :venues :id)
                                 {:id            1
                                  :table-id      1
                                  :name          "json_alias_test"
                                  :nfc-path      ["bob" "propertyA"]
                                  :database-type "VARCHAR"})]})]
    (lib.tu/mock-metadata-provider
     base
     {:cards [{:name          "test/Model"
               :id            123
               :database-id   1
               :dataset-query (lib/query base (lib.metadata/table base 1))}]})))

(deftest json-breakout-from-joined-slashed-model-test
  (testing "Breakout on a JSON-unfolded field from a joined model whose name contains `/` (#70445)"
    ;; Iterate drivers directly instead of `mt/test-drivers`: that macro loads each driver's
    ;; test-data extensions namespace, which isn't needed for a pure compile test and may not be
    ;; on the classpath (e.g. druid-jdbc).
    (doseq [driver (drivers-with-nested-field-support)]
      (testing (str "driver " driver)
        (driver/with-driver driver
          (let [mp         (json-field-slash-alias-metadata-provider driver)
                table-meta (lib.metadata/table mp 1)
                card-meta  (lib.metadata/card mp 123)
                base       (lib/query mp table-meta)
                lhs        (first (lib/join-condition-lhs-columns base card-meta nil nil))
                rhs        (first (lib/join-condition-rhs-columns base card-meta nil nil))
                join-alias "test/Model - json_alias_test"
                joined     (lib/join base (-> (lib/join-clause card-meta
                                                               [(lib/= lhs (lib/with-join-alias rhs join-alias))])
                                              (lib/with-join-fields :all)
                                              (lib/with-join-alias join-alias)))
                ;; Reference the JSON-unfolded field (field 1, which has :nfc-path) *by id*, qualified
                ;; with the join alias. The bug only fires when the breakout resolves to a field with
                ;; `:nfc-path` — that only happens when the ref carries an integer id. Lib's default
                ;; path through `breakoutable-columns` for a joined card produces a *by-name* ref, so
                ;; we build the ref directly and attach the join alias.
                json-ref   (lib/with-join-alias (lib/ref (lib.metadata/field mp 1)) join-alias)
                query      (-> joined
                               (lib/aggregate (lib/count))
                               (lib/breakout json-ref))
                ;; Stub the two pre-processing middleware that hit the app-db (impersonation
                ;; and database routing). The mock metadata provider has no real Database row,
                ;; so letting them run would fail. master uses the
                ;; `*skip-middleware-because-app-db-access*` dynamic var (#71775) for this; we
                ;; avoid backporting that var here because it's slated to be replaced by an
                ;; app-db protocol (QUE2-488). Resolved at runtime so the test still loads in
                ;; OSS builds where these enterprise namespaces aren't on the classpath.
                ee-stubs   (into {} (keep (fn [sym]
                                            (try
                                              (when-let [v (requiring-resolve sym)]
                                                [v identity])
                                              (catch java.io.FileNotFoundException _ nil)))
                                          '[metabase-enterprise.database-routing.middleware/attach-destination-db-middleware
                                            metabase-enterprise.impersonation.middleware/apply-impersonation]))
                sql        (with-redefs-fn ee-stubs
                             (fn [] (:query (qp.compile/compile query))))]
            (testing (str "generated SQL must not split the slash in the join alias:\n" sql)
              (is (not (re-find #"test[\"`]\.[\"`]Model" sql))))))))))
