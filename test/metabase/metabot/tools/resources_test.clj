(ns metabase.metabot.tools.resources-test
  "Tests for read_resource tool."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.activity-feed.models.recent-views :as recent-views]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.shared.mbr :as mbr]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.transforms.core :as transforms.core]
   [metabase.util :as u]
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
        (is (= ["database" "1" "schemas" "weird/name" "tables"] (:segments parsed))))))
  (testing "an empty interior segment is preserved — schemaless (Mongo) tables use an empty
           schema slot, and dropping it would collapse the 6-segment table path so it matches
           no dispatch clause"
    (is (= ["database" "mydb" "schema" "" "table" "events"]
           (:segments (#'read-resource/parse-uri "metabase://database/mydb/schema//table/events"))))
    (is (= ["database" "mydb" "schema" "" "table" "events" "field" "ts"]
           (:segments (#'read-resource/parse-uri "metabase://database/mydb/schema//table/events/field/ts")))))
  (testing "a trailing slash does not add an empty edge segment"
    (is (= ["databases"] (:segments (#'read-resource/parse-uri "metabase://databases/"))))))

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
   ;; List routes take a trailing query-params arg (nil when no query string).
   ;; `?page=N` rows confirm the page param threads through to the handler.
   ["metabase://databases"                                 :databases-list             [nil]]
   ["metabase://databases?page=2"                          :databases-list             [{:page "2"}]]
   ["metabase://collections"                               :collections-list           [nil]]
   ["metabase://collections?tree=true"                     :collections-list           [{:tree "true"}]]
   ["metabase://collections?tree=true&foo=bar"             :collections-list           [{:tree "true" :foo "bar"}]]
   ["metabase://collections?page=2"                        :collections-list           [{:page "2"}]]
   ["metabase://user/recent-items"                         :user-recents               [nil]]
   ["metabase://user/recent-items?page=2"                  :user-recents               [{:page "2"}]]
   ;; ----- Database drill-down -----
   ["metabase://database/1"                                :database                   ["1"]]
   ["metabase://database/1/tables"                         :database-tables            ["1" nil]]
   ["metabase://database/1/tables?page=2"                  :database-tables            ["1" {:page "2"}]]
   ["metabase://database/1/models"                         :database-models            ["1" nil]]
   ["metabase://database/1/models?page=2"                  :database-models            ["1" {:page "2"}]]
   ["metabase://database/1/schemas"                        :database-schemas           ["1" nil]]
   ["metabase://database/1/schemas?page=2"                 :database-schemas           ["1" {:page "2"}]]
   ["metabase://database/1/schemas/PUBLIC/tables"          :database-schema-tables     ["1" "PUBLIC" nil]]
   ["metabase://database/1/schemas/PUBLIC/tables?page=2"   :database-schema-tables     ["1" "PUBLIC" {:page "2"}]]
   ["metabase://database/1/schemas/lower_case/tables"      :database-schema-tables     ["1" "lower_case" nil]]
   ;; ----- Collection drill-down -----
   ["metabase://collection/2"                              :collection                 ["2"]]
   ["metabase://collection/2/items"                        :collection-items           ["2" nil]]
   ["metabase://collection/2/items?page=2"                 :collection-items           ["2" {:page "2"}]]
   ["metabase://collection/2/subcollections"               :collection-subcollections  ["2" nil]]
   ["metabase://collection/2/subcollections?page=2"        :collection-subcollections  ["2" {:page "2"}]]
   ;; ----- Table -----
   ["metabase://table/3"                                   :table                      ["3"]]
   ["metabase://table/3/fields"                            :table-fields               ["3"]]
   ["metabase://table/3/fields/42"                         :table-field                ["3" "42"]]
   ["metabase://table/3/fields/c75/17"                     :table-field                ["3" "c75/17"]]
   ["metabase://table/3/derived"                           :table-derived              ["3" nil]]
   ["metabase://table/3/derived?page=2"                    :table-derived              ["3" {:page "2"}]]
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
   ;; ----- Measure / Segment -----
   ["metabase://measure/9"                                 :measure                    ["9"]]
   ["metabase://segment/10"                                :segment                    ["10"]]
   ;; ----- Transform -----
   ["metabase://transform/7"                               :transform                  ["7"]]
   ["metabase://transform/7/sources"                       :transform-sources          ["7" nil]]
   ["metabase://transform/7/sources?page=2"                :transform-sources          ["7" {:page "2"}]]
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
                    read-resource/fetch-measure                    (spy :measure)
                    read-resource/fetch-segment                    (spy :segment)
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
  (mt/with-premium-features #{:transforms-basic :hosting}
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

(deftest fetch-metric-missing-id-errors-test
  (testing "a non-existent metric id returns a clean :error, not a silent empty body"
    ;; fetch-metric used when-let with no else, so a missing id fell through to nil and rendered
    ;; an empty `**Error:**` instead of a 404 — every sibling handler returns an explicit 404.
    (mt/with-current-user (mt/user->id :crowberto)
      (let [result (read-resource/read-resource {:uris ["metabase://metric/999999999"]})]
        (is (error? result))
        (is (str/includes? (-> result :resources first :error) "not found"))))))

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

(deftest list-caps-items-and-reports-true-total-test
  (testing "a list with more than the cap reports the full count in :total, caps :items, and sets :truncated"
    ;; The cap is applied *before* serdes extraction (extract-readable :limit), so
    ;; only `cap` items are hydrated even when the readable set is larger. :total
    ;; must still reflect the full readable count so the agent knows to refine.
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}]
        (let [cap   @(requiring-resolve 'metabase.metabot.tools.shared.mbr/max-list-items)
              n     (+ cap 2)]
          (doseq [i (range n)]
            (t2/insert! :model/Table {:db_id db-id :name (format "TBL-%02d" i) :active true}))
          (let [result (read-resource/read-resource
                        {:uris [(str "metabase://database/" db-id "/tables")]})
                so     (get-in result [:resources 0 :content :structured-output])]
            (testing "page 1 (default) caps items, reports true total, is truncated"
              (is (= n (:total so))
                  "total must be the full readable count, not the capped item count")
              (is (= cap (count (:items so)))
                  "items must be capped at max-list-items")
              (is (= 1 (:page so)))
              (is (= 2 (:pages so)))
              (is (true? (:truncated so))
                  "truncated must be true when readable count exceeds the cap")))
          (testing "?page=2 returns the remaining items and is not truncated"
            (let [result (read-resource/read-resource
                          {:uris [(str "metabase://database/" db-id "/tables?page=2")]})
                  so     (get-in result [:resources 0 :content :structured-output])]
              (is (= n (:total so))
                  "total stays the full readable count across pages")
              (is (= (- n cap) (count (:items so)))
                  "page 2 holds only the leftover items past the cap")
              (is (= 2 (:page so)))
              (is (= 2 (:pages so)))
              (is (false? (:truncated so))
                  "the last page is not truncated")))
          (testing "an out-of-range page yields an Invalid page error, not a silent empty list"
            (let [result (read-resource/read-resource
                          {:uris [(str "metabase://database/" db-id "/tables?page=99")]})]
              (is (error? result))
              (is (str/includes? (:output result) "Invalid page 99")))))))))

(deftest collection-items-paginates-across-concatenated-models-test
  (testing "collection/{id}/items pages over the concatenated subcollections+cards stream — :total is
           the full combined count, the boundary falls mid-model, and ?page=2 returns the remainder"
    ;; Realistic case: an agent browses a big collection. The concat handler hydrates each sub-list
    ;; then paginates the combined vector via paginate-items, so the page boundary can fall mid-model.
    ;; Split cap+2 items as (cap-2) subcollections + 4 cards: page 1 = all subs + 2 cards, page 2 = 2 cards.
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database   {db-id :id}   {}
                     :model/Collection {coll-id :id} {:name "Big Coll" :location "/"}]
        (let [cap   @(requiring-resolve 'metabase.metabot.tools.shared.mbr/max-list-items)
              n-sub  (- cap 2)
              n-card 4
              total  (+ n-sub n-card)]
          (doseq [i (range n-sub)]
            (t2/insert! :model/Collection {:name (format "SUB-%02d" i) :location (str "/" coll-id "/")}))
          (doseq [i (range n-card)]
            (t2/insert! :model/Card {:name (format "CARD-%02d" i) :collection_id coll-id
                                     :database_id db-id :creator_id (mt/user->id :crowberto)
                                     :display :table :dataset_query {} :visualization_settings {}}))
          (let [p1 (-> (read-resource/read-resource {:uris [(str "metabase://collection/" coll-id "/items")]})
                       (get-in [:resources 0 :content :structured-output]))
                p2 (-> (read-resource/read-resource {:uris [(str "metabase://collection/" coll-id "/items?page=2")]})
                       (get-in [:resources 0 :content :structured-output]))]
            (testing "page 1 caps at the page size and reports the full combined total"
              (is (= total (:total p1)))
              (is (= cap (count (:items p1))))
              (is (= 1 (:page p1)))
              (is (= 2 (:pages p1)))
              (is (true? (:truncated p1))))
            (testing "page 2 holds the remainder and is the last page"
              (is (= total (:total p2)))
              (is (= (- total cap) (count (:items p2))))
              (is (= 2 (:page p2)))
              (is (false? (:truncated p2))))))))))

(deftest resolve-database-disambiguation-test
  (testing "resolve-database: numeric segment = id (always), non-numeric = name, ambiguous name throws"
    (mt/with-temp [:model/Database _             {:name "42"}
                   :model/Database {real-id :id} {:name "Sales"}
                   :model/Database {dup-a :id}   {:name "Dupe DB"}
                   :model/Database {dup-b :id}   {:name "Dupe DB"}]
      (testing "a numeric segment is ALWAYS an id — a database literally named \"42\" does not shadow id 42"
        (is (= real-id (:id (mbr/resolve-database (str real-id))))
            "numeric segment resolves the database with that id")
        (is (not= "42" (:name (mbr/resolve-database "42")))
            "the all-numeric NAME is not addressable via the shorthand (id wins deterministically)"))
      (testing "a non-numeric name resolves by name"
        (is (= real-id (:id (mbr/resolve-database "Sales")))))
      (testing "an ambiguous name throws a per-URI error naming the candidate ids"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Ambiguous database name"
                              (mbr/resolve-database "Dupe DB")))
        (let [data (try (mbr/resolve-database "Dupe DB")
                        (catch clojure.lang.ExceptionInfo e (ex-data e)))]
          (is (= (sort [dup-a dup-b]) (:matching-ids data)))))
      (testing "an unknown segment resolves to nil"
        (is (nil? (mbr/resolve-database "no-such-db-name")))))))

(deftest resolve-database-excludes-router-children-test
  (testing "a router-child (destination) database never resolves — it would read-check then extract to null"
    (mt/with-temp [:model/Database {parent-id :id} {:name "Router Parent"}
                   :model/Database {child-id :id}  {:name "Router Child" :router_database_id parent-id}]
      (is (nil? (mbr/resolve-database (str child-id))) "not by id")
      (is (nil? (mbr/resolve-database "Router Child")) "not by name")
      (is (= parent-id (:id (mbr/resolve-database "Router Parent"))) "the parent still resolves")
      (testing "and the /databases list neither counts nor shows it (no :total/:items mismatch)"
        (mt/with-current-user (mt/user->id :crowberto)
          (let [so (get-in (read-resource/read-resource {:uris ["metabase://databases"]})
                           [:resources 0 :content :structured-output])]
            (is (= (:total so) (count (:items so))))
            (is (not-any? #(= "Router Child" (:name %)) (:items so)))
            (is (some #(= "Router Parent" (:name %)) (:items so)))))))))

(deftest tables-with-duplicate-names-across-schemas-test
  (testing "two tables sharing a name in different schemas both appear (no serdes-path collision)"
    ;; extract-readable re-correlates extracted MBRs to instances by full serdes
    ;; path. A Table's leaf serdes id is its bare name, so keying on `last :id`
    ;; would collapse same-named tables across schemas into one. The full path
    ;; carries the schema, keeping them distinct.
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table _ {:db_id db-id :name "events" :schema "public"  :active true}
                     :model/Table _ {:db_id db-id :name "events" :schema "staging" :active true}]
        (let [result (read-resource/read-resource
                      {:uris [(str "metabase://database/" db-id "/tables")]})
              so     (get-in result [:resources 0 :content :structured-output])]
          (is (= 2 (:total so))
              "both same-named tables must be counted")
          (is (= 2 (count (:items so)))
              "both same-named tables must appear in items — no collision drop")
          (is (= 2 (count (distinct (:items so))))
              "the two items must be distinct tables, not the same MBR twice"))))))

(deftest schemaless-table-reachable-by-path-test
  (testing "a schemaless (nil-schema) table is reachable via the path-form URI with an empty
           schema segment — parse-uri must keep the empty segment so the 6-segment table clause
           matches and resolve-table (which treats empty schema as nil) finds it"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:name "MongoDB"}
                     :model/Table _ {:db_id db-id :name "events" :schema nil :active true}]
        (let [result (read-resource/read-resource
                      {:uris ["metabase://database/MongoDB/schema//table/events"]})
              mbr    (get-in result [:resources 0 :content :structured-output :entity])]
          (is (some? mbr) "schemaless table must resolve, not 404 with 'Unsupported URI'")
          (is (str/includes? (:output result) "events")))))))

(deftest collections-tree-includes-personal-collection-test
  (testing "a readable personal collection appears in the tree list and total == count items"
    ;; Bug A regression: extract-readable for Collection must scope via
    ;; :collection-set, not :where — the latter inherits extract-query's
    ;; `personal_owner_id IS NULL` policy filter and silently drops personal
    ;; collections the user can read, making :total > (count items).
    (mt/with-current-user (mt/user->id :crowberto)
      ;; Ensure crowberto's personal collection exists (created lazily otherwise).
      (let [personal (collection/user->personal-collection (mt/user->id :crowberto))
            result   (read-resource/read-resource {:uris ["metabase://collections?tree=true"]})
            so       (get-in result [:resources 0 :content :structured-output])
            eids     (set (keep :entity_id (:items so)))]
        (is (= (:total so) (count (:items so)))
            "no readable collection may be counted in :total yet dropped from :items")
        (is (contains? eids (:entity_id personal))
            "crowberto's readable personal collection must appear in the tree list")))))

(deftest read-personal-collection-detail-test
  (testing "a single read of the user's own personal collection returns the entity, not null"
    ;; ->mbr must scope Collection extraction via :collection-set (extract-opts) —
    ;; a raw :where would trip extract-query's `personal_owner_id IS NULL` filter
    ;; and extract to nothing, returning a successful null entity.
    (mt/with-current-user (mt/user->id :crowberto)
      (let [personal (collection/user->personal-collection (mt/user->id :crowberto))
            result   (read-resource/read-resource {:uris [(str "metabase://collection/" (:entity_id personal))]})
            entity   (get-in result [:resources 0 :content :structured-output :entity])]
        (is (some? entity) "personal collection MBR must not be nil")
        (is (= (:entity_id personal) (:entity_id entity)))))))

(deftest read-user-recents-personal-collection-test
  (testing "a recently-viewed personal collection appears as a real item, never a junk {:_recently_viewed_at} map"
    (let [uid (mt/user->id :crowberto)]
      (mt/with-current-user uid
        (let [personal (collection/user->personal-collection uid)]
          (recent-views/update-users-recent-views! uid :model/Collection (:id personal) :view)
          (let [result (read-resource/read-resource {:uris ["metabase://user/recent-items"]})
                items  (get-in result [:resources 0 :content :structured-output :items])]
            (is (some #(= (:entity_id personal) (:entity_id %)) items)
                "the personal collection appears in recents with its identity")
            (is (not-any? #(and (contains? % :_recently_viewed_at)
                                (nil? (:entity_id %)))
                          items)
                "no timestamp-only junk item (assoc onto a nil ->mbr result)")))))))

(deftest canonical-card-type-and-entity-id-fields-test
  ;; Two regressions on the card /fields drill-down, exercised together because
  ;; both need a real-query card:
  ;;  - #3: get-table-details only knows :model/:question, so the canonical
  ;;    "card" URI segment hit its :else branch and threw "Invalid arguments".
  ;;  - #2: fetch-card-fields called (parse-long id-str), returning nil on a
  ;;    21-char entity_id NanoID — the documented entity_id drill-down was dead.
  ;; The handler now resolves via mbr/resolve-user-entity (both id forms) and
  ;; derives entity-type from the resolved card's :type.
  (let [mp    (mt/metadata-provider)
        query (as-> (lib/query mp (lib.metadata/table mp (mt/id :products))) $
                (lib/aggregate $ (lib/count))
                (lib/breakout $ (m/find-first (comp #{"Category"} :display-name)
                                              (lib/breakoutable-columns $))))
        meta  (-> query qp/process-query :data :results_metadata :columns)]
    (mt/with-temp [:model/Card {id :id eid :entity_id}
                   {:type :model :dataset_query query :result_metadata meta}]
      (mt/with-test-user :crowberto
        (testing "canonical `card` type segment reaches /fields (numeric id)"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://card/" id "/fields")]}))))
        (testing "entity_id (NanoID) resolves on the /fields sub-resource"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://card/" eid "/fields")]}))))))))

(deftest card-sources-filters-by-can-read-test
  (testing "metabase://card/{id}/sources omits source entities the user can't read"
    ;; Regression: fetch-card-sources read-checked only the parent card, then
    ;; serialized its source Database/Table/Card with no per-source perm check —
    ;; exposing restricted source cards and sandboxed table metadata. Sources now
    ;; route through extract-readable (mi/can-read? gate).
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {src-id :id} {:name "HIDDEN-SOURCE-CARD"}
                     :model/Card {card-id :id} {:name "PARENT-CARD" :source_card_id src-id}]
        (let [orig mi/can-read?]
          (with-redefs [mi/can-read? (fn
                                       ([instance]
                                        (if (and (= :model/Card (t2/model instance))
                                                 (= src-id (:id instance)))
                                          false
                                          (orig instance)))
                                       ([model id] (orig model id)))]
            (let [{:keys [output]} (read-resource/read-resource
                                    {:uris [(str "metabase://card/" card-id "/sources")]})]
              (is (not (str/includes? output "HIDDEN-SOURCE-CARD"))
                  "unreadable source card must not appear in card sources"))))))))

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
      (mt/with-temp [:model/Database {db-id :id} {:name "TT-DB"}
                     :model/Table _ {:db_id db-id :name "TARGET-TABLE" :schema "PUBLIC" :active true}]
        (let [target-table (t2/select-one :model/Table :db_id db-id :name "TARGET-TABLE")
              stub-transform {:id                 999
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
                (is (str/includes? output "\"model\":\"Table\",\"id\":\"TARGET-TABLE\"")
                    "target table MBR shape should appear when user has read perms"))))
          (testing "when user CANNOT read the target, it's filtered out"
            (with-redefs [transforms.core/get-transform (constantly stub-transform)
                          mi/can-read? (constantly false)]
              (let [{:keys [output]} (read-resource/read-resource
                                      {:uris ["metabase://transform/999/target"]})]
                (is (not (str/includes? output "TARGET-TABLE"))
                    "target table name must NOT appear when user lacks read perms")
                (is (not (str/includes? output "\"model\":\"Table\",\"id\":\"TARGET-TABLE\""))
                    "target table MBR must NOT appear when user lacks read perms")
                ;; The target *database* is gated the same way: reading the transform must
                ;; not expand an unreadable database's metadata (name/engine/...).
                (is (not (str/includes? output "\"model\":\"Database\",\"id\":\"TT-DB\""))
                    "target database MBR must NOT appear when user lacks read perms")))))))))

(deftest read-databases-list-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database _ {:name "Test DB"}]
      (testing "metabase://databases returns the database in MBR shape"
        (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://databases"]})]
          (is (str/includes? output "Test DB"))
          ;; MBR Database FK uses the database name as id in serdes/meta.
          (is (str/includes? output "\"model\":\"Database\",\"id\":\"Test DB\"")))))))

(deftest read-database-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:name "TDT-DB"}
                   :model/Table _              {:db_id db-id :name "ORDERS" :active true}]
      (testing "metabase://database/{id}/tables lists tables in MBR shape"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://database/" db-id "/tables")]})]
          (is (str/includes? output "ORDERS"))
          ;; MBR Table FK serdes/meta carries [Database Schema Table] by natural name.
          (is (str/includes? output "\"model\":\"Table\",\"id\":\"ORDERS\"")))))))

(deftest read-collections-and-collection-items-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Marketing" :location "/"}
                   :model/Card {card-id :id} {:name "Sales report" :collection_id coll-id}]
      (testing "metabase://collections lists root collections (excluding trash)"
        (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://collections"]})]
          (is (str/includes? output "Marketing"))))
      (testing "metabase://collection/{id}/items lists members as MBR with entity_id references"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://collection/" coll-id "/items")]})
              card             (t2/select-one [:model/Card :entity_id] :id card-id)]
          (is (str/includes? output "Sales report"))
          ;; MBR shape: cards reference each other by entity_id in serdes/meta and as the canonical id.
          (is (str/includes? output (str "\"entity_id\":\"" (:entity_id card) "\""))))))))

(deftest read-table-derived-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/Card {card-id :id}
                   {:name        "Derived"
                    :type        :model
                    :database_id db-id
                    :table_id    table-id}]
      (testing "metabase://table/{id}/derived returns cards built on the table in MBR shape"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://table/" table-id "/derived")]})
              card             (t2/select-one [:model/Card :entity_id] :id card-id)]
          (is (str/includes? output "Derived"))
          (is (str/includes? output (str "\"entity_id\":\"" (:entity_id card) "\""))))))))

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
    (mt/with-temp [:model/Database {db-id :id} {:name "Card-Sources-DB"}
                   :model/Table {table-id :id} {:db_id db-id :name "Card-Sources-Table"}
                   :model/Card {card-id :id} {:type :model :database_id db-id :table_id table-id}]
      (testing "metabase://model/{id}/sources returns the FK-resolved sources as MBR"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://model/" card-id "/sources")]})]
          (is (str/includes? output "\"model\":\"Database\",\"id\":\"Card-Sources-DB\"")
              "should include the database in MBR shape")
          (is (str/includes? output "\"model\":\"Table\",\"id\":\"Card-Sources-Table\"")
              "should include the source-table in MBR shape"))))))

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
        (testing "source_card_id pointing at a :metric extracts to MBR with type :metric"
          (let [{:keys [output]} (read-resource/read-resource
                                  {:uris [(str "metabase://question/" q-id "/sources")]})
                metric           (t2/select-one [:model/Card :entity_id] :id metric-id)]
            (is (str/includes? output (str "\"entity_id\":\"" (:entity_id metric) "\""))
                "should include the metric source-card by its entity_id")
            (is (str/includes? output "\"type\":\"metric\"")
                "the MBR for the source-card carries type=metric (not question)")))
        (testing "source_card_id pointing at a :model still emits an MBR with type :model"
          (let [{:keys [output]} (read-resource/read-resource
                                  {:uris [(str "metabase://question/" q-from-model-id "/sources")]})
                model            (t2/select-one [:model/Card :entity_id] :id model-id)]
            (is (str/includes? output (str "\"entity_id\":\"" (:entity_id model) "\"")))
            (is (str/includes? output "\"type\":\"model\""))))))))

(defn- measure-definition
  "An MBQL5 measure definition: the sum of `field-id` over `table-id`."
  [table-id field-id]
  (let [mp (mt/metadata-provider)]
    (lib/aggregate (lib/query mp (lib.metadata/table mp table-id))
                   (lib/sum (lib.metadata/field mp field-id)))))

(defn- segment-definition
  "An MBQL5 segment definition: a filter of `field-id` > `value` on `table-id`."
  [table-id field-id value]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                (lib/> (lib.metadata/field mp field-id) value))))

(deftest read-measure-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (let [orders (mt/id :orders)
            total  (mt/id :orders :total)]
        (mt/with-temp [:model/Measure {measure-id :id}
                       {:name       "Order Revenue"
                        :description "sum of order totals"
                        :table_id   orders
                        :creator_id (mt/user->id :crowberto)
                        :definition (measure-definition orders total)}]
          (testing "metabase://measure/{id} returns the measure with parent-table context + portable entity id"
            (let [result     (read-resource/read-resource {:uris [(str "metabase://measure/" measure-id)]})
                  structured (get-in result [:resources 0 :content :structured-output])
                  output     (:output result)]
              (is (=? {:type                   :measure
                       :name                   "Order Revenue"
                       :database_id            (mt/id)
                       :base_table_id          orders
                       :portable-entity-id     string?
                       :base_table_portable_fk vector?}
                      structured))
              (testing "rendered XML carries the measure name and a portable entity id"
                (is (str/includes? output "Order Revenue"))
                (is (str/includes? output "portable_entity_id=")))))
          (testing "metabase://measure/{entity_id} resolves to the same measure as the numeric id"
            (let [eid        (t2/select-one-fn :entity_id :model/Measure measure-id)
                  by-eid     (read-resource/read-resource {:uris [(str "metabase://measure/" eid)]})
                  by-id      (read-resource/read-resource {:uris [(str "metabase://measure/" measure-id)]})]
              (is (= (get-in by-id [:resources 0 :content :structured-output])
                     (get-in by-eid [:resources 0 :content :structured-output]))
                  "entity_id and numeric id URIs return identical bodies")))
          (testing "returns a 404 for an unknown NanoID"
            (is (=? {:resources [{:error #".*not found.*"}]}
                    (read-resource/read-resource {:uris ["metabase://measure/AAAAAAAAAAAAAAAAAAAAA"]}))))
          (testing "returns an error for an unknown measure"
            (is (=? {:resources [{:error string?}]}
                    (read-resource/read-resource {:uris ["metabase://measure/99999"]}))))
          (testing "errors when the user can't read the parent table"
            (with-redefs [mi/can-read? (constantly false)]
              (is (error? (read-resource/read-resource {:uris [(str "metabase://measure/" measure-id)]}))))))))))

(deftest read-segment-resource-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (let [orders (mt/id :orders)
            total  (mt/id :orders :total)]
        (mt/with-temp [:model/Segment {segment-id :id}
                       {:name       "Big Orders"
                        :description "totals over 100"
                        :table_id   orders
                        :definition (segment-definition orders total 100)}]
          (testing "metabase://segment/{id} returns the segment with parent-table context + portable entity id"
            (let [result     (read-resource/read-resource {:uris [(str "metabase://segment/" segment-id)]})
                  structured (get-in result [:resources 0 :content :structured-output])
                  output     (:output result)]
              (is (=? {:type                   :segment
                       :name                   "Big Orders"
                       :database_id            (mt/id)
                       :base_table_id          orders
                       :portable-entity-id     string?
                       :base_table_portable_fk vector?}
                      structured))
              (testing "rendered XML carries the segment name and a portable entity id"
                (is (str/includes? output "Big Orders"))
                (is (str/includes? output "portable_entity_id=")))))
          (testing "metabase://segment/{entity_id} resolves to the same segment as the numeric id"
            (let [eid    (t2/select-one-fn :entity_id :model/Segment segment-id)
                  by-eid (read-resource/read-resource {:uris [(str "metabase://segment/" eid)]})
                  by-id  (read-resource/read-resource {:uris [(str "metabase://segment/" segment-id)]})]
              (is (= (get-in by-id [:resources 0 :content :structured-output])
                     (get-in by-eid [:resources 0 :content :structured-output]))
                  "entity_id and numeric id URIs return identical bodies")))
          (testing "returns a 404 for an unknown NanoID"
            (is (=? {:resources [{:error #".*not found.*"}]}
                    (read-resource/read-resource {:uris ["metabase://segment/AAAAAAAAAAAAAAAAAAAAA"]}))))
          (testing "returns an error for an unknown segment"
            (is (=? {:resources [{:error string?}]}
                    (read-resource/read-resource {:uris ["metabase://segment/99999"]}))))
          (testing "errors when the user can't read the parent table"
            (with-redefs [mi/can-read? (constantly false)]
              (is (error? (read-resource/read-resource {:uris [(str "metabase://segment/" segment-id)]}))))))))))

(deftest read-dashboard-items-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:name "Dash card"}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (testing "metabase://dashboard/{id}/items returns cards on the dashboard"
        (let [{:keys [output]} (read-resource/read-resource {:uris [(str "metabase://dashboard/" dash-id "/items")]})
              card             (t2/select-one [:model/Card :entity_id] :id card-id)]
          (is (str/includes? output "Dash card"))
          (is (str/includes? output (str "\"entity_id\":\"" (:entity_id card) "\""))))))))

(deftest read-user-recents-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "metabase://user/recent-items returns an MBR list shape (possibly empty)"
      (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://user/recent-items"]})]
        (is (str/includes? output "\"list-type\":\"recent-items\""))))
    (testing "?page=N is honored — an out-of-range page errors instead of being silently ignored"
      ;; Regression: dispatch used to drop query-params for this route, so page 2+ was unreachable.
      (let [result (read-resource/read-resource {:uris ["metabase://user/recent-items?page=99"]})]
        (is (some-> (get-in result [:resources 0 :error]) (str/includes? "Invalid page 99"))
            "the page param must reach paginate-items")))))

(deftest read-user-recents-surfaces-all-model-types-test
  (testing "recent items include every MBR model type, including collections and documents.

           get-recents sets :model to a KEYWORD; keying the model maps on strings matched nothing
           and dropped *every* recent (and collection/document had no mapping at all). This seeds one
           recent of each type and asserts they all come back."
    (let [uid (mt/user->id :crowberto)]
      (mt/with-current-user uid
        (mt/with-temp [:model/Collection {coll-id :id}  {:name "RECENT-COLL"}
                       :model/Card       {card-id :id}  {:name "RECENT-CARD"}
                       :model/Dashboard  {dash-id :id}  {:name "RECENT-DASH"}
                       :model/Document   {doc-id :id}   {:name "RECENT-DOC" :creator_id uid}]
          (doseq [[model id] [[:model/Collection coll-id]
                              [:model/Card       card-id]
                              [:model/Dashboard  dash-id]
                              [:model/Document   doc-id]]]
            (recent-views/update-users-recent-views! uid model id :view))
          (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://user/recent-items"]})]
            (doseq [needle ["RECENT-COLL" "RECENT-CARD" "RECENT-DASH" "RECENT-DOC"]]
              (is (str/includes? output needle)
                  (str needle " should appear in recent-items (regression: keyword :model + missing collection/document mapping dropped recents)")))))))))

(deftest read-list-shape-test
  (testing "list responses always carry list-type/total/page/pages/truncated keys in MBR JSON"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [{:keys [output]} (read-resource/read-resource {:uris ["metabase://databases"]})]
        (is (str/includes? output "\"list-type\":\"databases\""))
        (is (str/includes? output "\"total\":"))
        (is (str/includes? output "\"items\":"))
        (is (str/includes? output "\"page\":"))
        (is (str/includes? output "\"pages\":"))
        (is (str/includes? output "\"truncated\":"))))))

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
      (testing "metabase://database/{id} returns single-entity MBR output"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id)]})]
          (is (str/includes? output "Detail DB"))
          ;; MBR Database carries its name as serdes/meta id and engine as a top-level key.
          (is (str/includes? output "\"model\":\"Database\",\"id\":\"Detail DB\""))
          (is (str/includes? output "\"engine\":\"h2\"")))))))

(deftest read-database-detail-drops-settings-test
  (testing "Database MBR never carries :settings — serdes copies it verbatim and the mi/to-json
           visibility filter (can-read-setting?) doesn't fire on plain maps, so redact-mbr drops
           it uniformly instead"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:name     "Settings DB"
                                                  :engine   :h2
                                                  :settings {:database-enable-actions true}}]
        (testing "single entity read"
          (let [result (read-resource/read-resource {:uris [(str "metabase://database/" db-id)]})
                entity (get-in result [:resources 0 :content :structured-output :entity])]
            (is (some? entity))
            (is (not (contains? entity :settings)))))
        (testing "list read"
          (let [result (read-resource/read-resource {:uris ["metabase://databases"]})
                items  (get-in result [:resources 0 :content :structured-output :items])
                db     (u/seek #(= "Settings DB" (:name %)) items)]
            (is (some? db))
            (is (not (contains? db :settings)))))))))

(deftest read-dashboard-scrubs-unreadable-card-dashcards-test
  (testing "a non-admin reading a Dashboard MBR gets dashcards scrubbed when the embedded card lives
           in a collection they cannot read — serdes exports field refs by NAME, so an unreadable
           card's viz settings / parameter mappings must not ride along (OSS collection perms,
           independent of sandboxing)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {open-id :id}       {:name "Open Coll"}
                     :model/Collection {restricted-id :id} {:name "Restricted Coll"}
                     :model/Dashboard  {dash-eid :entity_id dash-id :id} {:collection_id open-id}
                     :model/Card       {open-card :id}     {:name "OPEN-CARD" :collection_id open-id}
                     :model/Card       {hidden-card :id}   {:name "HIDDEN-CARD" :collection_id restricted-id}
                     :model/DashboardCard _ {:dashboard_id           dash-id
                                             :card_id                open-card
                                             :visualization_settings {:title "open viz"}}
                     :model/DashboardCard _ {:dashboard_id           dash-id
                                             :card_id                hidden-card
                                             :visualization_settings {:title "hidden viz"}}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) open-id)
        (mt/with-current-user (mt/user->id :rasta)
          (let [result    (read-resource/read-resource {:uris [(str "metabase://dashboard/" dash-eid)]})
                entity    (get-in result [:resources 0 :content :structured-output :entity])
                open-eid  (t2/select-one-fn :entity_id :model/Card open-card)
                hidden-eid (t2/select-one-fn :entity_id :model/Card hidden-card)
                by-card   (fn [eid] (u/seek #(= eid (:card_id %)) (:dashcards entity)))]
            (is (some? entity) "dashboard itself is readable")
            (is (contains? (by-card open-eid) :visualization_settings)
                "dashcard of a readable card keeps its viz settings (no over-scrub)")
            (is (some? (by-card hidden-eid))
                "the unreadable card's dashcard still appears (layout/FK only)")
            (is (not (contains? (by-card hidden-eid) :visualization_settings))
                "dashcard of an unreadable card is scrubbed")))))))

(deftest read-database-models-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Card     {model-id :id} {:type :model :database_id db-id :name "M-One"}
                   :model/Card     _              {:type :question :database_id db-id :name "Q-Skip"}]
      (testing "metabase://database/{id}/models lists models only (not questions)"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/models")]})
              card             (t2/select-one [:model/Card :entity_id] :id model-id)]
          (is (str/includes? output "M-One"))
          (is (str/includes? output (str "\"entity_id\":\"" (:entity_id card) "\"")))
          (is (not (str/includes? output "Q-Skip"))))))))

(deftest read-database-schemas-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:name "DBS-DB"}
                   :model/Table _ {:db_id db-id :schema "PUBLIC"  :name "t1" :active true}
                   :model/Table _ {:db_id db-id :schema "PRIVATE" :name "t2" :active true}]
      (testing "metabase://database/{id}/schemas emits one entry per schema"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/schemas")]})]
          (is (str/includes? output "PUBLIC"))
          (is (str/includes? output "PRIVATE"))
          ;; Schema items aren't first-class MBR entities — they carry the
          ;; parent database name as `database` so the agent can build the FK.
          (is (str/includes? output "\"database\":\"DBS-DB\"")))))))

(deftest read-database-schema-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table _ {:db_id db-id :schema "PUBLIC"  :name "PUB-TABLE"  :active true}
                   :model/Table _ {:db_id db-id :schema "PRIVATE" :name "PRIV-TABLE" :active true}]
      (testing "metabase://database/{id}/schemas/{name}/tables filters by schema"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/schemas/PUBLIC/tables")]})]
          (is (str/includes? output "PUB-TABLE"))
          (is (str/includes? output "\"model\":\"Table\",\"id\":\"PUB-TABLE\""))
          (is (not (str/includes? output "PRIV-TABLE"))))))))

(deftest read-sample-database-test
  (testing "a database flagged is_sample extracts to a real MBR — exports exclude it, reads must not"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:name "Sample-Flag DB" :engine :h2 :is_sample true}]
        (testing "single read returns the entity, not null"
          (let [result (read-resource/read-resource {:uris [(str "metabase://database/" db-id)]})
                entity (get-in result [:resources 0 :content :structured-output :entity])]
            (is (some? entity) "sample database MBR must not be nil")
            (is (= "Sample-Flag DB" (:name entity)))))
        (testing "list counts it in :total AND includes it in :items (no silent mismatch)"
          (let [result (read-resource/read-resource {:uris ["metabase://databases"]})
                so     (get-in result [:resources 0 :content :structured-output])]
            (is (= (:total so) (count (:items so))))
            (is (some #(= "Sample-Flag DB" (:name %)) (:items so)))))
        (testing "real serdes exports still exclude it (default binding pinned)"
          (is (not-any? #(= "Sample-Flag DB" (:name %))
                        (into [] (serdes/extract-all "Database" {})))))))))

(deftest read-schemaless-database-test
  (testing "a schemaless (nil-schema) database is navigable: /schemas surfaces the nil schema as \"\"
           and the schema//tables list route matches NULL-schema tables"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:name "Schemaless DB"}
                     :model/Table    _           {:db_id db-id :schema nil :name "EVENTS" :active true}]
        (testing "/schemas lists the nil schema as an empty-name entry"
          (let [result (read-resource/read-resource {:uris [(str "metabase://database/" db-id "/schemas")]})
                items  (get-in result [:resources 0 :content :structured-output :items])]
            (is (= [""] (mapv :name items)))))
        (testing "the empty schema segment lists the NULL-schema tables"
          (let [{:keys [output]} (read-resource/read-resource
                                  {:uris ["metabase://database/Schemaless%20DB/schema//tables"]})]
            (is (str/includes? output "EVENTS")
                "nil-schema table must be listed via the schema// (empty segment) route")))))))

(deftest read-table-path-form-with-numeric-db-id-test
  (testing "the db segment resolves identically in every route: a legacy numeric db id that works
           in database/{id}/tables also works in the path-form table URI"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {:name "NumSeg DB"}
                     :model/Table    _           {:db_id db-id :schema "PUBLIC" :name "ORDERS-N" :active true}]
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://database/" db-id "/schema/PUBLIC/table/ORDERS-N")]})]
          (is (str/includes? output "ORDERS-N")
              "numeric db segment must resolve in the path-form table route"))))))

(deftest read-resource-rejects-empty-uris-test
  (testing "zero URIs throws (caller bug) rather than returning a silent empty success"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No URIs provided"
                          (read-resource/read-resource {:uris []})))))

(deftest read-resource-serdes-cache-is-transparent-test
  (testing "wrapping extraction in serdes/with-cache is memoization only — the cached read_resource
           output equals the uncached MBR from a bare extract-as-user (no staleness, read_resource
           does no writes). extract-as-user called directly is NOT inside with-cache."
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-eid :entity_id dash-id :id} {}
                     :model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table (mt/id :orders)}}}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [cached   (get-in (read-resource/read-resource {:uris [(str "metabase://dashboard/" dash-eid)]})
                               [:resources 0 :content :structured-output :entity])
              uncached (mbr/extract-as-user "Dashboard" (t2/select-one :model/Dashboard dash-id))]
          (is (= uncached cached)
              "cached and uncached MBR are identical"))))))

(deftest read-database-schema-tables-with-slash-in-schema-name-test
  (testing "schema names containing '/' (which Postgres/Snowflake/etc. allow) survive URI round-trip"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table _              {:db_id db-id :schema "weird/name" :name "WEIRD-TABLE" :active true}
                     :model/Table _              {:db_id db-id :schema "other"      :name "OTHER-TABLE" :active true}]
        (let [emitted-uri (llm-shape/metabase-uri :database db-id "schemas" "weird/name" "tables")]
          (testing "the URI builder emits an encoded segment"
            (is (str/includes? emitted-uri "weird%2Fname")))
          (testing "the encoded URI dispatches and filters to the right schema"
            (let [{:keys [output]} (read-resource/read-resource {:uris [emitted-uri]})]
              (is (str/includes? output "WEIRD-TABLE"))
              (is (str/includes? output "\"model\":\"Table\",\"id\":\"WEIRD-TABLE\""))
              (is (not (str/includes? output "OTHER-TABLE"))))))))))

(deftest read-collection-detail-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "Detail Coll" :location "/"}]
      (testing "metabase://collection/{id} returns a single-entity MBR (not the old XML entity shape)"
        (let [result (read-resource/read-resource
                      {:uris [(str "metabase://collection/" coll-id)]})
              {:keys [output]} result
              mbr    (get-in result [:resources 0 :content :structured-output :entity])]
          ;; The `uri="…"` attr lives on the <resource> wrapper, so a substring check on it only
          ;; proves the envelope. Assert the BODY is MBR: serdes/meta model + entity_id, name.
          (is (str/includes? output (str "uri=\"metabase://collection/" coll-id "\""))
              "resource wrapper carries the navigation uri")
          (is (= "Detail Coll" (:name mbr)))
          (is (= (:entity_id coll) (:entity_id mbr))
              "MBR body is keyed by entity_id (the serdes shape), not the numeric id")
          (is (= {:model "Collection" :id (:entity_id coll)}
                 (-> mbr :serdes/meta last (select-keys [:model :id])))
              "MBR body carries the serdes identity path, confirming JSON MBR not XML"))))))

(deftest read-collection-subcollections-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/"}
                   :model/Collection {child-id :id}  {:name "Child"  :location (str "/" parent-id "/")}]
      (testing "metabase://collection/{id}/subcollections lists direct children only"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://collection/" parent-id "/subcollections")]})
              child            (t2/select-one [:model/Collection :entity_id] :id child-id)]
          (is (str/includes? output "Child"))
          (is (str/includes? output (str "\"entity_id\":\"" (:entity_id child) "\"")))
          (is (not (str/includes? output "Parent"))))))))

(deftest read-collections-tree-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {parent-id :id} {:name "P" :location "/"}
                   :model/Collection {child-id :id}  {:name "C" :location (str "/" parent-id "/")}]
      (testing "metabase://collections?tree=true returns all collections; hierarchy is encoded via parent_id"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris ["metabase://collections?tree=true"]})
              parent           (t2/select-one [:model/Collection :entity_id] :id parent-id)
              child            (t2/select-one [:model/Collection :entity_id] :id child-id)]
          (is (str/includes? output "\"list-type\":\"collections-tree\""))
          (is (str/includes? output (str "\"entity_id\":\"" (:entity_id parent) "\"")))
          (is (str/includes? output (str "\"entity_id\":\"" (:entity_id child) "\""))
              "tree mode returns all collections in the namespace, including descendants")
          (is (str/includes? output (str "\"parent_id\":\"" (:entity_id parent) "\""))
              "child collection's MBR carries parent_id = parent's entity_id (per MBR spec)"))))))

(deftest read-table-field-with-slash-test
  (testing "field IDs containing slashes (e.g. composite ids c75/17) are preserved through dispatch"
    (let [calls (atom nil)]
      (with-redefs [read-resource/fetch-table-field
                    (fn [& args] (reset! calls args) {:structured-output {:result-type :metabot-entity :type :stub}})]
        (#'read-resource/dispatch "metabase://table/3/fields/c75/17")
        (is (= ["3" "c75/17"] @calls))))))

(deftest read-card-question-vs-model-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {:name "QvM-DB"}
                   :model/Card {q-id :id} {:type :question :database_id db-id :name "Q-card"}
                   :model/Card {m-id :id} {:type :model    :database_id db-id :name "M-card"}]
      (testing "metabase://question/{id}/sources discriminates from model"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://question/" q-id "/sources")]})]
          (is (str/includes? output "\"model\":\"Database\",\"id\":\"QvM-DB\""))))
      (testing "metabase://model/{id}/sources for a model card"
        (let [{:keys [output]} (read-resource/read-resource
                                {:uris [(str "metabase://model/" m-id "/sources")]})]
          (is (str/includes? output "\"model\":\"Database\",\"id\":\"QvM-DB\"")))))))

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

;; ===== entity_id reaches metric + transform drill-down sub-routes =====
;;
;; MBR advertises entity_id URIs (metabase://metric/{eid}, metabase://transform/{eid},
;; metabase://card/{eid}). Several drill-down handlers used to `(parse-long id-str)`, so a
;; 21-char NanoID -> nil -> 400/404. Each test asserts the entity_id form is non-error AND
;; the numeric form still works (backcompat).

(defn- metric-query
  "A count metric over the products table, breaking out on Category."
  []
  (let [mp (mt/metadata-provider)]
    (as-> (lib/query mp (lib.metadata/table mp (mt/id :products))) $
      (lib/aggregate $ (lib/count)))))

(deftest metric-dimensions-entity-id-and-numeric-test
  (testing "metabase://metric/{id}/dimensions resolves both entity_id (NanoID) and numeric id"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {id :id eid :entity_id} {:type :metric :dataset_query (metric-query)}]
        (testing "numeric id (backcompat)"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource {:uris [(str "metabase://metric/" id "/dimensions")]}))))
        (testing "entity_id (NanoID) — used to parse-long to nil -> 400"
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource {:uris [(str "metabase://metric/" eid "/dimensions")]}))))))))

(deftest metric-single-dimension-entity-id-and-numeric-test
  (testing "metabase://metric/{id}/dimensions/{dim} resolves both entity_id and numeric id"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {id :id eid :entity_id} {:type :metric :dataset_query (metric-query)}]
        ;; A real queryable dimension of the products metric — Category field id.
        (let [dim-id (mt/id :products :category)]
          (testing "numeric id (backcompat)"
            (is (=? {:resources [{:content map?}]}
                    (read-resource/read-resource
                     {:uris [(str "metabase://metric/" id "/dimensions/" dim-id)]}))))
          (testing "entity_id (NanoID)"
            (is (=? {:resources [{:content map?}]}
                    (read-resource/read-resource
                     {:uris [(str "metabase://metric/" eid "/dimensions/" dim-id)]})))))))))

(deftest metric-dimensions-round-trip-via-serdes-entity-id-test
  (testing "fetch a metric, read its entity_id from the MBR, feed it back through /dimensions"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {id :id} {:type :metric :dataset_query (metric-query)}]
        (let [mbr-eid (t2/select-one-fn :entity_id :model/Card :id id)]
          ;; The advertised contract: the entity_id in serdes/meta is directly usable.
          (is (=? {:resources [{:content {:structured-output map?}}]}
                  (read-resource/read-resource
                   {:uris [(str "metabase://metric/" mbr-eid "/dimensions")]}))))))))

(deftest metric-dimensions-field-values-option-key-test
  (testing "with-field-values? false suppresses field-value fetching (correct ?-suffixed key)"
    ;; get-metric-details reads :with-field-values? (with the ?). The old code passed
    ;; :with-field-values (no ?), so the option was silently ignored. If the ? key is honored,
    ;; field-values-fn is swapped for identity and no queryable dimension carries sample values.
    ;; NOTE: the emitted key is :field_values (underscore) — `->result-column`
    ;; (metabot/tools/util.clj) renames the intermediate hyphenated :field-values on the way out.
    ;; Asserting the hyphen key would be vacuous (it never reaches the output).
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {id :id} {:type :metric :dataset_query (metric-query)}]
        (let [so   (get-in (read-resource/read-resource
                            {:uris [(str "metabase://metric/" id "/dimensions")]})
                           [:resources 0 :content :structured-output])
              dims (:queryable-dimensions so)]
          (is (seq dims) "metric should expose queryable dimensions")
          ;; Positive control: CATEGORY is a low-cardinality field with cached field-values,
          ;; so a broken suppression WOULD populate :field_values on it — this keeps the
          ;; absence assertion below from passing merely because no dimension ever carries values.
          (is (some #(= "CATEGORY" (:name %)) dims)
              "the value-bearing CATEGORY dimension must be present for the suppression check to bite")
          (is (every? #(not (contains? % :field_values)) dims)
              "no dimension may carry :field_values when with-field-values? is false"))))))

(deftest card-fields-routes-metric-to-dimensions-test
  (testing "metabase://card/{metric_eid}/fields routes a :metric card to its dimensions (not table-details)"
    ;; get-table-details only handles :question/:model — a :metric hit :else -> 400. The
    ;; canonical `card` type must funnel metrics through the metric-dimensions path.
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {id :id eid :entity_id} {:type :metric :dataset_query (metric-query)}]
        (testing "numeric id returns dimension-shaped content, not an error"
          (let [so (get-in (read-resource/read-resource
                            {:uris [(str "metabase://card/" id "/fields")]})
                           [:resources 0 :content :structured-output])]
            (is (map? so))
            (is (= :metric (:type so)) "the metric-details rollup carries type :metric")
            (is (contains? so :queryable-dimensions)
                "card/{metric}/fields must return the metric's queryable dimensions")))
        (testing "entity_id (NanoID) also routes to the metric dimensions path"
          (is (=? {:resources [{:content {:structured-output {:type :metric}}}]}
                  (read-resource/read-resource {:uris [(str "metabase://card/" eid "/fields")]}))))))))

(deftest transform-entity-id-and-numeric-test
  (testing "metabase://transform/{id}[/sources|/target] resolves both entity_id and numeric id"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform {id :id eid :entity_id}
                       {:name   "EID Transform"
                        :source {:type  "query"
                                 :query (lib/native-query (mt/metadata-provider)
                                                          "SELECT * FROM products WHERE category = 'Gadget'")}}]
          (doseq [[label id-seg] [["numeric id" (str id)] ["entity_id (NanoID)" eid]]]
            (testing label
              (testing "/transform/{id}"
                (is (=? {:resources [{:content {:structured-output map?}}]}
                        (read-resource/read-resource {:uris [(str "metabase://transform/" id-seg)]}))))
              (testing "/transform/{id}/sources"
                (is (=? {:resources [{:content {:structured-output map?}}]}
                        (read-resource/read-resource {:uris [(str "metabase://transform/" id-seg "/sources")]}))))
              (testing "/transform/{id}/target"
                (is (=? {:resources [{:content {:structured-output map?}}]}
                        (read-resource/read-resource {:uris [(str "metabase://transform/" id-seg "/target")]})))))))))))

(deftest transform-round-trip-via-serdes-entity-id-test
  (testing "fetch a transform, read its entity_id, feed it back through the drill-down URLs"
    (mt/with-premium-features #{:transforms}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Transform {id :id}
                       {:name   "RoundTrip Transform"
                        :source {:type  "query"
                                 :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
          (let [eid (t2/select-one-fn :entity_id :model/Transform :id id)]
            (is (=? {:resources [{:content {:structured-output map?}}]}
                    (read-resource/read-resource {:uris [(str "metabase://transform/" eid)]})))
            (is (=? {:resources [{:content {:structured-output map?}}]}
                    (read-resource/read-resource {:uris [(str "metabase://transform/" eid "/sources")]})))
            (is (=? {:resources [{:content {:structured-output map?}}]}
                    (read-resource/read-resource {:uris [(str "metabase://transform/" eid "/target")]})))))))))
