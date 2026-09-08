(ns metabase.metabot.tools.construct-numeric-permissions-test
  "Permission-boundary tests for the numeric-id dialect (GHY-4410).

  `construct_representations_test` runs against a mock metadata provider with `api/read-check`
  and `api/query-check` stubbed to allow-all, which is right for testing resolution but cannot
  observe enforcement. These tests use a real application database and a real unprivileged user,
  so a missing check shows up as a leak rather than as a passing stub.

  The invariant under test: on the numeric-id surface, an LLM-authored integer must denote
  something this query may actually reference — a card the caller can read, a table in the
  query's own database, a column the warehouse exposes — and must fail closed, and quietly, when
  it does not. The portable dialect gets all of that from resolving names through a
  database-scoped provider; the numeric dialect has to ask for it explicitly."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.models.interface :as mi]
   [metabase.models.serialization.resolve :as serdes.resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- count-query
  "A trivial `venues` count, built with Lib rather than the deprecated `mt/mbql-query`."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- victim-query
  "The unreadable card's query. The named expression and the aggregation are the point: both
  produce result columns whose names appear nowhere in the caller's own request, so a leak of
  this card's columns is unmistakable in an assertion."
  []
  (let [mp       (mt/metadata-provider)
        base     (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        price    (lib.metadata/field mp (mt/id :venues :price))
        category (lib.metadata/field mp (mt/id :venues :category_id))]
    (-> base
        (lib/expression "SecretMargin" (lib/* (lib/ref price) 3))
        (lib/aggregate (lib/count))
        (lib/breakout (lib/ref category))
        (as-> q (lib/breakout q (lib/expression-ref q "SecretMargin"))))))

(defn- unreadable-card-thunk
  "Run `f` with a card in crowberto's personal collection — which rasta cannot read — bound to
  its id. The card carries a named expression and an aggregation so a column-name leak is
  unmistakable in the assertion."
  [f]
  (let [victim-coll-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))]
    (mt/with-temp [:model/Card victim {:collection_id victim-coll-id
                                       :database_id   (mt/id)
                                       :dataset_query (victim-query)}]
      (f (:id victim)))))

(defn- attempt-as-rasta
  "Run `query` through the pipeline as rasta on the numeric-id surface, returning a map
  describing the outcome rather than throwing."
  [query]
  (mt/with-current-user (mt/user->id :rasta)
    (binding [serdes.resolve/*numeric-ids-allowed?* true]
      (try
        ;; Discard the resolved query: it is a large nested map and these tests only care
        ;; whether the call was permitted.
        (construct/execute-representations-query query)
        {:outcome :resolved}
        (catch clojure.lang.ExceptionInfo e
          {:outcome   :threw
           :status    (:status-code (ex-data e))
           :error     (:error (ex-data e))
           :available (:available (ex-data e))
           ;; Bounded: some pipeline messages embed a whole humanized schema explanation, which
           ;; is large enough to blow the regex engine's stack when scanned for leaked names.
           :message   (let [m (or (ex-message e) "")]
                        (subs m 0 (min 400 (count m))))})))))

(defn- db-name [] (t2/select-one-fn :name :model/Database :id (mt/id)))

(deftest numeric-source-card-later-stage-is-read-checked-test
  (testing (str "GHY-4410: a numeric `source-card` on a stage after the first must be read-checked.\n"
                "`resolve-database-id-from-first-stage` only ever looks at stages[0], so before the\n"
                "fix this reached repair's cross-stage column inference unchecked and reported the\n"
                "card's column names — including an author-invented expression name — back to a\n"
                "caller with no access to it.")
    (mt/with-premium-features #{}
      (unreadable-card-thunk
       (fn [victim-id]
         (let [result (attempt-as-rasta
                       {:lib/type "mbql/query"
                        :database (db-name)
                        :stages   [{:lib/type "mbql.stage/mbql" :source-table (mt/id :venues)}
                                   {:lib/type    "mbql.stage/mbql"
                                    :source-card victim-id
                                    :fields      [["field" {} "zzz_not_a_column"]]}]})]
           (is (= :threw (:outcome result))
               "an unreadable card must not resolve")
           (is (= 400 (:status result))
               "denied as a plain not-found — see unreadable-and-missing-card-are-indistinguishable-test")
           (is (= :unknown-card-id (:error result)))
           (testing "no column of the unreadable card is reported, in ex-data or in the message"
             (is (nil? (:available result)))
             (doseq [leaked ["SecretMargin" "CATEGORY_ID" "count"]]
               (is (not (re-find (re-pattern leaked) (:message result)))
                   (str "message must not name the card's column " leaked))))))))))

(deftest numeric-source-card-alongside-source-table-is-read-checked-test
  (testing (str "GHY-4410: `source-table` and `source-card` on the SAME first stage. The `cond` in\n"
                "`resolve-database-id-from-first-stage` takes the `source-table` branch, so the card\n"
                "never reaches that function's read check — the check has to live on the resolution\n"
                "path itself, not in the database-id lookup.")
    (mt/with-premium-features #{}
      (unreadable-card-thunk
       (fn [victim-id]
         (let [result (attempt-as-rasta
                       {:lib/type "mbql/query"
                        :database (db-name)
                        :stages   [{:lib/type     "mbql.stage/mbql"
                                    :source-table (mt/id :venues)
                                    :source-card  victim-id
                                    :fields       [["field" {} "zzz_not_a_column"]]}]})]
           (is (= :threw (:outcome result)))
           (is (= 400 (:status result)))
           (is (= :unknown-card-id (:error result)))
           (is (nil? (:available result)))))))))

(deftest numeric-source-card-readable-resolves-through-the-store-test
  (testing (str "the check is not over-broad: a card the caller CAN read resolves through the same\n"
                "read-checked store that denies an unreadable one.\n\n"
                "Asserted at the store/resolver layer rather than end-to-end. End-to-end, the\n"
                "success path runs `permissions.util/PathSchema` (a `mu/defn` return schema, so\n"
                "dev/test only) on top of the already-deep pipeline call chain; java.util.regex\n"
                "recurses once per quantifier iteration, and the combined depth overflows the\n"
                "stack. Pre-existing and unrelated to this fix — the same `read-check` outside the\n"
                "pipeline succeeds — so this pins the behavior that matters without depending on\n"
                "it. Only the success path reaches there; the denial tests above are unaffected.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card readable {:collection_id nil
                                           :database_id   (mt/id)
                                           :dataset_query (count-query)}]
        (mt/with-current-user (mt/user->id :rasta)
          (binding [serdes.resolve/*numeric-ids-allowed?* true]
            (is (some? (resolve.mp/card-by-id shared.content-store/default-store (:id readable)))
                "a readable card must come back from the read-checked store")))))))

(deftest numeric-source-card-unreadable-is-denied-by-the-store-test
  (testing (str "the mirror of the test above, at the same layer: the read-checked store is what\n"
                "turns an unreadable card into a denial, which is why routing the numeric branch\n"
                "through it is the fix.")
    (mt/with-premium-features #{}
      (unreadable-card-thunk
       (fn [victim-id]
         (mt/with-current-user (mt/user->id :rasta)
           (binding [serdes.resolve/*numeric-ids-allowed?* true]
             (is (nil? (resolve.mp/card-by-id shared.content-store/default-store victim-id))
                 (str "an unreadable card must come back as nil from the read-checked store — "
                      "the denial is collapsed there so callers cannot tell it from a missing id")))))))))

;;; ============================================================
;;; Numeric ids must denote something this query may reference
;;; ============================================================

(deftest numeric-source-table-from-another-database-is-rejected-test
  (testing (str "a numeric `source-table` pulling a table from a DIFFERENT database into a query\n"
                "must not resolve.\n\n"
                "The interesting case is a MIXED query, which is why this uses a join: when the only\n"
                "source is the foreign table, `resolve-database-id-from-first-stage` simply builds the\n"
                "provider for that table's own database and the query is consistently about database\n"
                "B — no boundary crossed. The bug is a query rooted in database A that reaches into B.\n\n"
                "The portable path gets this for free: `find-table` compares the FK's db name to the\n"
                "provider's and throws. A bare id skips that, and `api/query-check` does not close the\n"
                "gap — it asks whether the caller may query that table, never whether the table belongs\n"
                "to this query's database.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Database other     {:engine :h2 :name "OtherDB-xdb-test"}
                     :model/Table    other-tbl {:db_id (:id other) :name "OTHER_TBL" :active true}]
        (let [result (attempt-as-rasta
                      {:lib/type "mbql/query"
                       :database (db-name)
                       :stages   [{:lib/type     "mbql.stage/mbql"
                                   :source-table (mt/id :venues)
                                   :joins        [{:lib/type   "mbql/join"
                                                   :alias      "j"
                                                   :stages     [{:lib/type     "mbql.stage/mbql"
                                                                 :source-table (:id other-tbl)}]
                                                   :conditions [["=" {}
                                                                 ["field" {} (mt/id :venues :id)]
                                                                 ["field" {} (mt/id :venues :id)]]]}]}]})]
          (is (= :threw (:outcome result))
              "a foreign-database table must not resolve")
          (is (= :unknown-table-id (:error result))
              "and it is reported as an unresolvable reference, not as a permission failure"))))))

(deftest foreign-database-table-is-never-permission-checked-test
  (testing (str "the security property behind the test above, asserted directly: a table id from\n"
                "another database must never reach `api/query-check`.\n\n"
                "This is the assertion that actually pins the fix. The query is refused either way —\n"
                "downstream resolution fails on a table its provider cannot see — but WHERE it is\n"
                "refused decides whether a permission check ever ran against a foreign row. Handing\n"
                "such an id to `query-check` asks 'may this user query table N?' with no reference to\n"
                "the query's own database, so it answers yes for anyone with access to the other\n"
                "database, and the refusal downstream becomes incidental rather than a boundary.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Database other     {:engine :h2 :name "OtherDB-qcheck-test"}
                     :model/Table    other-tbl {:db_id (:id other) :name "OTHER_TBL" :active true}]
        (let [checked (atom [])
              orig    api/query-check]
          (with-redefs [api/query-check (fn [& args]
                                          (swap! checked conj (vec args))
                                          (apply orig args))]
            (attempt-as-rasta
             {:lib/type "mbql/query"
              :database (db-name)
              :stages   [{:lib/type     "mbql.stage/mbql"
                          :source-table (mt/id :venues)
                          :joins        [{:lib/type   "mbql/join"
                                          :alias      "j"
                                          :stages     [{:lib/type     "mbql.stage/mbql"
                                                        :source-table (:id other-tbl)}]
                                          :conditions [["=" {}
                                                        ["field" {} (mt/id :venues :id)]
                                                        ["field" {} (mt/id :venues :id)]]]}]}]}))
          (is (not (contains? (set (map second @checked)) (:id other-tbl)))
              (str "query-check must never see the foreign table id " (:id other-tbl)
                   "; it was called with " (pr-str @checked))))))))

(deftest numeric-field-id-for-sensitive-column-is-rejected-test
  (testing (str "a numeric field id naming a `:sensitive` column must not resolve. `metadata-spec->\n"
                "honey-sql` drops its visibility filter for by-id lookups (`active-only?` is\n"
                "`(not (or id-set name-set))`), which is right for trusted callers asking for a\n"
                "specific row and wrong for an agent-authored id — the portable dialect cannot name\n"
                "these columns at all, because they are absent from the by-name fetch.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Field sensitive {:table_id        (mt/id :venues)
                                             :name            "SSN"
                                             :base_type       :type/Text
                                             :database_type   "VARCHAR"
                                             :visibility_type "sensitive"
                                             :active          true}]
        (let [result (attempt-as-rasta
                      {:lib/type "mbql/query"
                       :database (db-name)
                       :stages   [{:lib/type     "mbql.stage/mbql"
                                   :source-table (mt/id :venues)
                                   :fields       [["field" {} (:id sensitive)]]}]})]
          (is (= :threw (:outcome result))
              "a sensitive column must not be referenceable by id")
          (is (not (re-find #"SSN" (or (:message result) "")))
              "and the rejection must not echo the column's name back"))))))

(deftest numeric-field-id-for-inactive-column-is-rejected-test
  (testing "the same holds for an inactive column, which the warehouse no longer has"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Field gone {:table_id      (mt/id :venues)
                                        :name          "DROPPED_COL"
                                        :base_type     :type/Text
                                        :database_type "VARCHAR"
                                        :active        false}]
        (let [result (attempt-as-rasta
                      {:lib/type "mbql/query"
                       :database (db-name)
                       :stages   [{:lib/type     "mbql.stage/mbql"
                                   :source-table (mt/id :venues)
                                   :fields       [["field" {} (:id gone)]]}]})]
          (is (= :threw (:outcome result))))))))

(deftest numeric-source-table-existence-is-not-an-oracle-test
  (testing (str "GHY-4410: a table the caller has no data access to must be reported exactly as one\n"
                "that does not exist. `resolve-database-id-from-first-stage` runs before any\n"
                "permission check — it is what decides which database the provider is for — so\n"
                "without a read check there, a bare `t2/select-one` answers \"exists\" for a table in\n"
                "a database the caller cannot touch, and the id argument becomes a way to enumerate\n"
                "table ids instance-wide.\n\n"
                "Note the perms have to be revoked at the DATA level: collection permissions do not\n"
                "gate warehouse tables, so `with-non-admin-groups-no-root-collection-perms` leaves\n"
                "`mi/can-read?` on a Table returning true.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Database other     {:engine :h2 :name "OtherDB-oracle-test"}
                     :model/Table    other-tbl {:db_id (:id other) :name "SECRET_TBL" :active true}]
        (perms.test-util/with-no-data-perms-for-all-users!
          ;; keep the query's own database usable so we are testing the *other* database's table,
          ;; not a blanket denial
          (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
          (let [forbidden   (attempt-as-rasta
                             {:lib/type "mbql/query"
                              :database (db-name)
                              :stages   [{:lib/type "mbql.stage/mbql" :source-table (:id other-tbl)}]})
                nonexistent (attempt-as-rasta
                             {:lib/type "mbql/query"
                              :database (db-name)
                              :stages   [{:lib/type "mbql.stage/mbql" :source-table 999999999}]})]
            (testing "both are refused"
              (is (= :threw (:outcome forbidden)))
              (is (= :threw (:outcome nonexistent))))
            (testing "and they are indistinguishable — same status, and neither names the table"
              (is (= (:status nonexistent) (:status forbidden)))
              (is (not (re-find #"SECRET_TBL" (or (:message forbidden) "")))))))))))

;;; ============================================================
;;; Follow-ups from review (crisptrutski)
;;; ============================================================

(deftest numeric-field-id-in-two-element-form-is-checked-test
  (testing (str "a numeric field id written as `[\"field\", 42]` — no options map — must be\n"
                "collected and checked like the three-element form. Repair inserts the options map\n"
                "later, so at collection time the target is still in slot 1; checking only slot 2\n"
                "let this shape reach resolution unchecked.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Field sensitive {:table_id        (mt/id :venues)
                                             :name            "SSN_TWO_SLOT"
                                             :base_type       :type/Text
                                             :database_type   "VARCHAR"
                                             :visibility_type "sensitive"
                                             :active          true}]
        (let [result (attempt-as-rasta
                      {:lib/type "mbql/query"
                       :database (db-name)
                       :stages   [{:lib/type     "mbql.stage/mbql"
                                   :source-table (mt/id :venues)
                                   :fields       [["field" (:id sensitive)]]}]})]
          (is (= :threw (:outcome result))
              "the two-element form must not slip past the referenceability check")
          (is (not (re-find #"SSN_TWO_SLOT" (or (:message result) "")))
              "and the rejection must not echo the column name"))))))

(deftest sensitive-parent-hides-its-children-test
  (testing (str "a visible child of a `:sensitive` parent must not be referenceable. A JSON column\n"
                "unfolds into children carrying their own visibility, so checking only the named\n"
                "field would let an ordinary-looking child reach inside a column the warehouse\n"
                "marked unqueryable.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Field parent {:table_id        (mt/id :venues)
                                          :name            "PAYLOAD"
                                          :base_type       :type/JSON
                                          :database_type   "JSON"
                                          :visibility_type "sensitive"
                                          :active          true}
                     :model/Field child  {:table_id      (mt/id :venues)
                                          :parent_id     (:id parent)
                                          :name          "ssn"
                                          :base_type     :type/Text
                                          :database_type "VARCHAR"
                                          :active        true}]
        (let [result (attempt-as-rasta
                      {:lib/type "mbql/query"
                       :database (db-name)
                       :stages   [{:lib/type     "mbql.stage/mbql"
                                   :source-table (mt/id :venues)
                                   :fields       [["field" {} (:id child)]]}]})]
          (is (= :threw (:outcome result))
              "a child of a sensitive parent must be refused even though the child itself is visible")
          (is (not (re-find #"PAYLOAD|ssn" (or (:message result) "")))
              "and neither the parent nor the child is named back"))))))

(deftest unreadable-and-missing-card-are-indistinguishable-test
  (testing (str "a numeric `source-card` the caller cannot read must be reported exactly as one\n"
                "that does not exist. Content ids are sequential and easy to guess, so a status-code\n"
                "difference (403 for hidden vs 400 for absent) is an existence oracle. The collapse\n"
                "lives in the read-checked store, so it covers cards, measures and segments at once.")
    (mt/with-premium-features #{}
      (unreadable-card-thunk
       (fn [victim-id]
         (let [forbidden (attempt-as-rasta
                          {:lib/type "mbql/query"
                           :database (db-name)
                           :stages   [{:lib/type "mbql.stage/mbql" :source-card victim-id}]})
               missing   (attempt-as-rasta
                          {:lib/type "mbql/query"
                           :database (db-name)
                           :stages   [{:lib/type "mbql.stage/mbql" :source-card 999999999}]})]
           (testing "both are refused"
             (is (= :threw (:outcome forbidden)))
             (is (= :threw (:outcome missing))))
           (testing "with the same status and the same error key"
             (is (= (:status missing) (:status forbidden))
                 (str "status differed: missing=" (:status missing) " forbidden=" (:status forbidden)))
             (is (= (:error missing) (:error forbidden))
                 (str "error key differed: missing=" (:error missing) " forbidden=" (:error forbidden))))))))))

(deftest readable-table-lookup-passes-a-full-row-to-can-read-test
  (testing (str "`readable-active-table-database-id` must hand `mi/can-read?` the whole Table row.\n\n"
                "`can-read?` for a Table is polymorphic over the instance: its published-collection\n"
                "branch reads `:is_published` and `:collection_id` (warehouse_schema/models/table.clj,\n"
                "via `perms/can-access-via-collection?`). Selecting only `:id`/`:db_id` — as this fn\n"
                "first did — makes that branch evaluate against absent keys, so a user whose access\n"
                "comes through a published collection is told the table does not exist. Asserting on\n"
                "the row the predicate receives pins the bug directly, without needing the EE\n"
                "implementation (OSS `can-access-via-collection?` is a constant `false`).")
    (mt/with-premium-features #{}
      (let [seen (atom nil)]
        (with-redefs [mi/can-read? (fn [row] (reset! seen row) true)]
          (metabot.db/readable-active-table-database-id (mt/id :venues)))
        (is (some? @seen) "can-read? should have been called")
        (doseq [k [:id :db_id :is_published :collection_id]]
          (is (contains? @seen k)
              (str "the row handed to can-read? is missing " k
                   ", so any permission branch reading it silently fails")))))))
