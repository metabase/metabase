(ns metabase-enterprise.search.semantic.scoring-query-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.search.semantic.scoring :as semantic.scoring]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest postgres-boolean-scores-with-mysql-app-db-test
  (mt/with-premium-features #{:content-verification :official-collections :semantic-search}
    (mt/with-dynamic-fn-redefs [mdb/db-type (constantly :mysql)
                                semantic.scoring/view-count-percentiles (constantly {})]
      (let [scorers (semantic.scoring/semantic-scorers "unused" {:search-string "orders"})]
        (doseq [[scorer column] [[:pinned "pinned"]
                                 [:official-collection "official_collection"]
                                 [:verified "verified"]]]
          (testing (name scorer)
            (is (= [(format "COALESCE(CAST(\"%s\" AS INTEGER), 0)" column)]
                   (sql/format (scorers scorer) {:quoted true})))))))))
