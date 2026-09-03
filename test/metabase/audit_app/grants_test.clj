(ns metabase.audit-app.grants-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.grants :as grants]
   [metabase.audit-app.purview :as purview]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest reconciliation-test
  (let [a-purview-view (first (sort purview/audit-view-names))
        holds-purview  (zipmap purview/audit-view-names (repeat true))]
    (testing "nothing to do when the role already holds exactly the purview"
      (is (= {:grant #{} :revoke #{}}
             (#'grants/reconciliation holds-purview))))
    (testing "a purview view the role cannot read is granted"
      (is (= {:grant #{a-purview-view} :revoke #{}}
             (#'grants/reconciliation (assoc holds-purview a-purview-view false)))))
    (testing "a `v_` view the role holds but the purview dropped is revoked"
      (is (= {:grant #{} :revoke #{"v_no_longer_in_the_purview"}}
             (#'grants/reconciliation (assoc holds-purview "v_no_longer_in_the_purview" true)))))
    (testing "a grant on something that isn't a `v_` view is the operator's business, not ours"
      (is (= {:grant #{} :revoke #{}}
             (#'grants/reconciliation (assoc holds-purview "core_user" true)))))
    (testing "a purview entry with no view behind it is skipped -- GRANT on a missing object would fail the batch"
      (is (= {:grant #{} :revoke #{}}
             (#'grants/reconciliation (dissoc holds-purview a-purview-view)))))))

(deftest reconcile-audit-read-grants!-no-op-test
  (testing "no configured audit-read role means nothing to reconcile"
    (is (nil? (grants/reconcile-audit-read-grants! nil))))
  (when-not (= :postgres (mdb/db-type))
    (testing "grants aren't reconciled where they can't be enforced"
      (is (nil? (grants/reconcile-audit-read-grants! "metabase_audit_read"))))))

;;; The rest needs a Postgres application database (`MB_DB_TYPE=postgres`) and an app-DB user that can create roles.

(def ^:private test-role "mb_audit_grants_test_role")

(def ^:private extra-view "v_not_in_the_audit_purview")

(defn- granted-views
  "The `v_*` views [[test-role]] currently holds a direct `SELECT` grant on."
  []
  (into #{}
        (keep (fn [[view granted?]] (when granted? view)))
        (#'grants/views-and-grants test-role)))

(defn- purview-views-present []
  (set (filter purview/audit-view-names (keys (#'grants/views-and-grants test-role)))))

(defn- do-with-test-role! [thunk]
  (t2/query (format "DROP ROLE IF EXISTS %s" test-role))
  (t2/query (format "CREATE ROLE %s" test-role))
  (try
    (thunk)
    (finally
      (t2/query (format "DROP OWNED BY %s" test-role))
      (t2/query (format "DROP ROLE %s" test-role)))))

(deftest reconcile-audit-read-grants!-test
  (when (= :postgres (mdb/db-type))
    (do-with-test-role!
     (fn []
       (testing "the migrations created every purview view"
         ;; without this the assertions below would all hold vacuously against an empty purview
         (is (= purview/audit-view-names (purview-views-present))))
       (testing "a role with no grants ends up holding SELECT on exactly the purview"
         (let [{:keys [grant revoke]} (grants/reconcile-audit-read-grants! test-role)]
           (is (= (purview-views-present) grant))
           (is (= #{} revoke)))
         (is (= (purview-views-present) (granted-views))))
       (testing "reconciling again changes nothing"
         (is (= {:grant #{} :revoke #{}}
                (grants/reconcile-audit-read-grants! test-role))))
       (testing "a grant on a `v_` view outside the purview is revoked"
         (try
           (t2/query (format "CREATE VIEW %s AS SELECT 1 AS x" extra-view))
           (t2/query (format "GRANT SELECT ON %s TO %s" extra-view test-role))
           (is (contains? (granted-views) extra-view))
           (is (= {:grant #{} :revoke #{extra-view}}
                  (grants/reconcile-audit-read-grants! test-role)))
           (is (= (purview-views-present) (granted-views)))
           (finally
             (t2/query (format "DROP VIEW IF EXISTS %s" extra-view)))))
       (testing "a view dropped and recreated by a migration gets its grant back"
         (let [view (first (sort (purview-views-present)))
               ddl  (:definition (t2/query-one {:select [[[:pg_get_viewdef [:cast view :regclass] true] :definition]]}))]
           (t2/query (format "DROP VIEW %s" view))
           (t2/query (format "CREATE VIEW %s AS %s" view ddl))
           (is (not (contains? (granted-views) view))
               "dropping the view must drop its grant, or this test proves nothing")
           (is (= {:grant #{view} :revoke #{}}
                  (grants/reconcile-audit-read-grants! test-role)))))))))

(deftest reconcile-audit-read-grants!-missing-role-test
  (when (= :postgres (mdb/db-type))
    (testing "a role that doesn't exist is reported, not thrown"
      (is (nil? (grants/reconcile-audit-read-grants! "mb_audit_grants_role_that_does_not_exist"))))))
