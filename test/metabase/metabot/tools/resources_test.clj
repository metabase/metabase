(ns metabase.metabot.tools.resources-test
  "Tests for read_resource tool."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.collections.models.collection :as collection]
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
   ;; List routes take a trailing query-params arg (nil when no query string).
   ;; `?page=N` rows confirm the page param threads through to the handler.
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
                ;; The target *database* MBR is still surfaced — that's intentional, the
                ;; entity carries no extra metadata and any read_resource call on its
                ;; URI will enforce its own auth.
                (is (str/includes? output "\"model\":\"Database\",\"id\":\"TT-DB\"")
                    "target database MBR is informational and remains visible")))))))))

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
        (is (str/includes? output "\"list-type\":\"recent-items\""))))))

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
