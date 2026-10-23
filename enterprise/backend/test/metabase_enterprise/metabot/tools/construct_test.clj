(ns metabase-enterprise.metabot.tools.construct-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase-enterprise.test :as met]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.slackbot-query :as slackbot-query]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- sandbox-query [table fields]
  (let [mp (mt/metadata-provider)]
    (lib/with-fields (lib/query mp (lib.metadata/table mp (mt/id table)))
      (mapv #(lib.metadata/field mp (mt/id table %)) fields))))

(defn- source-field-query [key-table key-column target-table]
  (let [db (t2/select-one-fn :name :model/Database (mt/id))
        field #(vector db "PUBLIC" %1 %2)]
    {:lib/type "mbql/query"
     :stages [{:lib/type "mbql.stage/mbql" :source-table [db "PUBLIC" "CHECKINS"]
               :aggregation [["count" {}]]
               :breakout [["field" {:source-field (field key-table key-column)} (field target-table "NAME")]]}]}))

(defn- assert-private-field-error! [key-table key-column target-table hidden-texts]
  (let [build! #(construct/execute-representations-query (source-field-query key-table key-column target-table))
        error (try (build!) (catch clojure.lang.ExceptionInfo e e))]
    (is (= :wrong-source-field (:error (ex-data error))))
    (doseq [hidden-text hidden-texts]
      (is (not (str/includes? (or (ex-message error) "") hidden-text)))
      (is (not (str/includes? (pr-str (ex-data error)) hidden-text))))
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
        (assert-private-field-error! "CHECKINS" "DATE" "USERS" ["USER_ID"]))
      (testing "the error does not export or confirm an authored hidden key"
        (assert-private-field-error! "CHECKINS" "USER_ID" "CATEGORIES" ["USER_ID"])))))

(deftest source-field-errors-respect-intermediate-column-sandboxes-test
  (sandbox.tu/with-gtaps! {:gtaps {:venues {:query (sandbox-query :venues [:id :name])}}}
    (doseq [table [:checkins :categories]]
      (perms/set-table-permission! &group (mt/id table) :perms/create-queries :query-builder))
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:name "Sandbox venues"}
      (assert-private-field-error! "CHECKINS" "VENUE_ID" "CATEGORIES" ["has a foreign key to"]))))

(deftest source-field-errors-respect-target-column-sandboxes-test
  (sandbox.tu/with-gtaps! {:gtaps {:categories {:query (sandbox-query :categories [:id])}}}
    (doseq [table [:checkins :venues]]
      (perms/set-table-permission! &group (mt/id table) :perms/create-queries :query-builder))
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:name "Sandbox categories"}
      (assert-private-field-error! "CHECKINS" "VENUE_ID" "CATEGORIES" ["CATEGORIES" "VENUE_ID"]))))

(deftest source-field-errors-respect-foreign-key-target-sandboxes-test
  (sandbox.tu/with-gtaps! {:gtaps {:venues {:query (sandbox-query :venues [:name :category_id])}}}
    (doseq [table [:checkins :categories]]
      (perms/set-table-permission! &group (mt/id table) :perms/create-queries :query-builder))
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:name "Sandbox venue keys"}
      (assert-private-field-error! "CHECKINS" "VENUE_ID" "CATEGORIES" ["VENUES" "has a foreign key to"]))))

(deftest construct-query-with-native-sandbox-test
  (sandbox.tu/with-gtaps! {:gtaps {:checkins {:query (lib/native-query (mt/metadata-provider) "SELECT * FROM CHECKINS")}}}
    (perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :query-builder)
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:name "Native sandbox"}
      (let [card-id (t2/select-one-fn :card_id :model/Sandbox :table_id (mt/id :checkins) :group_id (u/the-id &group))
            card-before (t2/select-one :model/Card card-id)
            snapshot #(hash-map :executions (t2/count :model/QueryExecution) :cache (t2/count :model/QueryCache))
            before (snapshot)
            build! #(construct/execute-representations-query (source-field-query "CHECKINS" "VENUE_ID" "VENUES"))
            original-execute qp.pipeline/*execute*
            warehouse (atom [])
            observe-execute (fn [& args]
                              (swap! warehouse conj {:user api/*current-user-id* :admin api/*is-superuser?*})
                              (apply original-execute args))
            control (binding [qp.pipeline/*execute* observe-execute]
                      (mt/with-dynamic-fn-redefs [construct/assert-source-fields-reach-their-tables! identity]
                        (build!)))
            card-after-control (t2/select-one :model/Card card-id)
            actual (binding [qp.pipeline/*execute* observe-execute] (build!))]
        (is (nil? (:result_metadata card-before)))
        (is (= card-before card-after-control))
        (is (map? (get-in actual [:structured-output :query])))
        (is (empty? @warehouse) "Construction must not execute warehouse SQL")
        (is (not-any? :admin @warehouse) "Construction must not execute SQL as admin")
        (is (= card-before (t2/select-one :model/Card card-id)) "Construction must not write Card metadata")
        (is (= before (snapshot)))
        (let [control-result (qp/process-query (get-in control [:structured-output :query]))
              actual-result (qp/process-query (get-in actual [:structured-output :query]))]
          (is (= :completed (:status actual-result)))
          (is (seq (mt/rows actual-result)))
          (is (= (set (mt/rows control-result)) (set (mt/rows actual-result)))))))))

(defn- count-query [table]
  {:lib/type "mbql/query"
   :stages [{:lib/type "mbql.stage/mbql"
             :source-table ["Metabot sandbox" "PUBLIC" table]
             :aggregation [["count" {}]]}]})

(defn- orders-sandbox-query []
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                (lib/> (lib.metadata/field mp (mt/id :orders :total)) 10))))

(defn- check-sandbox-attribute-error! [attributes message]
  (met/with-gtaps! {:gtaps {:venues {:query (let [mp (mt/metadata-provider)]
                                              (lib/query mp (lib.metadata/table mp (mt/id :venues))))
                                     :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                    :attributes attributes}
    (t2/update! :model/Database (mt/id) {:name "Metabot sandbox"})
    (let [query (count-query "VENUES")]
      (doseq [tool [construct/construct-notebook-query-tool
                    slackbot-query/slackbot-construct-notebook-query-tool]]
        (let [built (get-in (test-util/call-tool tool {:query query :reasoning "count venues"})
                            [:structured-output :query])]
          (is (map? built))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo message (qp/process-query built))))))))

(deftest construct-tools-allow-missing-sandbox-attribute-test
  (check-sandbox-attribute-error! {"something_random" 50} #"Query requires user attribute `cat`"))

(deftest construct-tools-preprocess-sandboxed-queries-test
  (met/with-gtaps! {:gtaps {:orders {:query (orders-sandbox-query)}}}
    (t2/update! :model/Database (mt/id) {:name "Metabot sandbox"})
    (let [compilations (atom 0)
          executions   (atom 0)
          query        (count-query "ORDERS")]
      (mt/with-dynamic-fn-redefs [qp.compile/compile-preprocessed (fn [& _]
                                                                    (swap! compilations inc)
                                                                    (throw (ex-info "Unexpected SQL compilation" {})))]
        (binding [qp.pipeline/*execute* (fn [& _]
                                          (swap! executions inc)
                                          (throw (ex-info "Unexpected query execution" {})))]
          (log.capture/with-log-messages-for-level [logs [metabase.metabot.tools.construct :warn]]
            (doseq [tool [construct/construct-notebook-query-tool
                          slackbot-query/slackbot-construct-notebook-query-tool]]
              (let [built (get-in (test-util/call-tool tool {:query query :reasoning "count orders"})
                                  [:structured-output :query])]
                (is (= 1 (lib/stage-count built)))
                (is (= (mt/id :orders) (get-in built [:stages 0 :source-table])))))
            (is (empty? (logs)))))
        (is (zero? @compilations))
        (is (zero? @executions))))))

(deftest construct-tools-allow-invalid-sandbox-attribute-test
  (check-sandbox-attribute-error! {"cat" "a"} #"User attribute `cat` value `a` cannot be coerced"))

(deftest construct-tools-load-native-sandbox-metadata-test
  (doseq [tool [construct/construct-notebook-query-tool
                slackbot-query/slackbot-construct-notebook-query-tool]]
    (met/with-gtaps! {:gtaps {:venues {:query (lib/native-query
                                               (mt/metadata-provider)
                                               "SELECT ID, NAME, CATEGORY_ID, PRICE FROM VENUES WHERE PRICE = 1")}}}
      (t2/update! :model/Database (mt/id) {:name "Metabot sandbox"})
      (let [card-id    (t2/select-one-fn :card_id :model/Sandbox :table_id (mt/id :venues))
            executions (atom 0)
            execute    qp.pipeline/*execute*
            query      (count-query "VENUES")]
        (is (nil? (t2/select-one-fn :result_metadata :model/Card :id card-id)))
        (binding [qp.pipeline/*execute* (fn [driver query respond]
                                          (swap! executions inc)
                                          (execute driver query respond))]
          (doseq [expected-executions [1 0]]
            (reset! executions 0)
            (is (map? (get-in (test-util/call-tool tool {:query query :reasoning "count venues"})
                              [:structured-output :query])))
            (is (= expected-executions @executions))
            (is (seq (t2/select-one-fn :result_metadata :model/Card :id card-id)))))))))
