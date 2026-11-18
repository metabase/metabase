(ns metabase.sql-tools.common-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.core :as sql-tools]
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
                                                         {:db_id           db-id
                                                          :name            n
                                                          :display_name    n
                                                          :schema          "public"
                                                          :active          true
                                                          :visibility_type nil})]))]
        (doseq [stored   names
                spelling [stored (u/lower-case-en stored) (u/upper-case-en stored)]]
          (testing (format "stored %s, queried as %s" (pr-str stored) (pr-str spelling))
            (is (contains? (sql-tools.common/table-ids-by-name db-id [spelling])
                           (name->id stored))
                "the appdb's lower() disagrees with u/lower-case-en, so the prefilter drops a matching row")))
        (testing "inactive and hidden Tables are excluded, matching what an unfiltered provider fetch returns"
          (t2/insert! :model/Table
                      [{:db_id db-id :name "gone" :display_name "gone"
                        :schema "public" :active false :visibility_type nil}
                       {:db_id db-id :name "shy" :display_name "shy"
                        :schema "public" :active true :visibility_type "hidden"}])
          (is (= #{} (sql-tools.common/table-ids-by-name db-id ["gone" "shy"]))))
        (testing "a name that matches nothing returns empty rather than everything"
          (is (= #{} (sql-tools.common/table-ids-by-name db-id ["no_such_table"]))))
        (testing "no names requested returns empty rather than the whole catalog"
          (is (= #{} (sql-tools.common/table-ids-by-name db-id []))))))))

(deftest find-table-or-transform-uses-synced-default-schema-test
  (let [database {:default-schema "analytics"}
        tables   [{:id 1 :name "orders" :schema "analytics"}
                  {:id 2 :name "orders" :schema "public"}]]
    (testing "an unqualified reference uses the Database's synced default schema"
      (is (= {:table 1}
             (sql-tools.common/find-table-or-transform :h2 database tables [] {:table "orders"}))))
    (testing "an explicit schema takes precedence"
      (is (= {:table 2}
             (sql-tools.common/find-table-or-transform
              :h2 database tables [] {:table "orders" :schema "public"}))))))

(deftest resolve-shared-composite-field-test
  (testing "a composite field that more than one member shares is resolved one time"
    (let [leaf                   {:type :custom-field, :alias "v"}
          composite              (reduce (fn [member _]
                                           {:type :composite-field, :alias "v", :member-fields [member member]})
                                         leaf
                                         (range 16))
          original-resolve-field sql-tools.common/resolve-field
          calls                  (atom 0)]
      (with-redefs [sql-tools.common/resolve-field (fn [& args]
                                                     (swap! calls inc)
                                                     (apply original-resolve-field args))]
        (is (= [{:col {:name                     "v"
                       :lib/desired-column-alias "v"
                       :display-name             "V"
                       :base-type                :type/*
                       :effective-type           :type/*
                       :semantic-type            :Semantic/*}}]
               (sql-tools.common/resolve-field :h2 nil composite)))
        (is (< @calls 5))))))

(def ^:private events-and-users
  "A Postgres database whose `public.events` has the columns `id`, `CreatedAt`, `Name` and `name`, and whose
  `public.users` has `id` and `Email`."
  (providers.mock/mock-metadata-provider
   {:database {:id 1 :engine :postgres :name "pg" :features #{}}
    :tables   [{:id 10 :db-id 1 :schema "public" :name "events" :active true}
               {:id 11 :db-id 1 :schema "public" :name "users" :active true}]
    :fields   (for [[id table-id field-name] [[100 10 "id"] [101 10 "CreatedAt"] [102 10 "Name"] [103 10 "name"]
                                              [110 11 "id"] [111 11 "Email"]]]
                {:id id :table-id table-id :name field-name :base-type :type/Text :active true})}))

(defn- candidates
  "The ids of the candidate columns of the reference to `column` in the select list of `sql`, on Postgres; a candidate
  that belongs to no table appears as `:none`."
  [sql column]
  (let [{:keys [returned-fields]} (sql-tools/field-references :postgres sql)
        field                     (some #(when (= column (:column %)) %) returned-fields)]
    (mapv #(or (:id %) :none) (sql-tools/field-candidates :postgres events-and-users field))))

(defn- resolved
  "The id of the column `resolve-field` picks for the reference to `column` in the select list of `sql`, on Postgres."
  [sql column]
  (let [{:keys [returned-fields]} (sql-tools/field-references :postgres sql)
        field                     (some #(when (= column (:column %)) %) returned-fields)]
    (-> (sql-tools/resolve-field :postgres events-and-users field) first :col :id)))

(deftest field-candidates-test
  (testing "a quoted mixed-case column, which the parser reports lower-cased, is the table's column of that spelling"
    (is (= [101] (candidates "SELECT \"CreatedAt\" FROM \"public\".\"events\"" "createdat"))))
  (testing "a name that two columns of one table share, case aside, gives both"
    (is (= #{102 103} (set (candidates "SELECT \"Name\" FROM \"public\".\"events\"" "name")))))
  (testing "an unqualified column of a join is the column of the one table that has it"
    (is (= [111] (candidates "SELECT \"Email\" FROM \"public\".\"events\" e JOIN \"public\".\"users\" u ON e.id = u.id"
                             "email"))))
  (testing "an unqualified column that both tables of a join have gives the column of each"
    (is (= #{100 110} (set (candidates "SELECT id FROM \"public\".\"events\" e JOIN \"public\".\"users\" u ON e.id = u.id"
                                       "id")))))
  (testing "a column of an inner query shadows a column of that name in an outer one"
    (is (= [110] (candidates (str "SELECT (SELECT id FROM \"public\".\"users\" LIMIT 1) AS x"
                                  " FROM \"public\".\"events\"")
                             "id"))))
  (testing "a name no table has gives none"
    (is (= [] (candidates "SELECT \"Missing\" FROM \"public\".\"events\"" "missing"))))
  (testing "a name no table has gives an empty vector, not nil"
    (let [{:keys [returned-fields]} (sql-tools/field-references :postgres "SELECT \"Missing\" FROM \"public\".\"events\"")]
      (is (= [] (sql-tools/field-candidates :postgres events-and-users (first returned-fields))))))
  (testing "a source whose columns are unknown, such as a table function, gives a candidate that belongs to no table"
    (is (= #{:none 100} (set (candidates "SELECT id FROM \"public\".\"events\", generate_series(1, 2) AS g" "id")))))
  (testing "`resolve-field` picks the first candidate"
    (doseq [[sql column] [["SELECT \"Name\" FROM \"public\".\"events\"" "name"]
                          ["SELECT id FROM \"public\".\"events\" e JOIN \"public\".\"users\" u ON e.id = u.id" "id"]
                          ["SELECT \"CreatedAt\" FROM \"public\".\"events\"" "createdat"]]]
      (is (= (first (candidates sql column)) (resolved sql column)) sql))))
