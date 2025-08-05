(ns metabase-enterprise.serialization.test-util
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.names :as names]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.schema-migrations-test.impl :as schema-migrations-test.impl]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [next.jdbc]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def root-card-name "My Root Card \\ with a/nasty: (*) //n`me ' * ? \" < > | ŠĐž")
(def temp-db-name "Fingerprint test-data copy")

(defn temp-field [from-field-id table-id]
  (-> (t2/select-one :model/Field :id from-field-id)
      (dissoc :id :entity_id)
      (assoc :table_id table-id)))

(defn temp-table [from-tbl-id db-id]
  (-> (t2/select-one :model/Table :id from-tbl-id)
      (dissoc :id :entity_id)
      (update :display_name #(str "Temp " %))
      (assoc :db_id db-id)))

(def virtual-card {:name                   nil
                   :display                "text"
                   :visualization_settings {}
                   :dataset_query          {}
                   :archived               false})

(defn crowberto-pc-id
  "Gets the personal collection ID for :crowberto (needed for tests). Must be public because the `with-world` macro
  is public."
  []
  (t2/select-one-fn :id :model/Collection :personal_owner_id (mt/user->id :crowberto)))

;;; TODO -- this is a bad name, how is anyone supposed to know what this does without reading the docstring?
(defmacro with-temp-dpc
  "Wraps with-temp*, but binding `*allow-deleting-personal-collections*` to true so that temporary personal collections
  can still be deleted."
  [model-bindings & body]
  #_{:clj-kondo/ignore [:discouraged-var]}
  `(binding [collection/*allow-deleting-personal-collections* true]
     (mt/with-temp ~model-bindings ~@body)))

(defn create! [model & {:as properties}]
  (first (t2/insert-returning-instances! model (merge (mt/with-temp-defaults model) properties))))

(defn -data-source-url [^metabase.app_db.data_source.DataSource data-source]
  (.url data-source))

(defmacro with-db [data-source & body]
  `(binding [mdb.connection/*application-db* (mdb.connection/application-db :h2 ~data-source)]
     (with-open [conn# (.getConnection mdb.connection/*application-db*)]
       (binding [t2.conn/*current-connectable* conn#]
         ;; TODO mt/with-empty-h2-app-db! also rebinds some perms-group/* - do we want to do that too?
         ;;   redefs not great for parallelism
         (testing (format "\nApp DB = %s" (pr-str (-data-source-url ~data-source)))
           ~@body)))))

(defn- do-with-in-memory-h2-db [f]
  (schema-migrations-test.impl/do-with-temp-empty-app-db*
   :h2
   (fn [data-source]
     ;; DB should stay open as long as `conn` is held open.
     (with-open [_conn (.getConnection data-source)]
       (next.jdbc/execute! data-source ["RUNSCRIPT FROM ?" (str @data/h2-app-db-script)])
       (with-db data-source (mdb/finish-db-setup!))
       (f data-source)))))

(defn do-with-dbs
  "Given a function with the given arity, create an in-memory db for each argument and then call the fn with these dbs"
  [arity f]
  (if (zero? arity)
    (f)
    (recur (dec arity)
           (fn [& args]
             (do-with-in-memory-h2-db
              (fn [data-source]
                (apply f data-source args)))))))

(defmacro with-dbs
  "Create and set up in-memory H2 application databases for each symbol in the bindings vector, each of which is then
   bound to the corresponding data-source when executing the body. You can then use [[with-db]] to make any of these
   data-sources the current application database.

   This is particularly useful for load/dump/serialization tests, where you need both a source and application db."
  {:style/indent [:defn]}
  [bindings & body]
  (let [arity (count bindings)
        bindings (mapv (fn [binding]
                         (vary-meta binding assoc :tag 'javax.sql.DataSource))
                       bindings)]
    `(do-with-dbs ~arity (fn ~bindings ~@body))))

(defn random-dump-dir [prefix]
  (str (u.files/get-path (System/getProperty "java.io.tmpdir") prefix (mt/random-name))))

(defn do-with-random-dump-dir [prefix f]
  (let [dump-dir (random-dump-dir (or prefix ""))]
    (testing (format "\nDump dir = %s\n" (pr-str dump-dir))
      (try
        (f dump-dir)
        (finally
          (when (.exists (io/file dump-dir))
            (.delete (io/file dump-dir))))))))

(defmacro with-random-dump-dir {:style/indent 1} [[dump-dir-binding prefix] & body]
  `(do-with-random-dump-dir ~prefix (fn [~dump-dir-binding] ~@body)))

(defn do-with-world [f]
  (with-temp-dpc [:model/Database   {db-id :id} (into {:name temp-db-name} (-> (data/db)
                                                                               (dissoc :id :features :name :entity_id)))
                  :model/Table      {table-id :id :as table} (temp-table (data/id :venues) db-id)
                  :model/Table      {table-id-categories :id}  (temp-table (data/id :categories) db-id)
                  :model/Table      {table-id-users :id}       (temp-table (data/id :users) db-id)
                  :model/Table      {table-id-checkins :id}    (temp-table (data/id :checkins) db-id)
                  :model/Field      {venues-pk-field-id :id}   (temp-field (data/id :venues :id) table-id)
                  :model/Field      {numeric-field-id :id}     (temp-field (data/id :venues :price) table-id)
                  :model/Field      {name-field-id :id}        (temp-field (data/id :venues :name) table-id)
                  :model/Field      {latitude-field-id :id}    (temp-field (data/id :venues :latitude) table-id)
                  :model/Field      {longitude-field-id :id}   (temp-field (data/id :venues :longitude) table-id)
                  :model/Field      {category-field-id :id}    (temp-field (data/id :venues :category_id) table-id)
                  :model/Field      {category-pk-field-id :id} (temp-field
                                                                (data/id :categories :id)
                                                                table-id-categories)
                  :model/Field      {date-field-id :id}        (temp-field (data/id :checkins :date) table-id-checkins)
                  :model/Field      {users-pk-field-id :id}    (temp-field (data/id :users :id)
                                                                           table-id-users)
                  :model/Field      {user-id-field-id :id}     (-> (temp-field (data/id :checkins :user_id)
                                                                               table-id-checkins)
                                                                   (assoc :fk_target_field_id users-pk-field-id))
                  :model/Field      {checkins->venues-field-id :id} (-> (temp-field (data/id :checkins :venue_id)
                                                                                    table-id-checkins)
                                                                        (assoc :fk_target_field_id venues-pk-field-id))
                  :model/Field      {last-login-field-id :id}  (temp-field (data/id :users :last_login)
                                                                           table-id-users)
                  :model/Collection {collection-id :id} {:name "My Collection"}
                  :model/Collection {collection-id-nested :id} {:name "My Nested Collection"
                                                                :location (format "/%s/" collection-id)}
                  :model/User       {user-id-temp :id} {:email          "felicia@metabase.com"
                                                        :first_name     "Felicia"
                                                        :last_name      "Temp"
                                                        :password       "fiddlesticks"}
                  :model/Collection {personal-collection-id :id} {:name              "Felicia's Personal Collection"
                                                                  :personal_owner_id user-id-temp}
                  :model/Collection {pc-felicia-nested-id :id} {:name     "Felicia's Nested Collection"
                                                                :location (format "/%d/" personal-collection-id)}
                  :model/Collection {pc-nested-id :id} {:name     "Nested Personal Collection"
                                                        :location (format "/%d/" (crowberto-pc-id))}
                  :model/Collection {pc-deeply-nested-id :id} {:name
                                                               "Deeply Nested Personal Collection"
                                                               :location
                                                               (format "/%d/%d/" (crowberto-pc-id) pc-nested-id)}
                  :model/Segment    {segment-id :id} {:name "My Segment"
                                                      :table_id table-id
                                                      :definition {:source-table table-id
                                                                   :filter [:!= [:field category-field-id nil] nil]}}
                  :model/Dashboard  {dashboard-id :id} {:name "My Dashboard"
                                                        :collection_id collection-id}
                  :model/Dashboard  {root-dashboard-id :id} {:name "Root Dashboard"}
                  :model/Card       {card-id :id} {:table_id table-id
                                                   :name "My Card"
                                                   :collection_id collection-id
                                                   :dataset_query {:type :query
                                                                   :database db-id
                                                                   :query {:source-table table-id
                                                                           :filter [:= [:field category-field-id nil] 2]
                                                                           :aggregation [:sum [:field numeric-field-id nil]]
                                                                           :breakout [[:field category-field-id nil]]
                                                                           :joins [{:source-table table-id-categories
                                                                                    :alias "cat"
                                                                                    :fields    "all"
                                                                                    :condition [:=
                                                                                                [:field category-field-id nil]
                                                                                                [:field
                                                                                                 category-pk-field-id
                                                                                                 {:join-alias "cat"}]]}]}}}
                  :model/Card       {card-arch-id :id} {;:archived true
                                                        :table_id table-id
                                                        :name "My Arch Card"
                                                        :collection_id collection-id
                                                        :dataset_query {:type :query
                                                                        :database db-id
                                                                        :query {:source-table table-id
                                                                                :aggregation [:sum [:field numeric-field-id nil]]
                                                                                :breakout [[:field category-field-id nil]]}}}
                  :model/Card       {card-id-root :id} {:table_id table-id
                                                 ;; https://en.wikipedia.org/wiki/Filename#Reserved_characters_and_words
                                                        :name root-card-name
                                                        :dataset_query {:type :query
                                                                        :database db-id
                                                                        :query {:source-table table-id
                                                                                :expressions  {"Price Known" [:> [:field numeric-field-id nil] 0]}}}}
                  :model/Card       {card-id-nested :id} {:table_id table-id
                                                          :name "My Nested Card"
                                                          :collection_id collection-id
                                                          :dataset_query {:type :query
                                                                          :database db-id
                                                                          :query {:source-table (str "card__" card-id)}}
                                                          :visualization_settings
                                                          {:table.columns [{:name "Venue Category"
                                                                            :fieldRef [:field category-field-id nil]
                                                                            :enabled true}]
                                                           :column_settings {(keyword (format
                                                                                       "[\"ref\",[\"field\",%d,null]]"
                                                                                       latitude-field-id))
                                                                             {:show_mini_bar true
                                                                              :column_title "Parallel"}}}}
                  :model/Card       {card-id-nested-query :id} {:table_id table-id
                                                                :name "My Nested Query Card"
                                                                :collection_id collection-id
                                                                :dataset_query
                                                                {:type :query
                                                                 :database db-id
                                                                 :query
                                                                 {:source-query
                                                                  {:source-query
                                                                   {:source-table table-id}}}}}
                  :model/Card       {card-id-native-query :id} {:query_type :native
                                                                :name "My Native Nested Query Card"
                                                                :collection_id collection-id
                                                                :dataset_query
                                                                {:type :native
                                                                 :database db-id
                                                                 :native
                                                                 {:query "SELECT * FROM {{#1}} AS subquery"
                                                                  :template-tags
                                                                  {"#1" {:id "72461b3b-3877-4538-a5a3-7a3041924517"
                                                                         :name "#1"
                                                                         :display-name "#1"
                                                                         :type "card"
                                                                         :card-id card-id}}}}}
                  :model/DashboardCard       {dashcard-id :id} {:dashboard_id dashboard-id
                                                                :card_id card-id}
                  :model/DashboardCard       {dashcard-top-level-click-id :id} {:dashboard_id dashboard-id
                                                                                :card_id card-id-nested
                                                                         ;; this is how click actions on a non-table card work (ex: a chart)
                                                                                :visualization_settings {:click_behavior {:targetId card-id-nested-query
                                                                                                                          :linkType :question
                                                                                                                          :type     :link}}}
                  :model/DashboardCardSeries _ {:dashboardcard_id dashcard-id
                                                :card_id card-id
                                                :position 0}
                  :model/DashboardCardSeries _ {:dashboardcard_id dashcard-top-level-click-id
                                                :card_id card-id-nested
                                                :position 1}
                  :model/DashboardCard       {dashcard-with-click-actions :id} {:dashboard_id           dashboard-id
                                                                                :card_id                card-id-root
                                                                                :visualization_settings (-> (mb.viz/visualization-settings)
                                                                                                            (mb.viz/with-entity-click-action
                                                                                                              numeric-field-id
                                                                                                              ::mb.viz/card
                                                                                                              card-id
                                                                                                              (mb.viz/fk-parameter-mapping
                                                                                                               "Category"
                                                                                                               category-field-id
                                                                                                               numeric-field-id))
                                                                                                            (mb.viz/with-entity-click-action
                                                                                                              name-field-id
                                                                                                              ::mb.viz/dashboard
                                                                                                              root-dashboard-id
                                                                                                              nil)
                                                                                                            (mb.viz/with-click-action
                                                                                                              (mb.viz/column-name->column-ref "Price Known")
                                                                                                              (mb.viz/url-click-action "/price-info"))
                                                                                                            (mb.viz/with-click-action
                                                                                                              (mb.viz/field-id->column-ref latitude-field-id)
                                                                                                              (mb.viz/crossfilter-click-action {}))
                                                                                                            mb.viz/norm->db)}
                  :model/DashboardCardSeries _ {:dashboardcard_id   dashcard-with-click-actions
                                                :card_id            card-id-root
                                                :position           2}
                  :model/DashboardCard       {dashcard-with-textbox-id :id} {:dashboard_id           dashboard-id
                                                                             :card_id                nil
                                                                             :visualization_settings {:virtual_card virtual-card
                                                                                                      :text         "Textbox Card"}}
                  :model/Card                {card-id-root-to-collection :id} {:table_id table-id
                                                                               :name "Root card based on one in collection"
                                                                               :dataset_query {:type :query
                                                                                               :database db-id
                                                                                               :query {:source-table (str "card__" card-id)}}}
                  :model/Card                {card-id-collection-to-root :id} {:table_id table-id
                                                                               :name "Card in collection based on root one"
                                                                               :collection_id collection-id
                                                                               :dataset_query {:type :query
                                                                                               :database db-id
                                                                                               :query {:source-table (str "card__" card-id-root)}}}
                  :model/Pulse               {pulse-id :id} {:name          "Serialization Pulse"
                                                             :collection_id collection-id}
                  :model/PulseCard           {pulsecard-root-id :id} {:pulse_id pulse-id
                                                                      :card_id  card-id-root}
                  :model/PulseCard           {pulsecard-collection-id :id} {:pulse_id pulse-id
                                                                            :card_id  card-id}
                  :model/Card                {card-id-template-tags :id} {:query_type    :native
                                                                          :name          "My Native Card With Template Tags"
                                                                          :collection_id collection-id
                                                                          :dataset_query
                                                                          {:type     :native
                                                                           :database db-id
                                                                           :native {:query "SELECT * FROM venues WHERE {{category-id}}"
                                                                                    :template-tags
                                                                                    {"category-id" {:id           "751880ce-ad1a-11eb-8529-0242ac130003"
                                                                                                    :name         "category-id"
                                                                                                    :display-name "Category ID"
                                                                                                    :type         "dimension"
                                                                                                    :dimension    [:field category-field-id nil]
                                                                                                    :widget-type  "id"
                                                                                                    :required     true
                                                                                                    :default      40}}}}}
                  :model/Card       {card-id-filter-agg :id} {:table_id table-id
                                                              :name "Card With Filter After Aggregation"
                                                              :collection_id collection-id
                                                              :dataset_query {:type     :query
                                                                              :database db-id
                                                                              :query    {:source-query {:source-table
                                                                                                        table-id
                                                                                                        :aggregation
                                                                                                        [[:aggregation-options
                                                                                                          [:count]
                                                                                                          {:name "num_per_type"}]]
                                                                                                        :breakout
                                                                                                        [[:field category-field-id nil]]}
                                                                                         :filter [:>
                                                                                                  [:field-literal "num_per_type" :type/Integer]
                                                                                                  4]}}}
                  :model/Card       {card-id-temporal-unit :id} {:table_id table-id
                                                                 :name "Card With Temporal Unit in Field Clause"
                                                                 :collection_id collection-id
                                                                 :dataset_query {:type     :query
                                                                                 :database db-id
                                                                                 :query    {:source-query {:source-table
                                                                                                           table-id-checkins
                                                                                                           :aggregation
                                                                                                           [[:count]]
                                                                                                           :breakout
                                                                                                           [[:field last-login-field-id {:source-field
                                                                                                                                         user-id-field-id
                                                                                                                                         :temporal-unit
                                                                                                                                         :month}]]}}}}
                  :model/NativeQuerySnippet {snippet-id :id} {:content     "price > 2"
                                                              :description "Predicate on venues table for price > 2"
                                                              :name        "Pricey Venues"}
                  :model/Collection         {snippet-collection-id :id} {:name "Snippet Collection"
                                                                         :namespace "snippets"}
                  :model/Collection         {snippet-nested-collection-id :id} {:name "Nested Snippet Collection"
                                                                                :location (format "/%d/" snippet-collection-id)
                                                                                :namespace "snippets"}
                  :model/NativeQuerySnippet {nested-snippet-id :id} {:content       "name LIKE 'A%'"
                                                                     :description   "Predicate on venues table for name starting with A"
                                                                     :name          "A Venues"
                                                                     :collection_id snippet-nested-collection-id}
                  :model/Card               {card-id-with-native-snippet :id} {:query_type    :native
                                                                               :name          "Card with Native Query Snippet"
                                                                               :collection_id collection-id
                                                                               :dataset_query
                                                                               {:type     :native
                                                                                :database db-id
                                                                                :native {:query (str "SELECT * FROM venues WHERE {{snippet: Pricey Venues}}"
                                                                                                     " AND {{snippet: A Venues}}")
                                                                                         :template-tags {"snippet: Pricey Venues"
                                                                                                         {:id           "d34baf40-b35a-11eb-8529-0242ac130003"
                                                                                                          :name         "Snippet: Pricey Venues"
                                                                                                          :display-name "Snippet: Pricey Venues"
                                                                                                          :type         "snippet"
                                                                                                          :snippet-name "Pricey Venues"
                                                                                                          :snippet-id   snippet-id}
                                                                                                         "snippet: A Venues"
                                                                                                         {:id           "c0775274-b45a-11eb-8529-0242ac130003"
                                                                                                          :name         "Snippet: A Venues"
                                                                                                          :display-name "Snippet: A Venues"
                                                                                                          :type         "snippet"
                                                                                                          :snippet-name "A Venues"
                                                                                                          :snippet-id   nested-snippet-id}}}}}
                  :model/Card               {card-join-card-id :id} {:table_id table-id-checkins
                                                                     :name "Card Joining to Another Card"
                                                                     :collection_id collection-id
                                                                     :dataset_query {:type    :query
                                                                                     :database db-id
                                                                                     :query   {:source-table table-id-checkins
                                                                                               :joins [{:source-table (str "card__" card-id-root)
                                                                                                        :alias        "v"
                                                                                                        :fields       "all"
                                                                                                        :condition    [:=
                                                                                                                       [:field
                                                                                                                        checkins->venues-field-id
                                                                                                                        nil]
                                                                                                                       [:field
                                                                                                                        venues-pk-field-id
                                                                                                                        {:join-alias "v"}]]}]}}}
                  :model/Card               {card-id-pivot-table :id} {:table_id table-id
                                                                       :name "Pivot Table Card"
                                                                       :collection_id collection-id
                                                                       :dataset_query {:type :query
                                                                                       :database db-id
                                                                                       :query {:source-table table-id
                                                                                               :aggregation [:sum [:field latitude-field-id nil]]
                                                                                               :breakout [[:field category-field-id nil]]}}

                                                                       :visualization_settings
                                                                       {:pivot_table.column_split {:columns ["LATITUDE"]
                                                                                                   :rows    ["LONGITUDE"]
                                                                                                   :values  ["sum"]}}}]
    (f {:card-arch-id                 card-arch-id
        :card-id                      card-id
        :card-id-collection-to-root   card-id-collection-to-root
        :card-id-filter-agg           card-id-filter-agg
        :card-id-native-query         card-id-native-query
        :card-id-nested               card-id-nested
        :card-id-nested-query         card-id-nested-query
        :card-id-pivot-table          card-id-pivot-table
        :card-id-root                 card-id-root
        :card-id-root-to-collection   card-id-root-to-collection
        :card-id-template-tags        card-id-template-tags
        :card-id-temporal-unit        card-id-temporal-unit
        :card-id-with-native-snippet  card-id-with-native-snippet
        :card-join-card-id            card-join-card-id
        :category-field-id            category-field-id
        :category-pk-field-id         category-pk-field-id
        :checkins->venues-field-id    checkins->venues-field-id
        :collection-id                collection-id
        :collection-id-nested         collection-id-nested
        :dashboard-id                 dashboard-id
        :dashcard-id                  dashcard-id
        :dashcard-top-level-click-id  dashcard-top-level-click-id
        :dashcard-with-click-actions  dashcard-with-click-actions
        :dashcard-with-textbox-id     dashcard-with-textbox-id
        :date-field-id                date-field-id
        :db-id                        db-id
        :last-login-field-id          last-login-field-id
        :latitude-field-id            latitude-field-id
        :longitude-field-id           longitude-field-id
        :name-field-id                name-field-id
        :nested-snippet-id            nested-snippet-id
        :numeric-field-id             numeric-field-id
        :pc-deeply-nested-id          pc-deeply-nested-id
        :pc-felicia-nested-id         pc-felicia-nested-id
        :pc-nested-id                 pc-nested-id
        :personal-collection-id       personal-collection-id
        :pulse-id                     pulse-id
        :pulsecard-collection-id      pulsecard-collection-id
        :pulsecard-root-id            pulsecard-root-id
        :root-dashboard-id            root-dashboard-id
        :segment-id                   segment-id
        :snippet-collection-id        snippet-collection-id
        :snippet-id                   snippet-id
        :snippet-nested-collection-id snippet-nested-collection-id
        :table                        table
        :table-id                     table-id
        :table-id-categories          table-id-categories
        :table-id-checkins            table-id-checkins
        :table-id-users               table-id-users
        :user-id-field-id             user-id-field-id
        :user-id-temp                 user-id-temp
        :users-pk-field-id            users-pk-field-id
        :venues-pk-field-id           venues-pk-field-id})))

(defmacro with-world
  "Run test in the context of a minimal Metabase instance connected to our test database."
  {:style/indent 0}
  [& body]
  `(do-with-world
    (fn [{:keys ~'[card-arch-id
                   card-id
                   card-id-collection-to-root
                   card-id-filter-agg
                   card-id-native-query
                   card-id-nested
                   card-id-nested-query
                   card-id-pivot-table
                   card-id-root
                   card-id-root-to-collection
                   card-id-template-tags
                   card-id-temporal-unit
                   card-id-with-native-snippet
                   card-join-card-id
                   category-field-id
                   category-pk-field-id
                   checkins->venues-field-id
                   collection-id
                   collection-id-nested
                   dashboard-id
                   dashcard-id
                   dashcard-top-level-click-id
                   dashcard-with-click-actions
                   dashcard-with-textbox-id
                   date-field-id
                   db-id
                   last-login-field-id
                   latitude-field-id
                   longitude-field-id
                   name-field-id
                   nested-snippet-id
                   numeric-field-id
                   pc-deeply-nested-id
                   pc-felicia-nested-id
                   pc-nested-id
                   personal-collection-id
                   pulse-id
                   pulsecard-collection-id
                   pulsecard-root-id
                   root-dashboard-id
                   segment-id
                   snippet-collection-id
                   snippet-id
                   snippet-nested-collection-id
                   table
                   table-id
                   table-id-categories
                   table-id-checkins
                   table-id-users
                   user-id-field-id
                   user-id-temp
                   users-pk-field-id
                   venues-pk-field-id]}]
      ~@body)))

;; Don't memoize as IDs change in each `with-world` context
(alter-var-root #'names/path->context (fn [_] #'names/path->context*))

(defn extract-one [model-name where]
  (let [where (cond
                (nil? where)    true
                (number? where) [:= :id where]
                (string? where) [:= :entity_id where]
                :else           where)]
    (u/rfirst (serdes/extract-all model-name {:where where}))))
