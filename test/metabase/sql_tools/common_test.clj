(ns metabase.sql-tools.common-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest table-ids-by-name-case-folding-test
  (testing "table-ids-by-name must fold case the same way the application database's lower() does.

           It is a prefilter, not the decision: it narrows with SQL `lower(name)` against names lowered by
           u/lower-case-en, and find-table-or-transform then matches precisely using the driver's normalize-name. That
           is only correct while the prefilter returns a superset of what the precise match accepts, so if the appdb's
           lower() and Java's disagree about a name the prefilter drops a row that would have matched and the
           dependency silently disappears. This therefore has to run on every supported appdb -- H2 in the backend
           workflow, Postgres and MariaDB in app-db.yml -- which it does simply by existing.

           Scope: ASCII case variants (the real case, since warehouses like Snowflake report upper-case while
           normalize-name lower-cases) and accented Latin. Deliberately not covered: locale-dependent folds such as
           U+0130 LATIN CAPITAL LETTER I WITH DOT ABOVE, where lower() legitimately differs between engines and
           locales. That stays a documented limit of the prefilter rather than an assertion."
    (mt/with-temp [:model/Database {db-id :id} {:name "case-folding-probe" :engine :h2 :details {}}]
      (let [names    ["orders" "PRODUCTS" "MixedCase" "École"]
            name->id (into {}
                           (for [n names]
                             [n (t2/insert-returning-pk! :model/Table
                                                         {'db_id           db-id
                                                          'name            n
                                                          'display_name    n
                                                          'schema          "public"
                                                          'active          true
                                                          'visibility_type nil})]))]
        (doseq [stored   names
                spelling [stored (u/lower-case-en stored) (u/upper-case-en stored)]]
          (testing (format "stored %s, queried as %s" (pr-str stored) (pr-str spelling))
            (is (contains? (sql-tools.common/table-ids-by-name db-id [spelling])
                           (name->id stored))
                "the appdb's lower() disagrees with u/lower-case-en, so the prefilter drops a matching row")))
        (testing "inactive and hidden Tables are excluded, matching what an unfiltered provider fetch returns"
          (t2/insert! :model/Table
                      [{'db_id db-id 'name "gone" 'display_name "gone"
                        'schema "public" 'active false 'visibility_type nil}
                       {'db_id db-id 'name "shy" 'display_name "shy"
                        'schema "public" 'active true 'visibility_type "hidden"}])
          (is (= #{} (sql-tools.common/table-ids-by-name db-id ["gone" "shy"]))))
        (testing "a name that matches nothing returns empty rather than everything"
          (is (= #{} (sql-tools.common/table-ids-by-name db-id ["no_such_table"]))))
        (testing "no names requested returns empty rather than the whole catalog"
          (is (= #{} (sql-tools.common/table-ids-by-name db-id []))))))))
