(ns metabase.metabot.query-export-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.query-export :as query-export]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- rendered-source
  "The source query [[query-export/transform-with-exportable-source]] leaves on a transform whose
  source is `query`, or nil when it withholds it."
  [query]
  (get-in (query-export/transform-with-exportable-source {:source {:type "query" :query query}})
          [:source :query]))

(deftest transform-source-withholds-native-sql-behind-a-later-stage-test
  (testing "a native stage under an MBQL stage is still native, so a check that could not be made
           withholds it instead of printing the SQL in the unresolved fallback"
    (let [native-stage {:lib/type      :mbql.stage/native
                        :native        "SELECT * FROM {{snip}}"
                        :template-tags {"snip" {:type         :snippet
                                                :name         "snip"
                                                :display-name "snip"
                                                :snippet-id   Integer/MAX_VALUE}}}]
      (mt/with-current-user (mt/user->id :rasta)
        (doseq [stages [[native-stage] [native-stage {:lib/type :mbql.stage/mbql}]]]
          (is (nil? (rendered-source {:lib/type :mbql/query :database (mt/id) :stages stages}))
              (str (count stages) " stage(s)")))))))

(deftest transform-source-survives-a-deleted-source-database-test
  (testing "an orphaned transform keeps its source, which is what an admin repairs it from: there
           is no metadata left behind a deleted database to resolve anything against"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (t2/delete! :model/Database :id db-id)
      (mt/with-current-user (mt/user->id :crowberto)
        (is (str/includes? (str (rendered-source {:database db-id
                                                  :type     :native
                                                  :native   {:query "SELECT 1"}}))
                           "SELECT 1"))))))
