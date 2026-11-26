(ns metabase.search.appdb.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.events.audit-log]
   [metabase.events.core :as events]
   [metabase.search.appdb.core]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.engine :as search.engine]
   [metabase.search.test-util :as search.tu]
   [metabase.search.util :as search.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment metabase.audit-app.events.audit-log/keep-me)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest metabot-keyword-queries-match-any-query-and-every-word-in-each-test
  (when (= :postgres (mdb/db-type))
    (testing "[\"orders\" \"monthly revenue\"] searches for orders, or monthly and revenue together, with no prefix"
      (let [[folded] (search.engine/disjunction :search.engine/appdb ["orders" "monthly revenue"])
            expr     (search.util/to-tsquery-expr folded {:context :metabot, :language "english"})
            ;; Postgres parses it as a search would, under the simple configuration, which stems nothing.
            parsed   (mdb/query {:select [[[:to_tsquery [:literal "simple"] [:lift expr]] :query]]})]
        (is (= "'orders' | 'monthly' & 'revenue'"
               (str (:query (first parsed)))))))))

(deftest postgres-search-passes-its-context-and-language-to-the-tsquery-test
  (let [lifted (fn [language search-ctx]
                 (mt/with-temporary-setting-values [search-language language]
                   (some #(when (and (vector? %) (= :lift (first %))) (second %))
                         (tree-seq coll? seq ((get-method specialization/base-query :postgres)
                                              :search_index "order" search-ctx [:model_id])))))]
    (testing "Metabot matches whole words under a stemming language, and prefixes them under simple"
      (is (= "'order'" (lifted "english" {:context :metabot})))
      (is (= "'order':*" (lifted "simple" {:context :metabot}))))
    (testing "Other searches match the last word as a prefix"
      (is (= "'order':*" (lifted "english" {:context :search-app}))))))

(deftest locale-change-reindexes-after-commit-test
  (when (contains? #{:mysql :postgres} (mdb/db-type))
    (let [reindex-connectable (promise)]
      (with-redefs [search.engine/reindex! (fn [& _] (deliver reindex-connectable t2.conn/*current-connectable*))]
        (t2/with-transaction [_conn]
          (events/publish-event! :event/setting-update {:details {:key :site-locale}})
          (is (not (realized? reindex-connectable))))
        (is (nil? (deref reindex-connectable 5000 ::timed-out)))))))

(deftest locale-change-rebuilds-the-index-in-the-new-language-test
  (when (= :postgres (mdb/db-type))
    (search.tu/with-temp-index-table
      (mt/with-temp [:model/Card _ {:name "Häuser"}]
        (search.engine/reindex! :search.engine/appdb {:in-place? true})
        (let [english-index (search.index/active-table)]
          (is (empty? (search.index/search "haus")))
          (mt/with-temporary-setting-values [site-locale "de"]
            (is (not= english-index (search.index/active-table)))
            (is (= [["card" "Häuser"]] (search.index/search "haus")))))))))
