(ns metabase.metabot.tools.resources-test
  "Tests for read_resource tool."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.transforms.core :as transforms.core]
   [toucan2.core :as t2]))

(deftest parse-uri-test
  (testing "parses single-segment URIs (top-level lists)"
    (is (= {:segments ["databases"] :query-params nil}
           (#'read-resource/parse-uri "metabase://databases")))
    (is (= {:segments ["collections"] :query-params nil}
           (#'read-resource/parse-uri "metabase://collections"))))
  (testing "parses entity URIs into [type id] segments"
    (is (= {:segments ["table" "123"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123")))
    (is (= {:segments ["model" "456"] :query-params nil}
           (#'read-resource/parse-uri "metabase://model/456")))
    (is (= {:segments ["question" "456"] :query-params nil}
           (#'read-resource/parse-uri "metabase://question/456"))))
  (testing "parses entity sub-resources"
    (is (= {:segments ["table" "123" "fields"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123/fields")))
    (is (= {:segments ["table" "123" "fields" "456"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123/fields/456")))
    (is (= {:segments ["metric" "789" "dimensions"] :query-params nil}
           (#'read-resource/parse-uri "metabase://metric/789/dimensions"))))
  (testing "parses field IDs that contain slashes (e.g. c75/17)"
    (is (= {:segments ["table" "123" "fields" "c75" "17"] :query-params nil}
           (#'read-resource/parse-uri "metabase://table/123/fields/c75/17"))))
  (testing "parses deep paths"
    (is (= {:segments ["database" "1" "schemas" "PUBLIC" "tables"] :query-params nil}
           (#'read-resource/parse-uri "metabase://database/1/schemas/PUBLIC/tables"))))
  (testing "parses query strings into :query-params"
    (is (= {:tree "true"}
           (:query-params (#'read-resource/parse-uri "metabase://collections?tree=true"))))
    (is (= {:tree "true" :foo "bar"}
           (:query-params (#'read-resource/parse-uri "metabase://collections?tree=true&foo=bar")))))
  (testing "parses user URIs"
    (is (= {:segments ["user" "recent-items"] :query-params nil}
           (#'read-resource/parse-uri "metabase://user/recent-items"))))
  (testing "rejects invalid scheme"
    (is (thrown? Exception
                 (#'read-resource/parse-uri "https://example.com"))))
  (testing "rejects empty path"
    (is (thrown? Exception
                 (#'read-resource/parse-uri "metabase://"))))
  (testing "URL-decodes path segments — schema names containing '/' round-trip"
    ;; An encoded URI like /schemas/weird%2Fname/tables splits into 5 segments,
    ;; with the schema segment decoded back to its literal form (containing '/').
    (let [parsed (#'read-resource/parse-uri "metabase://database/1/schemas/weird%2Fname/tables")]
      (is (= ["database" "1" "schemas" "weird/name" "tables"] (:segments parsed))))
    (testing "round-trips through metabase-uri"
      (let [uri    (llm-shape/metabase-uri :database 1 "schemas" "weird/name" "tables")
            parsed (#'read-resource/parse-uri uri)]
        (is (= "metabase://database/1/schemas/weird%2Fname/tables" uri))
        (is (= ["database" "1" "schemas" "weird/name" "tables"] (:segments parsed)))))))

(deftest read-resource-validation-test
  (testing "rejects too many URIs"
    (let [uris (vec (repeat 10 "metabase://table/123"))]
      (is (thrown-with-msg? Exception #"Too many URIs"
                            (read-resource/read-resource {:uris uris}))))))

;; ===== Dispatch routing — every URI pattern routes to the expected handler =====

(def ^:private dispatch-cases
  "Each row: [uri expected-handler-tag expected-handler-args]. Adding a new URI pattern
   to the dispatch should mean adding one row here. Args are positional and string-typed
   the way the dispatch passes them to the handler."
  [;; ----- Top-level navigation -----
   ["metabase://databases"                                 :databases-list             [nil]]
   ["metabase://databases?page=2"                          :databases-list             [{:page "2"}]]
   ["metabase://collections"                               :collections-list           [nil]]
   ["metabase://collections?tree=true"                     :collections-list           [{:tree "true"}]]
   ["metabase://collections?tree=true&foo=bar"             :collections-list           [{:tree "true" :foo "bar"}]]
   ["metabase://collections?page=2"                        :collections-list           [{:page "2"}]]
   ["metabase://user/recent-items"                         :user-recents               []]
   ;; ----- Database drill-down -----
   ["metabase://database/1"                                :database                   ["1"]]
   ["metabase://database/1/tables"                         :database-tables            ["1" nil]]
   ["metabase://database/1/tables?page=2"                  :database-tables            ["1" {:page "2"}]]
   ["metabase://database/1/models"                         :database-models            ["1" nil]]
   ["metabase://database/1/schemas"                        :database-schemas           ["1" nil]]
   ["metabase://database/1/schemas/PUBLIC/tables"          :database-schema-tables     ["1" "PUBLIC" nil]]
   ["metabase://database/1/schemas/lower_case/tables"      :database-schema-tables     ["1" "lower_case" nil]]
   ;; ----- Collection drill-down -----
   ["metabase://collection/2"                              :collection                 ["2"]]
   ["metabase://collection/2/items"                        :collection-items           ["2" nil]]
   ["metabase://collection/2/items?page=3"                 :collection-items           ["2" {:page "3"}]]
   ["metabase://collection/2/subcollections"               :collection-subcollections  ["2" nil]]
   ;; ----- Table -----
   ["metabase://table/3"                                   :table                      ["3"]]
   ["metabase://table/3/fields"                            :table-fields               ["3"]]
   ["metabase://table/3/fields/42"                         :table-field                ["3" "42"]]
   ["metabase://table/3/fields/c75/17"                     :table-field                ["3" "c75/17"]]
   ["metabase://table/3/derived"                           :table-derived              ["3" nil]]
   ;; ----- Model (a card type) -----
   ["metabase://model/4"                                   :card                       ["model" "4"]]
   ["metabase://model/4/fields"                            :card-fields                ["model" "4"]]
   ["metabase://model/4/fields/99"                         :card-field                 ["model" "4" "99"]]
   ["metabase://model/4/fields/c75/17"                     :card-field                 ["model" "4" "c75/17"]]
   ["metabase://model/4/sources"                           :card-sources               ["4"]]
   ;; ----- Question (a card type) -----
   ["metabase://question/5"                                :card                       ["question" "5"]]
   ["metabase://question/5/fields"                         :card-fields                ["question" "5"]]
   ["metabase://question/5/fields/99"                      :card-field                 ["question" "5" "99"]]
   ["metabase://question/5/sources"                        :card-sources               ["5"]]
   ;; ----- Metric -----
   ["metabase://metric/6"                                  :metric                     ["6"]]
   ["metabase://metric/6/dimensions"                       :metric-dimensions          ["6"]]
   ["metabase://metric/6/dimensions/dim-1"                 :metric-dimension           ["6" "dim-1"]]
   ;; ----- Transform -----
   ["metabase://transform/7"                               :transform                  ["7"]]
   ["metabase://transform/7/sources"                       :transform-sources          ["7"]]
   ["metabase://transform/7/target"                        :transform-target           ["7"]]
   ;; ----- Dashboard -----
   ["metabase://dashboard/8"                               :dashboard                  ["8"]]
   ["metabase://dashboard/8/items"                         :dashboard-items            ["8" nil]]
   ["metabase://dashboard/8/items?page=2"                  :dashboard-items            ["8" {:page "2"}]]])

(deftest dispatch-routing-test
  (testing "every supported URI pattern routes to the expected handler with the expected args"
    (let [calls (atom nil)
          spy   (fn [tag] (fn [& args] (reset! calls [tag (vec args)]) :spied))]
      (with-redefs [read-resource/fetch-databases-list             (spy :databases-list)
                    read-resource/fetch-collections-list           (spy :collections-list)
                    read-resource/fetch-user-recents               (spy :user-recents)
                    read-resource/fetch-database                   (spy :database)
                    read-resource/fetch-database-tables            (spy :database-tables)
                    read-resource/fetch-database-models            (spy :database-models)
                    read-resource/fetch-database-schemas           (spy :database-schemas)
                    read-resource/fetch-database-schema-tables     (spy :database-schema-tables)
                    read-resource/fetch-collection                 (spy :collection)
                    read-resource/fetch-collection-items           (spy :collection-items)
                    read-resource/fetch-collection-subcollections  (spy :collection-subcollections)
                    read-resource/fetch-table                      (spy :table)
                    read-resource/fetch-table-fields               (spy :table-fields)
                    read-resource/fetch-table-field                (spy :table-field)
                    read-resource/fetch-table-derived              (spy :table-derived)
                    read-resource/fetch-card                       (spy :card)
                    read-resource/fetch-card-fields                (spy :card-fields)
                    read-resource/fetch-card-field                 (spy :card-field)
                    read-resource/fetch-card-sources               (spy :card-sources)
                    read-resource/fetch-metric                     (spy :metric)
                    read-resource/fetch-metric-dimensions          (spy :metric-dimensions)
                    read-resource/fetch-metric-dimension           (spy :metric-dimension)
                    read-resource/fetch-transform                  (spy :transform)
                    read-resource/fetch-transform-sources          (spy :transform-sources)
                    read-resource/fetch-transform-target           (spy :transform-target)
                    read-resource/fetch-dashboard                  (spy :dashboard)
                    read-resource/fetch-dashboard-items            (spy :dashboard-items)]
        (doseq [[uri expected-handler expected-args] dispatch-cases]
          (testing uri
            (reset! calls nil)
            (#'read-resource/dispatch uri)
            (is (= [expected-handler expected-args] @calls))))))))

(deftest dispatch-rejects-unknown-uri-test
  (testing "unknown top-level resource type throws"
    (is (thrown-with-msg? Exception #"Unsupported URI"
                          (#'read-resource/dispatch "metabase://nonsense/1"))))
  (testing "known type with unknown sub-resource throws"
    (is (thrown-with-msg? Exception #"Unsupported URI"
                          (#'read-resource/dispatch "metabase://table/1/nonsense"))))
  (testing "deep path that doesn't match any pattern throws"
    (is (thrown-with-msg? Exception #"Unsupported URI"
                          (#'read-resource/dispatch "metabase://database/1/schemas/PUBLIC/cards"))))
  (testing "extra-deep collection path throws"
    (is (thrown-with-msg? Exception #"Unsupported URI"
                          (#'read-resource/dispatch "metabase://collection/1/items/extra"))))
  (testing "user URI with unknown sub throws"
    (is (thrown-with-msg? Exception #"Unsupported URI"
                          (#'read-resource/dispatch "metabase://user/bookmarks"))))
  (testing "non-metabase scheme throws via parse-uri"
    (is (thrown? Exception
                 (#'read-resource/dispatch "https://example.com")))))

(comment
  (mt/with-current-user (mt/user->id :crowberto)
    (read-resource/read-resource
     {:uris [(str "metabase://table/" 1)]})))

(deftest read-table-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id :name "Test Table"}]
        (testing "fetches basic table info"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://table/" table-id)]}))))
        (testing "fetches table with fields"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://table/" table-id "/fields")]}))))
        (testing "handles multiple URIs"
          (is (=? {:resources [{:content {:structured-output map?}}
                               {:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://table/" table-id)
                           (str "metabase://table/" table-id "/fields")]}))))
        (testing "returns errors for invalid URIs"
          (is (=? {:resources [{:error string?}]}
                  (read-resource/read-resource
                   {:uris ["metabase://table/99999"]}))))))))

(deftest read-dashboard-resource-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dashboard-id :id dashboard-name :name}
                   {:name "Sales Overview"}]
      (testing "fetches dashboard info"
        (let [result (read-resource/read-resource {:uris [(str "metabase://dashboard/" dashboard-id)]})]
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  result))
          (is (str/includes? (:output result) dashboard-name))))
      (testing "rejects sub-resources"
        (is (=? {:resources [{:error string?}]}
                (read-resource/read-resource {:uris [(str "metabase://dashboard/" dashboard-id "/cards")]}))))
      (testing "returns error for unknown dashboard"
        (is (=? {:resources [{:error string?}]}
                (read-resource/read-resource {:uris ["metabase://dashboard/99999"]})))))))

(deftest read-transform-resource-test
  (mt/with-premium-features #{:transforms}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Transform {transform-id :id transform-name :name}
                     {:name   "Gadget Products"
                      :source {:type  "query"
                               :query (lib/native-query (mt/metadata-provider)
                                                        "SELECT * FROM products WHERE category = 'Gadget'")}}]
        (testing "fetches transform info"
          (let [result (read-resource/read-resource {:uris [(str "metabase://transform/" transform-id)]})]
            (is (=? {:resources [{:content {:structured-output map?}}]}
                    result))
            (is (str/includes? (:output result) transform-name))))
        (testing "rejects sub-resources"
          (is (=? {:resources [{:error string?}]}
                  (read-resource/read-resource {:uris [(str "metabase://transform/" transform-id "/fields")]}))))
        (testing "returns error for unknown transform"
          (is (=? {:resources [{:error string?}]}
                  (read-resource/read-resource {:uris ["metabase://transform/99999"]}))))))))

;; ===== Permission coverage — every branch =====
;;
;; Two patterns:
;;   1. Single-entity reads (and their sub-resources) call `api/read-check` first, which
;;      throws when `mi/can-read?` returns false. The handler should error out.
;;   2. List handlers run `(filter mi/can-read?)` over their results. Items the user
;;      can't read should silently disappear from the output.
;;
;; Strategy: stub `mi/can-read?` and assert the corresponding response shape.

(defn- error?
  "Whether a read-resource response carries an error for its first URI."
  [result]
  (some? (-> result :resources first :error)))

(deftest read-check-throws-on-missing-perm-test
  (testing "every single-entity URI errors when user lacks read perms on the entity"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database   {db-id :id}     {}
                     :model/Table      {table-id :id}  {:db_id db-id :active true :schema "PUBLIC"}
                     :model/Card       {model-id :id}  {:type :model :database_id db-id}
                     :model/Card       {q-id :id}      {:type :question :database_id db-id}
                     :model/Card       {metric-id :id} {:type :metric :database_id db-id}
                     :model/Collection {coll-id :id}   {}
                     :model/Dashboard  {dash-id :id}   {}]
        (let [uris [;; Database family — api/read-check on the DB
                    (str "metabase://database/" db-id)
                    (str "metabase://database/" db-id "/tables")
                    (str "metabase://database/" db-id "/models")
                    (str "metabase://database/" db-id "/schemas")
                    (str "metabase://database/" db-id "/schemas/PUBLIC/tables")
                    ;; Collection family — api/read-check on the Collection
                    (str "metabase://collection/" coll-id)
                    (str "metabase://collection/" coll-id "/items")
                    (str "metabase://collection/" coll-id "/subcollections")
                    ;; Table family — api/read-check via metabot.tools.util/get-table
                    (str "metabase://table/" table-id)
                    (str "metabase://table/" table-id "/fields")
                    (str "metabase://table/" table-id "/fields/42")
                    (str "metabase://table/" table-id "/derived")
                    ;; Card (model) — api/read-check via get-card
                    (str "metabase://model/" model-id)
                    (str "metabase://model/" model-id "/fields")
                    (str "metabase://model/" model-id "/fields/42")
                    (str "metabase://model/" model-id "/sources")
                    ;; Card (question)
                    (str "metabase://question/" q-id)
                    (str "metabase://question/" q-id "/fields")
                    (str "metabase://question/" q-id "/fields/42")
                    (str "metabase://question/" q-id "/sources")
                    ;; Metric — api/read-check via get-card
                    (str "metabase://metric/" metric-id)
                    (str "metabase://metric/" metric-id "/dimensions")
                    (str "metabase://metric/" metric-id "/dimensions/42")
                    ;; Dashboard — api/read-check via get-dashboard-details
                    (str "metabase://dashboard/" dash-id)
                    (str "metabase://dashboard/" dash-id "/items")]]
          (with-redefs [mi/can-read? (constantly false)]
            (doseq [uri uris]
              (testing uri
                (is (error? (read-resource/read-resource {:uris [uri]}))
                    (str uri " should return an :error response when user lacks read perms"))))))))))

(deftest read-check-throws-on-missing-perm-transform-test
  (testing "transform URIs error when the transform itself is unreadable"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:name   "Permission test transform"
                        :source {:type  "query"
                                 :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
          (with-redefs [mi/can-read? (constantly false)]
            (doseq [uri [(str "metabase://transform/" transform-id)
                         (str "metabase://transform/" transform-id "/sources")
                         (str "metabase://transform/" transform-id "/target")]]
              (testing uri
                (is (error? (read-resource/read-resource {:uris [uri]}))
                    (str uri " should return an :error response when user can't read transform"))))))))))

(deftest list-filters-databases-by-can-read-test
  (testing "metabase://databases hides DBs the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database _              {:name "VISIBLE-DB"}
                     :model/Database {hidden-id :id} {:name "HIDDEN-DB"}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (= hidden-id (:id instance)) false (orig instance)))
                                       ([model id]
                                        (if (= hidden-id id) false (orig model id))))]
            (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://databases"]})]
              (is (str/includes? output "VISIBLE-DB"))
              (is (not (str/includes? output "HIDDEN-DB"))
                  "unreadable database must not appear in the list"))))))))

(deftest list-filters-collections-by-can-read-test
  (testing "metabase://collections hides collections the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection _              {:name "VISIBLE-COLL" :location "/"}
                     :model/Collection {hidden-id :id} {:name "HIDDEN-COLL"  :location "/"}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (= hidden-id (:id instance)) false (orig instance)))
                                       ([model id]
                                        (if (= hidden-id id) false (orig model id))))]
            (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://collections"]})]
              (is (str/includes? output "VISIBLE-COLL"))
              (is (not (str/includes? output "HIDDEN-COLL"))
                  "unreadable collection must not appear in the list"))))))))

(deftest list-filters-collection-items-by-can-read-test
  (testing "metabase://collection/{id}/items hides individual items the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {coll-id :id}    {:name "Mixed Coll" :location "/"}
                     :model/Card       _                 {:name "VISIBLE-CARD" :collection_id coll-id}
                     :model/Card       {hidden-card :id} {:name "HIDDEN-CARD"  :collection_id coll-id}
                     :model/Dashboard  _                 {:name "VISIBLE-DASH" :collection_id coll-id}
                     :model/Dashboard  {hidden-dash :id} {:name "HIDDEN-DASH"  :collection_id coll-id}]
        (let [orig         mi/can-read?
              hidden-cards #{hidden-card}
              hidden-dashes #{hidden-dash}]
          (with-redefs [mi/can-read?
                        (fn
                          ([instance]
                           (cond
                             (and (= :model/Card      (t2/model instance)) (hidden-cards (:id instance))) false
                             (and (= :model/Dashboard (t2/model instance)) (hidden-dashes (:id instance))) false
                             :else (orig instance)))
                          ([model id] (orig model id)))]
            (let [{:keys [output]} (read-resource/read-resource
                                    {:uris [(str "metabase://collection/" coll-id "/items")]})]
              (is (str/includes? output "VISIBLE-CARD"))
              (is (str/includes? output "VISIBLE-DASH"))
              (is (not (str/includes? output "HIDDEN-CARD"))
                  "unreadable card must not appear in collection items")
              (is (not (str/includes? output "HIDDEN-DASH"))
                  "unreadable dashboard must not appear in collection items"))))))))

(deftest list-filters-database-tables-by-can-read-test
  (testing "metabase://database/{id}/tables hides tables the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id}     {}
                     :model/Table    _               {:db_id db-id :name "VISIBLE-TBL" :active true}
                     :model/Table    {hidden-tbl :id} {:db_id db-id :name "HIDDEN-TBL"  :active true}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (and (= :model/Table (t2/model instance))
                                                 (= hidden-tbl (:id instance)))
                                          false
                                          (orig instance)))
                                       ([model id] (orig model id)))]
            (let [{:keys [output]} (read-resource/read-resource
                                    {:uris [(str "metabase://database/" db-id "/tables")]})]
              (is (str/includes? output "VISIBLE-TBL"))
              (is (not (str/includes? output "HIDDEN-TBL"))
                  "unreadable table must not appear in the database tables list"))))))))

(deftest list-filters-dashboard-items-by-can-read-test
  (testing "metabase://dashboard/{id}/items hides cards the user can't read"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard     {dash-id :id}      {}
                     :model/Card          {visible-card :id} {:name "VISIBLE-DASHCARD"}
                     :model/Card          {hidden-card :id}  {:name "HIDDEN-DASHCARD"}
                     :model/DashboardCard _                  {:dashboard_id dash-id :card_id visible-card}
                     :model/DashboardCard _                  {:dashboard_id dash-id :card_id hidden-card}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (and (= :model/Card (t2/model instance))
                                                 (= hidden-card (:id instance)))
                                          false
                                          (orig instance)))
                                       ([model id] (orig model id)))]
            (let [{:keys [output]} (read-resource/read-resource
                                    {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
              (is (str/includes? output "VISIBLE-DASHCARD"))
              (is (not (str/includes? output "HIDDEN-DASHCARD"))
                  "unreadable card must not appear in dashboard items"))))))))

(deftest read-transform-target-authorization-test
  (testing "fetch-transform-target gates the target table by mi/can-read?"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {target-id :id :as target-table}
                     {:db_id db-id :name "TARGET-TABLE" :schema "PUBLIC" :active true}]
        (let [stub-transform {:id                 999
                              :name               "Stub Transform"
                              :source_database_id db-id
                              :target_db_id       db-id
                              :table              target-table}]
          (testing "when user CAN read the target, it appears in the output"
            (with-redefs [transforms.core/get-transform (constantly stub-transform)]
              (let [{:keys [output]} (read-resource/read-resource
                                      {:uris ["metabase://transform/999/target"]})]
                (is (str/includes? output "TARGET-TABLE")
                    "target table name should appear when user has read perms")
                (is (str/includes? output (str "uri=\"metabase://table/" target-id "\""))
                    "target table URI should appear when user has read perms"))))
          (testing "when user CANNOT read the target, it's filtered out"
            (with-redefs [transforms.core/get-transform (constantly stub-transform)
                          mi/can-read? (constantly false)]
              (let [{:keys [output]} (read-resource/read-resource
                                      {:uris ["metabase://transform/999/target"]})]
                (is (not (str/includes? output "TARGET-TABLE"))
                    "target table name must NOT appear when user lacks read perms")
                (is (not (str/includes? output (str "uri=\"metabase://table/" target-id "\"")))
                    "target table URI must NOT appear when user lacks read perms")
                ;; The target *database* URI is still surfaced — that's intentional, the
                ;; URI carries no extra metadata and any read_resource call on it will
                ;; enforce its own auth.
                (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))
                    "target database URI is informational and remains visible")))))))))

(deftest read-databases-list-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:name "Test DB"}]
      (testing "metabase://databases returns the database with its drill-in URI"
        (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://databases"]})]
          (is (str/includes? output "Test DB"))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))))))))

(deftest read-database-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {t-id :id} {:db_id db-id :name "ORDERS" :active true}]
      (testing "metabase://database/{id}/tables lists tables with drill-in URIs"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://database/" db-id "/tables")]})]
          (is (str/includes? output "ORDERS"))
          (is (str/includes? output (str "uri=\"metabase://table/" t-id "\""))))))))

(deftest read-collections-and-collection-items-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Marketing" :location "/"}
                   :model/Card {card-id :id} {:name "Sales report" :collection_id coll-id}]
      (testing "metabase://collections lists root collections (excluding trash)"
        (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://collections"]})]
          (is (str/includes? output "Marketing"))))
      (testing "metabase://collection/{id}/items lists members with drill-in URIs"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://collection/" coll-id "/items")]})]
          (is (str/includes? output "Sales report"))
          (is (str/includes? output (str "uri=\"metabase://question/" card-id "\""))))))))

(deftest read-table-derived-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Card {card-id :id}
                   {:name        "Derived"
                    :type        :model
                    :database_id db-id
                    :table_id    table-id}]
      (testing "metabase://table/{id}/derived returns cards built on the table"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://table/" table-id "/derived")]})]
          (is (str/includes? output "Derived"))
          (is (str/includes? output (str "uri=\"metabase://model/" card-id "\""))))))))

(deftest read-table-derived-narrows-transforms-by-source-db-test
  (testing "transform candidates are SQL-filtered by source_database_id (no full Transform table scan)"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Database {db1 :id} {:name "DB1"}
                       :model/Database {db2 :id} {:name "DB2"}
                       :model/Table    {tbl1-id :id} {:db_id db1}
                       :model/Transform {tx-other-db :id}
                       {:name               "Other-DB Transform"
                        :source_database_id db2
                        :source             {:type "query"
                                             :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
          (testing "/derived for a table in db1 must exclude transforms whose source is in db2"
            (let [{:keys [output]} (read-resource/read-resource
                                    {:uris [(str "metabase://table/" tbl1-id "/derived")]})]
              (is (not (str/includes? output "Other-DB Transform"))
                  "transforms not sourced from this table's database must not appear")
              (is (not (str/includes? output (str "uri=\"metabase://transform/" tx-other-db "\"")))))))))))

(deftest read-card-sources-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Card {card-id :id} {:type :model :database_id db-id :table_id table-id}]
      (testing "metabase://model/{id}/sources returns the FK-resolved sources"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://model/" card-id "/sources")]})]
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))
              "should include the database URI")
          (is (str/includes? output (str "uri=\"metabase://table/" table-id "\""))
              "should include the source-table URI"))))))

(deftest read-card-sources-source-card-type-test
  (testing "source-card resolution preserves the card type — metric must not collapse to question"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id}     {}
                     :model/Table    {table-id :id}  {:db_id db-id}
                     :model/Card     {metric-id :id} {:type        :metric
                                                      :database_id db-id
                                                      :table_id    table-id}
                     :model/Card     {model-id :id}  {:type        :model
                                                      :database_id db-id
                                                      :table_id    table-id}
                     :model/Card     {q-id :id}      {:type           :question
                                                      :database_id    db-id
                                                      :table_id       table-id
                                                      :source_card_id metric-id}
                     :model/Card     {q-from-model-id :id} {:type           :question
                                                            :database_id    db-id
                                                            :table_id       table-id
                                                            :source_card_id model-id}]
        (testing "source_card_id pointing at a :metric emits a metric URI"
          (let [{:keys [output]} (read-resource/read-resource
                                  {:uris [(str "metabase://question/" q-id "/sources")]})]
            (is (str/includes? output (str "uri=\"metabase://metric/" metric-id "\""))
                "should resolve source-card of type :metric to a metric URI, not question")
            (is (not (str/includes? output (str "uri=\"metabase://question/" metric-id "\"")))
                "must NOT collapse the metric source-card to a question URI")))
        (testing "source_card_id pointing at a :model still emits a model URI (regression)"
          (let [{:keys [output]} (read-resource/read-resource
                                  {:uris [(str "metabase://question/" q-from-model-id "/sources")]})]
            (is (str/includes? output (str "uri=\"metabase://model/" model-id "\"")))))))))

(deftest read-dashboard-items-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:name "Dash card"}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (testing "metabase://dashboard/{id}/items returns cards on the dashboard"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://dashboard/" dash-id "/items")]})]
          (is (str/includes? output "Dash card"))
          (is (str/includes? output (str "uri=\"metabase://question/" card-id "\""))))))))

(deftest read-user-recents-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "metabase://user/recent-items returns a list shape (possibly empty)"
      (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://user/recent-items"]})]
        (is (str/includes? output "<list type=\"recent-items\""))))))

(deftest read-list-shape-test
  (testing "list responses carry total/page/pages/showing/truncated attrs in the rendered XML"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://databases"]})]
        (is (str/includes? output "<list type=\"databases\""))
        (is (str/includes? output "total="))
        (is (str/includes? output "page="))
        (is (str/includes? output "pages="))
        (is (str/includes? output "showing="))
        (is (str/includes? output "truncated="))))))

(deftest format-resources-test
  (testing "formats resources with content"
    (let [resources [{:uri "metabase://table/123"
                      :content {:formatted "Table details here"}}]
          formatted (#'read-resource/format-resources resources)]
      (is (str/includes? formatted "<resources>"))
      (is (str/includes? formatted "<resource uri=\"metabase://table/123\">"))
      (is (str/includes? formatted "Table details here"))
      (is (str/includes? formatted "</resource>"))
      (is (str/includes? formatted "</resources>"))))
  (testing "formats resources with errors"
    (let [resources [{:uri "metabase://table/123"
                      :error "Table not found"}]
          formatted (#'read-resource/format-resources resources)]
      (is (str/includes? formatted "**Error:** Table not found")))))

;; ===== Behavioral tests for patterns where the dispatch contract isn't enough =====

(deftest read-database-detail-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:name "Detail DB" :engine :h2}]
      (testing "metabase://database/{id} returns single-entity output with engine + uri"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id)]})]
          (is (str/includes? output "Detail DB"))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\"")))
          (is (str/includes? output "engine=\"h2\"")))))))

(deftest read-database-models-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Card     {model-id :id} {:type :model :database_id db-id :name "M-One"}
                   :model/Card     _              {:type :question :database_id db-id :name "Q-Skip"}]
      (testing "metabase://database/{id}/models lists models only (not questions)"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/models")]})]
          (is (str/includes? output "M-One"))
          (is (str/includes? output (str "uri=\"metabase://model/" model-id "\"")))
          (is (not (str/includes? output "Q-Skip"))))))))

(deftest read-database-schemas-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table _ {:db_id db-id :schema "PUBLIC"  :name "t1" :active true}
                   :model/Table _ {:db_id db-id :schema "PRIVATE" :name "t2" :active true}]
      (testing "metabase://database/{id}/schemas emits a drill-in URI per schema"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/schemas")]})]
          (is (str/includes? output "PUBLIC"))
          (is (str/includes? output "PRIVATE"))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "/schemas/PUBLIC/tables\"")))
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "/schemas/PRIVATE/tables\""))))))))

(deftest read-database-schema-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {pub-id :id} {:db_id db-id :schema "PUBLIC"  :name "PUB-TABLE"  :active true}
                   :model/Table _            {:db_id db-id :schema "PRIVATE" :name "PRIV-TABLE" :active true}]
      (testing "metabase://database/{id}/schemas/{name}/tables filters by schema"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/schemas/PUBLIC/tables")]})]
          (is (str/includes? output "PUB-TABLE"))
          (is (str/includes? output (str "uri=\"metabase://table/" pub-id "\"")))
          (is (not (str/includes? output "PRIV-TABLE"))))))))

(deftest read-database-schema-tables-with-slash-in-schema-name-test
  (testing "schema names containing '/' (which Postgres/Snowflake/etc. allow) survive URI round-trip"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {weird-id :id} {:db_id db-id :schema "weird/name" :name "WEIRD-TABLE" :active true}
                     :model/Table _              {:db_id db-id :schema "other"      :name "OTHER-TABLE" :active true}]
        (let [emitted-uri (llm-shape/metabase-uri :database db-id "schemas" "weird/name" "tables")]
          (testing "the URI builder emits an encoded segment"
            (is (str/includes? emitted-uri "weird%2Fname")))
          (testing "the encoded URI dispatches and filters to the right schema"
            (let [{:keys [output]} (read-resource/read-resource {:uris [emitted-uri]})]
              (is (str/includes? output "WEIRD-TABLE"))
              (is (str/includes? output (str "uri=\"metabase://table/" weird-id "\"")))
              (is (not (str/includes? output "OTHER-TABLE"))))))))))

(deftest read-collection-detail-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Detail Coll" :location "/"}]
      (testing "metabase://collection/{id} returns single-entity output with name + uri"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://collection/" coll-id)]})]
          (is (str/includes? output "Detail Coll"))
          (is (str/includes? output (str "uri=\"metabase://collection/" coll-id "\""))))))))

(deftest read-collection-subcollections-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/"}
                   :model/Collection {child-id :id}  {:name "Child"  :location (str "/" parent-id "/")}]
      (testing "metabase://collection/{id}/subcollections lists direct children only"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://collection/" parent-id "/subcollections")]})]
          (is (str/includes? output "Child"))
          (is (str/includes? output (str "uri=\"metabase://collection/" child-id "\"")))
          (is (not (str/includes? output "Parent"))))))))

(deftest read-collections-tree-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {parent-id :id} {:name "P" :location "/"}
                   :model/Collection _              {:name "C" :location (str "/" parent-id "/")}]
      (testing "metabase://collections?tree=true returns all collections with full path strings"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris ["metabase://collections?tree=true"]})]
          (is (str/includes? output "<list type=\"collections-tree\""))
          (is (str/includes? output "P"))
          ;; child path is rendered as "P/C" (parent name + child name)
          (is (str/includes? output "P/C")
              "child collection should carry path=\"P/C\" computed from ancestor names"))))))

(deftest read-table-field-with-slash-test
  (testing "field IDs containing slashes (e.g. composite ids c75/17) are preserved through dispatch"
    (let [calls (atom nil)]
      (with-redefs [read-resource/fetch-table-field
                    (fn [& args] (reset! calls args) {:structured-output {:result-type :metabot-entity :type :stub}})]
        (#'read-resource/dispatch "metabase://table/3/fields/c75/17")
        (is (= ["3" "c75/17"] @calls))))))

(deftest read-card-question-vs-model-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Card {q-id :id} {:type :question :database_id db-id :name "Q-card"}
                   :model/Card {m-id :id} {:type :model    :database_id db-id :name "M-card"}]
      (testing "metabase://question/{id}/sources discriminates from model"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://question/" q-id "/sources")]})]
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\"")))))
      (testing "metabase://model/{id}/sources for a model card"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://model/" m-id "/sources")]})]
          (is (str/includes? output (str "uri=\"metabase://database/" db-id "\""))))))))

(deftest read-question-resource-test
  (let [mp (mt/metadata-provider)
        query (as-> (lib/query mp (lib.metadata/table mp (mt/id :products))) $
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (m/find-first (comp #{"Category"} :display-name)
                                              (lib/breakoutable-columns $))))
        metadata (-> query
                     qp/process-query
                     :data :results_metadata :columns)]
    (mt/with-temp
      [:model/Card {question-id :id} {:name "My fav card"
                                      :dataset_query query
                                      :result_metadata metadata}]
      (mt/with-test-user :crowberto
        (let [read-result (read-resource/read-resource-tool
                           {:uris [(str "metabase://question/" question-id "/fields")]})
              output (:output read-result)
              structured (get-in read-result [:resources 0 :content :structured-output])]
          (testing "Output references expected fields"
            (is (re-find #"<name>\S*My fav card" output)))
          (testing "Structured output contains expected fields"
            (is (=? {:fields [{:display_name "Category"}
                              {:display_name "Count"}]}
                    structured))))))))

;; ===== Pagination =====

(deftest paginate-list-test
  (testing "page 1 returns first 25 items"
    (let [items (mapv (fn [i] {:id i}) (range 1 51))
          result (#'read-resource/paginate-list items nil)]
      (is (= 1 (:page result)))
      (is (= 2 (:pages result)))
      (is (= 50 (:total result)))
      (is (= 25 (count (:items result))))
      (is (= 1 (-> result :items first :id)))
      (is (= 25 (-> result :items last :id)))))
  (testing "page 2 returns second 25 items"
    (let [items (mapv (fn [i] {:id i}) (range 1 51))
          result (#'read-resource/paginate-list items "2")]
      (is (= 2 (:page result)))
      (is (= 26 (-> result :items first :id)))
      (is (= 50 (-> result :items last :id)))))
  (testing "out-of-range page throws instead of clamping"
    (let [items (mapv (fn [i] {:id i}) (range 1 11))]
      (is (thrown-with-msg? Exception #"Invalid page 999\. This list has 1 page\."
                            (#'read-resource/paginate-list items "999")))
      (is (thrown-with-msg? Exception #"Invalid page 0\. This list has 1 page\."
                            (#'read-resource/paginate-list items "0")))
      (is (thrown-with-msg? Exception #"Invalid page -3\. This list has 1 page\."
                            (#'read-resource/paginate-list items "-3")))))
  (testing "list shorter than one page"
    (let [items (mapv (fn [i] {:id i}) (range 1 6))
          result (#'read-resource/paginate-list items nil)]
      (is (= 1 (:page result)))
      (is (= 1 (:pages result)))
      (is (= 5 (:total result)))))
  (testing "empty list"
    (let [result (#'read-resource/paginate-list [] nil)]
      (is (= 1 (:page result)))
      (is (= 1 (:pages result)))
      (is (= 0 (:total result))))))

(deftest pagination-database-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}]
      (doseq [i (range 1 31)]
        (t2/insert! :model/Table {:name   (format "TABLE-%03d" i)
                                  :db_id  db-id
                                  :active true}))
      (testing "page 1 returns first 25 tables, with page/pages metadata"
        (let [result (read-resource/read-resource
                      {:uris [(str "metabase://database/" db-id "/tables")]})
              so     (get-in result [:resources 0 :content :structured-output])]
          (is (= 1 (:page so)))
          (is (= 2 (:pages so)))
          (is (= 30 (:total so)))
          (is (= 25 (count (:items so))))))
      (testing "page 2 returns remaining 5 tables"
        (let [result (read-resource/read-resource
                      {:uris [(str "metabase://database/" db-id "/tables?page=2")]})
              so     (get-in result [:resources 0 :content :structured-output])]
          (is (= 2 (:page so)))
          (is (= 5 (count (:items so))))))
      (testing "out-of-range page surfaces as a resource error, not an uncaught exception"
        (let [result (read-resource/read-resource
                      {:uris [(str "metabase://database/" db-id "/tables?page=999")]})]
          (is (=? {:resources [{:error string?}]} result)))))))

(deftest pagination-xml-output-test
  (testing "truncated list XML includes page/pages attrs and a truncation note with next-page URI hint"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (doseq [i (range 1 31)]
          (t2/insert! :model/Table {:name   (format "TBL-%03d" i)
                                    :db_id  db-id
                                    :active true}))
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/tables")]})]
          (is (str/includes? output "page=\"1\""))
          (is (str/includes? output "pages=\"2\""))
          (is (str/includes? output "truncated=\"true\""))
          (is (str/includes? output "?page=2") "truncation note should hint at next page URI"))))))

;; ===== Collection tree ordering =====

(deftest collections-tree-ordering-test
  (testing "tree mode sorts by path name, not by raw location string (which would mis-order multi-digit IDs)"
    (mt/with-current-user (mt/user->id :crowberto)
      ;; Create roots whose IDs will cause lexicographic location-sort to diverge from
      ;; alphabetical path-sort: a root with a high numeric ID gets a child whose
      ;; location (/10/) would sort before the child of a lower-ID root (/2/).
      ;; After the fix, children are sorted by their human-readable path.
      (mt/with-temp
        [:model/Collection {z-root :id} {:name "Z-Root" :location "/"}
         :model/Collection {a-root :id} {:name "A-Root" :location "/"}
         :model/Collection _ {:name "Z-Child" :location (str "/" z-root "/")}
         :model/Collection _ {:name "A-Child" :location (str "/" a-root "/")}]
        (let [result   (read-resource/read-resource {:uris ["metabase://collections?tree=true"]})
              so       (get-in result [:resources 0 :content :structured-output])
              paths    (mapv :path (:items so))]
          (testing "A-Root and its child appear before Z-Root and its child"
            (let [first-a (first (keep-indexed (fn [i p] (when (str/starts-with? p "A-Root") i)) paths))
                  first-z (first (keep-indexed (fn [i p] (when (str/starts-with? p "Z-Root") i)) paths))]
              (is (some? first-a))
              (is (some? first-z))
              (is (< first-a first-z) "A-Root subtree must come before Z-Root subtree")))
          (testing "A-Root/A-Child appears immediately after A-Root"
            (let [a-root-idx  (first (keep-indexed (fn [i p] (when (= "A-Root" p) i)) paths))
                  a-child-idx (first (keep-indexed (fn [i p] (when (= "A-Root/A-Child" p) i)) paths))]
              (is (some? a-root-idx))
              (is (some? a-child-idx))
              (is (= (inc a-root-idx) a-child-idx) "child should immediately follow its parent"))))))))
