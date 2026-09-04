(ns metabase.metabot.tools.construct-numeric-permissions-test
  "Permission-boundary tests for the numeric-id dialect (GHY-4410).

  `construct_representations_test` runs against a mock metadata provider with `api/read-check`
  and `api/query-check` stubbed to allow-all, which is right for testing resolution but cannot
  observe enforcement. These tests use a real application database and a real unprivileged user,
  so a missing check shows up as a leak rather than as a passing stub.

  The invariant under test: on the numeric-id surface, naming a card the caller cannot read must
  fail closed, and must not report anything about that card — including its column names."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.models.serialization.resolve :as serdes.resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- unreadable-card-thunk
  "Run `f` with a card in crowberto's personal collection — which rasta cannot read — bound to
  its id. The card carries a named expression and an aggregation so a column-name leak is
  unmistakable in the assertion."
  [f]
  (let [victim-coll-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))]
    (mt/with-temp [:model/Card victim {:collection_id victim-coll-id
                                       :database_id   (mt/id)
                                       :dataset_query (mt/mbql-query venues
                                                        {:expressions {"SecretMargin" [:* $price 3]}
                                                         :aggregation [[:count]]
                                                         :breakout    [$category_id [:expression "SecretMargin"]]})}]
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
        (do (construct/execute-representations-query query)
            {:outcome :resolved})
        (catch clojure.lang.ExceptionInfo e
          {:outcome   :threw
           :status    (:status-code (ex-data e))
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
           (is (= 403 (:status result))
               "the denial is a permission error, not a repair error")
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
           (is (= 403 (:status result)))
           (is (nil? (:available result)))))))))

(deftest numeric-source-card-readable-resolves-through-the-store-test
  (testing (str "the check is not over-broad: a card the caller CAN read resolves through the same\n"
                "read-checked store that denies an unreadable one.\n\n"
                "Asserted at the store/resolver layer rather than end-to-end: the full pipeline call\n"
                "chain plus `mu/defn` instrumentation puts `permissions.util/PathSchema` — a nested-\n"
                "quantifier regex, `^/(<char>*/)*$` — deep enough on the stack to overflow it on the\n"
                "SUCCESS path. That is pre-existing and unrelated to this fix (a plain `read-check`\n"
                "on the same card outside the pipeline succeeds), so this pins the behavior that\n"
                "matters here without depending on it.")
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card readable {:collection_id nil
                                           :database_id   (mt/id)
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
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
             (is (thrown? clojure.lang.ExceptionInfo
                          (resolve.mp/card-by-id shared.content-store/default-store victim-id))
                 "an unreadable card must be denied by the store"))))))))
