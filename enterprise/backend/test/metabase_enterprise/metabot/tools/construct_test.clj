(ns metabase-enterprise.metabot.tools.construct-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.tools.construct :as construct]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sandbox-query [table fields]
  (let [mp (mt/metadata-provider)]
    (lib/with-fields (lib/query mp (lib.metadata/table mp (mt/id table)))
      (mapv #(lib.metadata/field mp (mt/id table %)) fields))))

(defn- assert-private-field-error! [key-table key-column target-table hidden-text]
  (let [db (t2/select-one-fn :name :model/Database (mt/id))
        build! #(construct/execute-representations-query
                 {:lib/type "mbql/query"
                  :stages [{:lib/type "mbql.stage/mbql" :source-table [db "PUBLIC" "CHECKINS"]
                            :aggregation [["count" {}]]
                            :breakout [["field" {:source-field [db "PUBLIC" key-table key-column]}
                                        [db "PUBLIC" target-table "NAME"]]]}]})
        error (try (build!) (catch clojure.lang.ExceptionInfo e e))]
    (is (= :wrong-source-field (:error (ex-data error))))
    (is (not (str/includes? (or (ex-message error) "") hidden-text)))
    (is (not (str/includes? (pr-str (ex-data error)) hidden-text)))
    (mt/with-dynamic-fn-redefs [construct/assert-source-fields-reach-their-tables! identity]
      (let [query (get-in (build!) [:structured-output :query])]
        (is (map? query))
        (is (thrown? Exception (qp/process-query query)))))))

(deftest source-field-errors-respect-column-sandboxes-test
  (sandbox.tu/with-gtaps! {:gtaps {:checkins {:query (sandbox-query :checkins [:id :date])}}}
    (doseq [table [:users :categories]]
      (perms/set-table-permission! &group (mt/id table) :perms/create-queries :query-builder))
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:name "Sandbox check-ins"}
      (let [table-id (mt/id :checkins)
            allowed (get (metabot.perms/sandbox-restricted-fields #{table-id}) table-id)]
        (is (= #{(mt/id :checkins :id) (mt/id :checkins :date)} allowed))
        (is (= #{table-id (mt/id :users)} (metabot.perms/queryable-table-ids #{table-id (mt/id :users)}))))
      (testing "the direct hint never names a hidden candidate key"
        (assert-private-field-error! "CHECKINS" "DATE" "USERS" "USER_ID"))
      (testing "the error does not export or confirm an authored hidden key"
        (assert-private-field-error! "CHECKINS" "USER_ID" "CATEGORIES" "USER_ID")))))

(deftest source-field-errors-respect-intermediate-column-sandboxes-test
  (sandbox.tu/with-gtaps! {:gtaps {:venues {:query (sandbox-query :venues [:id :name])}}}
    (doseq [table [:checkins :categories]]
      (perms/set-table-permission! &group (mt/id table) :perms/create-queries :query-builder))
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:name "Sandbox venues"}
      (assert-private-field-error! "CHECKINS" "VENUE_ID" "CATEGORIES" "has a foreign key to"))))
