(ns metabase.funnysql.e2e-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as app-db]
   [metabase.funnysql.core :as funnysql]
   [metabase.search.appdb.core]
   [metabase.search.appdb.query :as appdb.query]
   [metabase.search.appdb.scoring :as appdb.scoring]
   [metabase.search.config :as search.config]
   [metabase.search.spec :as search.spec]
   [metabase.server.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest ^:parallel compile-session-query-test
  (is (some? (#'metabase.server.db/session-with-id-query (app-db/db-type) 100 :normal true true 200 true))))

(defn- search-ctx []
  {:archived?                           false
   :current-user-id                     (mt/user->id :rasta)
   :is-superuser?                       false
   :is-data-analyst?                    false
   :current-user-perms                  #{"/collection/root/read/"}
   :model-ancestors?                    true
   :models                              search.config/all-models
   :search-engine                       :search.engine/appdb
   :search-string                       "sales report"
   :context                             :search-app
   :filter-items-in-personal-collection "all"
   :enabled-transform-source-types      #{"table" "query"}})

(defn- search-hsql []
  (let [search-ctx (search-ctx)]
    (appdb.scoring/with-scores search-ctx
      (appdb.scoring/scorers search-ctx (zipmap search.spec/search-models (repeat 0.5)))
      (appdb.query/base-filtered-query :search_index search-ctx (:search-string search-ctx) [:legacy_input]))))

(deftest ^:parallel compile-hairball-search-query-test
  (is (some? (funnysql/format (search-hsql) (app-db/db-type)))))
