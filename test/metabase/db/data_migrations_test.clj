(ns metabase.db.data-migrations-test
  "Tests to make sure the data migrations actually work as expected and don't break things. Shamefully, we have way less
  of these than we should... but that doesn't mean we can't write them for our new ones :)"
  (:require [cheshire.core :as json]
            [clojure.set :as set]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.db.data-migrations :as migrations]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.database :refer [Database]]
            [metabase.models.permissions :as perms :refer [Permissions]]
            [metabase.models.permissions-group :as group :refer [PermissionsGroup]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.user :refer [User]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [metabase.util.password :as u.password]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

;; only run these tests when we're running tests for BigQuery because when a Database gets deleted it calls
;; `driver/notify-database-updated` which attempts to load the BQ driver
(deftest add-legacy-sql-directive-to-bigquery-sql-cards-test
  (mt/test-driver :bigquery
    ;; Create a BigQuery database with 2 SQL Cards, one that already has a directive and one that doesn't.
    (mt/with-temp* [Database [database {:engine "bigquery"}]
                    Card     [card-1   {:name          "Card that should get directive"
                                        :database_id   (u/the-id database)
                                        :dataset_query {:database (u/the-id database)
                                                        :type     :native
                                                        :native   {:query "SELECT * FROM [dataset.table];"}}}]
                    Card     [card-2   {:name          "Card that already has directive"
                                        :database_id   (u/the-id database)
                                        :dataset_query {:database (u/the-id database)
                                                        :type     :native
                                                        :native   {:query "#standardSQL\nSELECT * FROM `dataset.table`;"}}}]]
      ;; manually running the migration function should cause card-1, which needs a directive, to get updated, but
      ;; should not affect card-2.
      (#'migrations/add-legacy-sql-directive-to-bigquery-sql-cards)
      (is (= {"Card that should get directive"
              {:database true
               :type     :native
               :native   {:query "#legacySQL\nSELECT * FROM [dataset.table];"}}
              "Card that already has directive"
              {:database true
               :type     :native
               :native   {:query "#standardSQL\nSELECT * FROM `dataset.table`;"}}}
             (->> (db/select-field->field :name :dataset_query Card :id [:in (map u/the-id [card-1 card-2])])
                  (m/map-vals #(update % :database integer?))))))))

(deftest add-legacy-sql-directive-to-bigquery-sql-cards-empty-query-test
  (mt/test-driver :bigquery
    (testing (str "If for some reason we have a BigQuery native query that does not actually have any SQL, ignore it "
                  "rather than barfing (#8924) (No idea how this was possible, but clearly it was)")
      (mt/with-temp* [Database [database {:engine "bigquery"}]
                      Card     [card     {:database_id   (u/the-id database)
                                          :dataset_query {:database (u/the-id database)
                                                          :type     :native
                                                          :native   {:query 1000}}}]]
        (mt/suppress-output
          (#'migrations/add-legacy-sql-directive-to-bigquery-sql-cards))
        (is (= {:database true, :type :native, :native {:query 1000}}
               (-> (db/select-one-field :dataset_query Card :id (u/the-id card))
                   (update :database integer?))))))))

(deftest clear-ldap-user-local-passwords-test
  (testing "Test clearing of LDAP user local passwords"
    (mt/with-temp* [User [ldap-user {:email     "ldapuser@metabase.com"
                                     :password  "something secret"
                                     :ldap_auth true}]
                    User [user      {:email    "notanldapuser@metabase.com"
                                     :password "no change"}]]
      (#'migrations/clear-ldap-user-local-passwords)
      (let [get-pass-and-salt          #(db/select-one [User :password :password_salt] :id (u/the-id %))
            {ldap-pass :password,
             ldap-salt :password_salt} (get-pass-and-salt ldap-user)
            {user-pass :password,
             user-salt :password_salt} (get-pass-and-salt user)]
        (testing "The LDAP user password should be no good now that it's been cleared and replaced"
          (is (= false
                 (u.password/verify-password "something secret" ldap-salt ldap-pass))))
        (testing "There should be no change for a non ldap user"
          (is (= true
                 (u.password/verify-password "no change" user-salt user-pass))))))))


;;; -------------------------------------------- add-migrated-collections --------------------------------------------

(def ^:private migrated-collection-names #{"Migrated Dashboards" "Migrated Pulses" "Migrated Questions"})

(defn- do-with-add-migrated-collections-cleanup [f]
  ;; remove the root collection perms if they're already there so we don't see warnings about duplicate perms
  (try
    (doseq [group-id (db/select-ids PermissionsGroup :id [:not= (u/the-id (group/admin))])]
      (perms/revoke-collection-permissions! group-id collection/root-collection))
    (f)
    (finally
      (doseq [collection-name migrated-collection-names]
        (db/delete! Collection :name collection-name)))))

(defmacro ^:private with-add-migrated-collections-cleanup [& body]
  `(do-with-add-migrated-collections-cleanup (fn [] ~@body)))

(deftest add-migrated-collections-root-read-perms-test
  (testing "should grant Root Collection read perms"
    (with-add-migrated-collections-cleanup
      (mt/with-temp PermissionsGroup [group]
        (#'migrations/add-migrated-collections)
        (letfn [(perms [group]
                  (db/select-field :object Permissions
                    :group_id (u/the-id group)
                    :object   [:like "/collection/root/%"]))]
          (testing "to All Users"
            (is (= #{"/collection/root/"}
                   (perms (group/all-users)))))
          (testing "to other groups"
            (is (= #{"/collection/root/"}
                   (perms group)))))))))

(deftest add-migrated-collections-create-collections-test
  (testing "Should create the new Collections"
    (with-add-migrated-collections-cleanup
      (mt/with-temp* [Pulse     [_]
                      Card      [_]
                      Dashboard [_]]
        (#'migrations/add-migrated-collections)
        (let [collections (db/select-field :name Collection)]
          (doseq [collection-name migrated-collection-names]
            (is (contains? collections collection-name)))))))

  (testing "Shouldn't create new Collections for models where there's nothing to migrate"
    (with-add-migrated-collections-cleanup
      (mt/with-temp Dashboard [_]
        (let [collections-before (db/select-field :name Collection)
              orig-db-exists?    db/exists?]
          ;; pretend no Pulses or Cards exist if we happen to be running this from the REPL.
          (with-redefs [db/exists? (fn [model & args]
                                     (if (#{Pulse Card} model)
                                       false
                                       (apply orig-db-exists? model args)))]
            (#'migrations/add-migrated-collections)
            (is (= #{"Migrated Dashboards"}
                   (set/difference (db/select-field :name Collection) collections-before)))))))))

(deftest add-migrated-collections-move-objects-test
  (testing "Should move stuff into the new Collections as appropriate"
    (testing "Pulse"
      (with-add-migrated-collections-cleanup
        (mt/with-temp Pulse [pulse]
          (#'migrations/add-migrated-collections)
          (is (= (db/select-one-field :collection_id Pulse :id (u/the-id pulse))
                 (db/select-one-id Collection :name "Migrated Pulses"))))))

    (testing "Card"
      (with-add-migrated-collections-cleanup
        (mt/with-temp Card [card]
          (#'migrations/add-migrated-collections)
          (is (= (db/select-one-field :collection_id Card :id (u/the-id card))
                 (db/select-one-id Collection :name "Migrated Questions"))))))

    (testing "Dashboard"
      (with-add-migrated-collections-cleanup
        (mt/with-temp Dashboard [dashboard]
          (#'migrations/add-migrated-collections)
          (is (= (db/select-one-field :collection_id Dashboard :id (u/the-id dashboard))
                 (db/select-one-id Collection :name "Migrated Dashboards"))))))))

(deftest add-migrated-collections-perms-test
  (with-add-migrated-collections-cleanup
    (mt/with-temp* [PermissionsGroup [group]
                    Pulse            [_]
                    Card             [_]
                    Dashboard        [_]]
      (#'migrations/add-migrated-collections)
      (letfn [(perms [group]
                (db/select Permissions
                  {:where [:and
                           [:= :group_id (u/the-id (group/all-users))]
                           (cons
                            :or
                            (for [migrated-collection-id (db/select-ids Collection :name [:in migrated-collection-names])]
                              [:like :object (format "/collection/%d/%%" migrated-collection-id)]))]}))]
        (testing "All Users shouldn't get any permissions for the 'migrated' groups"
          (is (= []
                 (perms (group/all-users)))))
        (testing "...nor should other groups that happen to exist"
          (is (= []
                 (perms group))))))))

(deftest fix-click-through-test
  (let [migrate (fn [card dash]
                  (:visualization_settings
                   (#'migrations/fix-click-through {:id                     1
                                                    :dashcard_visualization dash
                                                    :card_visualization     card})))]
    (testing "toplevel"
      (let [card {"some_setting:"       {"foo" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "link"}
            dash {"other_setting" {"bar" 123}}]
        (is (= {"other_setting"  {"bar" 123}
                "click_behavior" {"type"         "link"
                                  "linkType"     "url"
                                  "linkTemplate" "http://example.com/{{col_name}}"}}
               (migrate card dash)))))

    (testing "top level disabled"
      (let [card {"some_setting:"       {"foo" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "link"}
            dash {"other_setting"       {"bar" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "menu"}]
        ;;click: "menu" turned off the custom drill through so it's not migrated. Dropping click and click_link_template would be fine but isn't needed.
        (is (nil? (migrate card dash)))))
    (testing "column settings"
      (let [card {"some_setting" {"foo" 123}
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]"
                   {"view_as"       "link"
                    "link_template" "http://example.com/{{id}}"
                    "link_text"     "here is my id: {{id}}"}}}
            dash {"other_setting" {"bar" 123}
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]" {"fun_formatting" "foo"}
                   "[\"ref\",[\"field-id\",2]]" {"other_fun_formatting" 123}}}]
        (is (= {"other_setting" {"bar" 123}
                "column_settings"
                {"[\"ref\",[\"field-id\",1]]"
                 {"fun_formatting" "foo"
                  "click_behavior" {"type"             "link"
                                    "linkType"         "url"
                                    "linkTemplate"     "http://example.com/{{id}}"
                                    "linkTextTemplate" "here is my id: {{id}}"}}
                 "[\"ref\",[\"field-id\",2]]"
                 {"other_fun_formatting" 123}}}
               (migrate card dash)))))
    (testing "manually updated new behavior"
      (let [card {"some_setting"        {"foo" 123}
                  "click_link_template" "http://example.com/{{col_name}}"
                  "click"               "link"}
            dash {"other_setting"  {"bar" 123}
                  "click_behavior" {"type"         "link"
                                    "linkType"     "url"
                                    "linkTemplate" "http://example.com/{{other_col_name}}"}}]
        (is (nil? (migrate card dash)))))
    (testing "Manually updated to new behavior on Column"
      (let [card {"some_setting" {"foo" 123},
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]"
                   {"view_as"                  "link"
                    "link_template"            "http://example.com/{{id}}"
                    "other_special_formatting" "currency"}
                   "[\"ref\",[\"field-id\",2]]"
                   {"view_as"              "link",
                    "link_template"        "http://example.com/{{something_else}}",
                    "other_fun_formatting" 0}}}
            dash {"other_setting" {"bar" 123}
                  "column_settings"
                  {"[\"ref\",[\"field-id\",1]]"
                   {"click_behavior"
                    {"type"         "link"
                     "linkType"     "url"
                     "linkTemplate" "http://example.com/{{id}}"}}
                   "[\"ref\",[\"field-id\",2]]"
                   {"other_fun_formatting" 123}}}]
        (is (= {"other_setting" {"bar" 123}
                "column_settings"
                {"[\"ref\",[\"field-id\",1]]"
                 {"click_behavior"
                  {"type"         "link",
                   "linkType"     "url",
                   "linkTemplate" "http://example.com/{{id}}"}}
                 "[\"ref\",[\"field-id\",2]]"
                 {"other_fun_formatting" 123,
                  "click_behavior"
                  {"type"         "link",
                   "linkType"     "url",
                   "linkTemplate" "http://example.com/{{something_else}}"}}}}
               (migrate card dash)))))
    (testing "If there is migration eligible on dash but also new style on dash, new style wins"
      (let [dash {"column_settings"
                  {"[\"ref\",[\"field-id\",4]]"
                   {"view_as"       "link"
                    "link_template" "http://old" ;; this stuff could be migrated
                    "link_text"     "old"
                    "column_title"  "column title"
                    "click_behavior"
                    {"type"             "link",
                     "linkType"         "url", ;; but there is already a new style and it wins
                     "linkTemplate"     "http://new",
                     "linkTextTemplate" "new"}}}}]
        ;; no change
        (is (nil? (migrate nil dash)))))
    (testing "flamber case"
      (let [card {"column_settings"
                  {"[\"ref\",[\"field-id\",4]]"
                   {"view_as"       "link"
                    "link_template" "http//localhost/?QCDT&{{CATEGORY}}"
                    "link_text"     "MyQCDT {{CATEGORY}}"
                    "column_title"  "QCDT Category"}
                   "[\"ref\",[\"field-id\",6]]"
                   {"view_as"       "link"
                    "column_title"  "QCDT Rating"
                    "link_text"     "Rating {{RATING}}"
                    "link_template" "http//localhost/?QCDT&{{RATING}}"
                    "prefix"        "prefix-"
                    "suffix"        "-suffix"}
                   "[\"ref\",[\"field-id\",5]]"
                   {"view_as"       nil
                    "link_text"     "QCDT was disabled"
                    "link_template" "http//localhost/?QCDT&{{TITLE}}"
                    "column_title"  "(QCDT disabled) Title"}}
                  "table.pivot_column" "CATEGORY"
                  "table.cell_column"  "PRICE"}
            dash {"table.cell_column"  "PRICE"
                  "table.pivot_column" "CATEGORY"
                  "column_settings"
                  {"[\"ref\",[\"field-id\",5]]"
                   {"view_as"       nil
                    "link_text"     "QCDT was disabled"
                    "link_template" "http//localhost/?QCDT&{{TITLE}}"
                    "column_title"  "(QCDT disabled) Title"}
                   "[\"ref\",[\"field-id\",4]]"
                   {"view_as"       "link"
                    "link_template" "http//localhost/?QCDT&{{CATEGORY}}"
                    "link_text"     "MyQCDT {{CATEGORY}}"
                    "column_title"  "QCDT Category"
                    "click_behavior"
                    {"type"             "link"
                     "linkType"         "url"
                     "linkTemplate"     "http//localhost/?CB&{{CATEGORY}}"
                     "linkTextTemplate" "MyCB {{CATEGORY}}"}}
                   "[\"ref\",[\"field-id\",6]]"
                   {"view_as"       "link"
                    "column_title"  "QCDT Rating"
                    "link_text"     "Rating {{RATING}}"
                    "link_template" "http//localhost/?QCDT&{{RATING}}"
                    "prefix"        "prefix-"
                    "suffix"        "-suffix"}}
                  "card.title"         "Table with QCDT - MANUALLY ADDED CB 37"}]
        (is (= {"card.title"         "Table with QCDT - MANUALLY ADDED CB 37"
                "column_settings"
                {"[\"ref\",[\"field-id\",4]]"
                 {"column_title"  "QCDT Category"
                  "view_as"       "link"
                  "link_template" "http//localhost/?QCDT&{{CATEGORY}}"
                  "link_text"     "MyQCDT {{CATEGORY}}"
                  "click_behavior"
                  {"type"             "link"
                   "linkType"         "url"
                   "linkTemplate"     "http//localhost/?CB&{{CATEGORY}}"
                   "linkTextTemplate" "MyCB {{CATEGORY}}"}}
                 "[\"ref\",[\"field-id\",5]]"
                 {"link_text"     "QCDT was disabled"
                  "column_title"  "(QCDT disabled) Title"
                  "link_template" "http//localhost/?QCDT&{{TITLE}}"}
                 "[\"ref\",[\"field-id\",6]]"
                 {"prefix"        "prefix-"
                  "suffix"        "-suffix"
                  "column_title"  "QCDT Rating"
                  "view_as"       "link"
                  "link_text"     "Rating {{RATING}}"
                  "link_template" "http//localhost/?QCDT&{{RATING}}"
                  "click_behavior"
                  {"type"             "link"
                   "linkType"         "url"
                   "linkTemplate"     "http//localhost/?QCDT&{{RATING}}"
                   "linkTextTemplate" "Rating {{RATING}}"}}}
                "table.cell_column"  "PRICE"
                "table.pivot_column" "CATEGORY"}
               (migrate card dash))))))
  (testing "general case"
    (let [card-vis              {"column_settings"
                                 {"[\"ref\",[\"field-id\",2]]"
                                  {"view_as"       "link",
                                   "link_template" "http://example.com/{{ID}}",
                                   "link_text"     "here's an id: {{ID}}"},
                                  "[\"ref\",[\"field-id\",6]]"
                                  {"view_as"       "link",
                                   "link_template" "http://example.com//{{id}}",
                                   "link_text"     "here is my id: {{id}}"}},
                                 "table.pivot_column"  "QUANTITY",
                                 "table.cell_column"   "DISCOUNT",
                                 "click"               "link",
                                 "click_link_template" "http://example.com/{{count}}",
                                 "graph.dimensions"    ["CREATED_AT"],
                                 "graph.metrics"       ["count"],
                                 "graph.show_values"   true}
          original-dashcard-vis {"click"            "link",
                                 "click_link_template"
                                 "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}",
                                 "graph.dimensions" ["CREATED_AT" "CATEGORY"],
                                 "graph.metrics"    ["count"]}
          fixed                 (#'migrations/fix-click-through {:id                     1,
                                                                 :card_visualization     card-vis
                                                                 :dashcard_visualization original-dashcard-vis})]
      (is (= {:id 1,
              :visualization_settings
              {"graph.dimensions"    ["CREATED_AT" "CATEGORY"],
               "graph.metrics"       ["count"],
               "click"               "link",
               "click_link_template" "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}",
               "click_behavior"
               {"type"         "link",
                "linkType"     "url",
                "linkTemplate" "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}"},
               "column_settings"
               ;; note none of this keywordizes keys in json parsing since these structures are gross as keywords
               {"[\"ref\",[\"field-id\",2]]"
                {"click_behavior"
                 {"type"             "link",
                  "linkType"         "url",
                  "linkTemplate"     "http://example.com/{{ID}}",
                  "linkTextTemplate" "here's an id: {{ID}}"}},
                "[\"ref\",[\"field-id\",6]]"
                {"click_behavior"
                 {"type"             "link",
                  "linkType"         "url",
                  "linkTemplate"     "http://example.com//{{id}}",
                  "linkTextTemplate" "here is my id: {{id}}"}}}}}
             fixed))
      (testing "won't fix if fix is already applied"
        ;; a customer got a custom script from flamber (for which this is making that fix available for everyone. See
        ;; #15014)
        (is (= nil (#'migrations/fix-click-through
                    {:id                     1
                     :card_visualization     card-vis
                     :dashcard_visualization (:visualization_settings fixed)}))))))
  (testing "ignores columns when `view_as` is null"
    (let [card-viz {"column_settings"
                    {"normal"
                     ;; this one is view_as link so we should get it
                     {"view_as"       "link",
                      "link_template" "dash",
                      "link_text"     "here's an id: {{ID}}"}
                     "null-view-as"
                     {"view_as"       nil
                      "link_template" "i should not be present",
                      "link_text"     "i should not be present"}}}
          dash-viz {}]
      (is (= ["normal"]
             (keys (get-in
                    (#'migrations/fix-click-through {:id                     1
                                                     :card_visualization     card-viz
                                                     :dashcard_visualization dash-viz})
                    [:visualization_settings "column_settings"])))))))

(deftest migrate-click-through-test
  (testing "Migrate old style click through behavior to new (#15014)"
    (let [card-vis     (json/generate-string
                        {"column_settings"
                         {"[\"ref\",[\"field-id\",2]]"
                          {"view_as"       "link",
                           "link_template" "http://example.com/{{ID}}",
                           "link_text"     "here's an id: {{ID}}"},
                          "[\"ref\",[\"field-id\",6]]"
                          {"view_as"       "link",
                           "link_template" "http://example.com//{{id}}",
                           "link_text"     "here is my id: {{id}}"}},
                         "table.pivot_column"  "QUANTITY",
                         "table.cell_column"   "DISCOUNT",
                         "click"               "link",
                         "click_link_template" "http://example.com/{{count}}",
                         "graph.dimensions"    ["CREATED_AT"],
                         "graph.metrics"       ["count"],
                         "graph.show_values"   true})
          dashcard-vis (json/generate-string
                        {"click"            "link",
                         "click_link_template"
                         "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}",
                         "graph.dimensions" ["CREATED_AT" "CATEGORY"],
                         "graph.metrics"    ["count"]})]
      (mt/with-temp* [Dashboard     [{dashboard-id :id}]
                      Card          [{card-id :id} {:visualization_settings card-vis}]
                      DashboardCard [{dashcard-id :id} {:dashboard_id           dashboard-id
                                                        :card_id                card-id
                                                        :visualization_settings dashcard-vis}]]
        (let [expected-settings {:graph.dimensions ["CREATED_AT" "CATEGORY"],
                                 :graph.metrics    ["count"],
                                 :click            "link",
                                 :click_link_template
                                 "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}"
                                 :click_behavior
                                 {:type         "link",
                                  :linkType     "url",
                                  :linkTemplate "http://localhost:3001/?year={{CREATED_AT}}&cat={{CATEGORY}}&count={{count}}"},
                                 :column_settings
                                 ;; the model keywordizes the json parsing yielding this monstrosity below
                                 {"[\"ref\",[\"field\",2,null]]"
                                  {:click_behavior
                                   {:type             "link",
                                    :linkType         "url",
                                    :linkTemplate     "http://example.com/{{ID}}",
                                    :linkTextTemplate "here's an id: {{ID}}"}},
                                  "[\"ref\",[\"field\",6,null]]"
                                  {:click_behavior
                                   {:type             "link",
                                    :linkType         "url",
                                    :linkTemplate     "http://example.com//{{id}}",
                                    :linkTextTemplate "here is my id: {{id}}"}}}}
              get-settings!     #(:visualization_settings (db/select-one DashboardCard :id dashcard-id))]
          (#'migrations/migrate-click-through)
          (is (= expected-settings (get-settings!)))
          (testing "And it is idempotent"
            (#'migrations/migrate-click-through)
            (is (= expected-settings (get-settings!)))))))))
