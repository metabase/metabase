(ns metabase-enterprise.serialization.test-util
  (:require [metabase-enterprise.serialization.names :as names]
            [metabase.models :refer [Card Collection Dashboard DashboardCard DashboardCardSeries Database Field Metric
                                     NativeQuerySnippet Pulse PulseCard Segment Table User]]
            [metabase.models.collection :as collection]
            [metabase.query-processor.store :as qp.store]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [toucan.db :as db]
            [toucan.util.test :as tt]
            [metabase-enterprise.serialization.names :refer [fully-qualified-name]]))

(def root-card-name "My Root Card \\ with a/nasty: (*) //n`me ' * ? \" < > | ŠĐž")
(def temp-db-name "Fingerprint test-data copy")

(defn temp-field [from-field-id table-id]
  (-> from-field-id
      Field
      (dissoc :id)
      (assoc :table_id table-id)))

(defn temp-table [from-tbl-id db-id]
  (-> from-tbl-id
      Table
      (dissoc :id)
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
  (db/select-one-field :id Collection :personal_owner_id (mt/user->id :crowberto)))

(defmacro with-temp-dpc
  "Wraps with-temp*, but binding `*allow-deleting-personal-collections*` to true so that temporary personal collections
  can still be deleted."
  [model-bindings & body]
  `(binding [collection/*allow-deleting-personal-collections* true]
     (tt/with-temp* ~model-bindings ~@body)))

(defmacro with-world
  "Run test in the context of a minimal Metabase instance connected to our test database."
  [& body]
  `(with-temp-dpc [Database   [{~'db-id :id} (into {:name temp-db-name} (-> (data/id)
                                                                            Database
                                                                            (dissoc :id :features :name)))]
                   Table      [{~'table-id :id :as ~'table} (temp-table (data/id :venues) ~'db-id)]
                   Table      [{~'table-id-categories :id}  (temp-table (data/id :categories) ~'db-id)]
                   Table      [{~'table-id-users :id}       (temp-table (data/id :users) ~'db-id)]
                   Table      [{~'table-id-checkins :id}    (temp-table (data/id :checkins) ~'db-id)]
                   Field      [{~'venues-pk-field-id :id}   (temp-field (data/id :venues :id) ~'table-id)]
                   Field      [{~'numeric-field-id :id}     (temp-field (data/id :venues :price) ~'table-id)]
                   Field      [{~'name-field-id :id}        (temp-field (data/id :venues :name) ~'table-id)]
                   Field      [{~'latitude-field-id :id}    (temp-field (data/id :venues :latitude) ~'table-id)]
                   Field      [{~'longitude-field-id :id}   (temp-field (data/id :venues :longitude) ~'table-id)]
                   Field      [{~'category-field-id :id}    (temp-field (data/id :venues :category_id) ~'table-id)]
                   Field      [{~'category-pk-field-id :id} (temp-field
                                                             (data/id :categories :id)
                                                             ~'table-id-categories)]
                   Field      [{~'date-field-id :id}        (temp-field (data/id :checkins :date) ~'table-id-checkins)]
                   Field      [{~'users-pk-field-id :id}    (temp-field (data/id :users :id)
                                                                        ~'table-id-users)]
                   Field      [{~'user-id-field-id :id}     (-> (temp-field (data/id :checkins :user_id)
                                                                            ~'table-id-checkins)
                                                                (assoc :fk_target_field_id ~'users-pk-field-id))]
                   Field      [{~'checkins->venues-field-id :id} (-> (temp-field (data/id :checkins :venue_id)
                                                                                 ~'table-id-checkins)
                                                                     (assoc :fk_target_field_id ~'venues-pk-field-id))]
                   Field      [{~'last-login-field-id :id}  (temp-field (data/id :users :last_login)
                                                                        ~'table-id-users)]
                   Collection [{~'collection-id :id} {:name "My Collection"}]
                   Collection [{~'collection-id-nested :id} {:name "My Nested Collection"
                                                             :location (format "/%s/" ~'collection-id)}]
                   User       [{~'user-id-temp :id} {:email          "felicia@metabase.com"
                                                     :first_name     "Felicia"
                                                     :last_name      "Temp"
                                                     :password       "fiddlesticks"}]
                   Collection [{~'personal-collection-id :id} {:name              "Felicia's Personal Collection"
                                                               :personal_owner_id ~'user-id-temp}]
                   Collection [{~'pc-felicia-nested-id :id} {:name     "Felicia's Nested Collection"
                                                             :location (format "/%d/" ~'personal-collection-id)}]
                   Collection [{~'pc-nested-id :id} {:name     "Nested Personal Collection"
                                                     :location (format "/%d/" (crowberto-pc-id))}]
                   Collection [{~'pc-deeply-nested-id :id} {:name
                                                            "Deeply Nested Personal Collection"
                                                            :location
                                                            (format "/%d/%d/" (crowberto-pc-id) ~'pc-nested-id)}]
                   Metric     [{~'metric-id :id} {:name "My Metric"
                                                  :table_id ~'table-id
                                                  :definition {:source-table ~'table-id
                                                               :aggregation [:sum [:field ~'numeric-field-id nil]]}}]
                   Segment    [{~'segment-id :id} {:name "My Segment"
                                                   :table_id ~'table-id
                                                   :definition {:source-table ~'table-id
                                                                :filter [:!= [:field ~'category-field-id nil] nil]}}]
                   Dashboard  [{~'dashboard-id :id} {:name "My Dashboard"
                                                     :collection_id ~'collection-id}]
                   Dashboard  [{~'root-dashboard-id :id} {:name "Root Dashboard"}]
                   Card       [{~'card-id :id}
                               {:table_id ~'table-id
                                :name "My Card"
                                :collection_id ~'collection-id
                                :dataset_query {:type :query
                                                :database ~'db-id
                                                :query {:source-table ~'table-id
                                                        :filter [:= [:field ~'category-field-id nil] 2]
                                                        :aggregation [:sum [:field ~'numeric-field-id nil]]
                                                        :breakout [[:field ~'category-field-id nil]]
                                                        :joins [{:source-table ~'table-id-categories
                                                                 :alias "cat"
                                                                 :fields    "all"
                                                                 :condition [:=
                                                                             [:field ~'category-field-id nil]
                                                                             [:field
                                                                              ~'category-pk-field-id
                                                                              {:join-alias "cat"}]]}]}}}]
                   Card       [{~'card-arch-id :id}
                               {;:archived true
                                :table_id ~'table-id
                                :name "My Arch Card"
                                :collection_id ~'collection-id
                                :dataset_query {:type :query
                                                :database ~'db-id
                                                :query {:source-table ~'table-id
                                                        :aggregation [:sum [:field ~'numeric-field-id nil]]
                                                        :breakout [[:field ~'category-field-id nil]]}}}]
                   Card       [{~'card-id-root :id}
                               {:table_id ~'table-id
                                ;; https://en.wikipedia.org/wiki/Filename#Reserved_characters_and_words
                                :name root-card-name
                                :dataset_query {:type :query
                                                :database ~'db-id
                                                :query {:source-table ~'table-id}
                                                :expressions {"Price Known" [:> [:field ~'numeric-field-id nil] 0]}}}]
                   Card       [{~'card-id-nested :id}
                               {:table_id ~'table-id
                                :name "My Nested Card"
                                :collection_id ~'collection-id
                                :dataset_query {:type :query
                                                :database ~'db-id
                                                :query {:source-table (str "card__" ~'card-id)}}}]
                   Card       [{~'card-id-nested-query :id}
                               {:table_id ~'table-id
                                :name "My Nested Query Card"
                                :collection_id ~'collection-id
                                :dataset_query
                                {:type :query
                                 :database ~'db-id
                                 :query
                                 {:source-query
                                  {:source-query
                                   {:source-table ~'table-id}}}}}]
                   Card       [{~'card-id-native-query :id}
                               {:query_type :native
                                :name "My Native Nested Query Card"
                                :collection_id ~'collection-id
                                :dataset_query
                                {:type :native
                                 :database ~'db-id
                                 :native
                                 {:query "SELECT * FROM {{#1}} AS subquery"
                                  :template-tags
                                  {"#1"{:id "72461b3b-3877-4538-a5a3-7a3041924517"
                                        :name "#1"
                                        :display-name "#1"
                                        :type "card"
                                        :card-id ~'card-id}}}}}]
                   DashboardCard       [{~'dashcard-id :id}
                                        {:dashboard_id ~'dashboard-id
                                         :card_id ~'card-id}]
                   DashboardCard       [{~'dashcard-top-level-click-id :id}
                                        {:dashboard_id ~'dashboard-id
                                         :card_id ~'card-id-nested
                                         ;; this is how click actions on a non-table card work (ex: a chart)
                                         :visualization_settings {:click_behavior {:targetId ~'card-id-nested-query
                                                                                   :linkType :question
                                                                                   :type     :link}}}]
                   DashboardCardSeries [~'_ {:dashboardcard_id ~'dashcard-id
                                             :card_id ~'card-id
                                             :position 0}]
                   DashboardCardSeries [~'_ {:dashboardcard_id ~'dashcard-top-level-click-id
                                             :card_id ~'card-id-nested
                                             :position 1}]
                   DashboardCard       [{~'dashcard-with-click-actions :id}
                                        {:dashboard_id           ~'dashboard-id
                                         :card_id                ~'card-id-root
                                         :visualization_settings (-> (mb.viz/visualization-settings)
                                                                     (mb.viz/with-entity-click-action
                                                                      ~'numeric-field-id
                                                                      ::mb.viz/card
                                                                      ~'card-id
                                                                      (mb.viz/fk-parameter-mapping
                                                                       "Category"
                                                                       ~'category-field-id
                                                                       ~'numeric-field-id))
                                                                     (mb.viz/with-entity-click-action
                                                                      ~'name-field-id
                                                                      ::mb.viz/dashboard
                                                                      ~'root-dashboard-id)
                                                                     (mb.viz/with-click-action
                                                                      (mb.viz/column-name->column-ref "Price Known")
                                                                      (mb.viz/url-click-action "/price-info"))
                                                                     (mb.viz/with-click-action
                                                                      (mb.viz/field-id->column-ref ~'latitude-field-id)
                                                                      (mb.viz/crossfilter-click-action {}))
                                                                     mb.viz/norm->db)}]
                   DashboardCardSeries [~'_ {:dashboardcard_id   ~'dashcard-with-click-actions
                                             :card_id            ~'card-id-root
                                             :position           2}]
                   DashboardCard       [{~'dashcard-with-textbox-id :id}
                                        {:dashboard_id           ~'dashboard-id
                                         :card_id                nil
                                         :visualization_settings {:virtual_card virtual-card
                                                                  :text         "Textbox Card"}}]
                   Card                [{~'card-id-root-to-collection :id}
                                        {:table_id ~'table-id
                                         :name "Root card based on one in collection"
                                         :dataset_query {:type :query
                                                         :database ~'db-id
                                                         :query {:source-table (str "card__" ~'card-id)}}}]
                   Card                [{~'card-id-collection-to-root :id}
                                        {:table_id ~'table-id
                                         :name "Card in collection based on root one"
                                         :collection_id ~'collection-id
                                         :dataset_query {:type :query
                                                         :database ~'db-id
                                                         :query {:source-table (str "card__" ~'card-id-root)}}}]
                   Pulse               [{~'pulse-id :id} {:name          "Serialization Pulse"
                                                          :collection_id ~'collection-id}]
                   PulseCard           [{~'pulsecard-root-id :id} {:pulse_id ~'pulse-id
                                                                   :card_id  ~'card-id-root}]
                   PulseCard           [{~'pulsecard-collection-id :id} {:pulse_id ~'pulse-id
                                                                         :card_id  ~'card-id}
                                                         :query {:source-table (str "card__" ~'card-id-root)}]
                   Card                [{~'card-id-template-tags :id}
                                        {:query_type    :native
                                         :name          "My Native Card With Template Tags"
                                         :collection_id ~'collection-id
                                         :dataset_query
                                         {:type     :native
                                          :database ~'db-id
                                          :native {:query "SELECT * FROM venues WHERE {{category-id}}"
                                                   :template-tags
                                                   {"category-id" {:id           "751880ce-ad1a-11eb-8529-0242ac130003"
                                                                   :name         "category-id"
                                                                   :display-name "Category ID"
                                                                   :type         "dimension"
                                                                   :dimension    [:field ~'category-field-id nil]
                                                                   :widget-type  "id"
                                                                   :required     true
                                                                   :default      40}}}}}]
                   Card       [{~'card-id-filter-agg :id}
                               {:table_id ~'table-id
                                :name "Card With Filter After Aggregation"
                                :collection_id ~'collection-id
                                :dataset_query {:type     :query
                                                :database ~'db-id
                                                :query    {:source-query {:source-table
                                                                          ~'table-id
                                                                          :aggregation
                                                                          [[:aggregation-options
                                                                            [:count]
                                                                            {:name "num_per_type"}]]
                                                                          :breakout
                                                                          [[:field ~'category-field-id nil]]}
                                                           :filter [:>
                                                                    [:field-literal "num_per_type" :type/Integer]
                                                                    4]}}}]
                   Card       [{~'card-id-temporal-unit :id}
                               {:table_id ~'table-id
                                :name "Card With Temporal Unit in Field Clause"
                                :collection_id ~'collection-id
                                :dataset_query {:type     :query
                                                :database ~'db-id
                                                :query    {:source-query {:source-table
                                                                          ~'table-id-checkins
                                                                          :aggregation
                                                                          [[:count]]
                                                                          :breakout
                                                                          [[:field ~'last-login-field-id {:source-field
                                                                                                          ~'user-id-field-id
                                                                                                          :temporal-unit
                                                                                                          :month}]]}}}}]
                   NativeQuerySnippet [{~'snippet-id :id}
                                       {:content     "price > 2"
                                        :description "Predicate on venues table for price > 2"
                                        :name        "Pricey Venues"}]
                   Collection         [{~'snippet-collection-id :id}
                                       {:name "Snippet Collection"
                                        :namespace "snippets"}]
                   Collection         [{~'snippet-nested-collection-id :id}
                                       {:name "Nested Snippet Collection"
                                        :location (format "/%d/" ~'snippet-collection-id)
                                        :namespace "snippets"}]
                   NativeQuerySnippet [{~'nested-snippet-id :id}
                                       {:content       "name LIKE 'A%'"
                                        :description   "Predicate on venues table for name starting with A"
                                        :name          "A Venues"
                                        :collection_id ~'snippet-nested-collection-id}]
                   Card               [{~'card-id-with-native-snippet :id}
                                       {:query_type    :native
                                        :name          "Card with Native Query Snippet"
                                        :collection_id ~'collection-id
                                        :dataset_query
                                        {:type     :native
                                         :database ~'db-id
                                         :native {:query (str "SELECT * FROM venues WHERE {{snippet: Pricey Venues}}"
                                                              " AND {{snippet: A Venues}}")
                                                  :template-tags {"snippet: Pricey Venues"
                                                                  {:id           "d34baf40-b35a-11eb-8529-0242ac130003"
                                                                   :name         "Snippet: Pricey Venues"
                                                                   :display-name "Snippet: Pricey Venues"
                                                                   :type         "snippet"
                                                                   :snippet-name "Pricey Venues"
                                                                   :snippet-id   ~'snippet-id}
                                                                  "snippet: A Venues"
                                                                  {:id           "c0775274-b45a-11eb-8529-0242ac130003"
                                                                   :name         "Snippet: A Venues"
                                                                   :display-name "Snippet: A Venues"
                                                                   :type         "snippet"
                                                                   :snippet-name "A Venues"
                                                                   :snippet-id   ~'nested-snippet-id}}}}}]
                   Card               [{~'card-join-card-id :id}
                                       {:table_id ~'table-id-checkins
                                        :name "Card Joining to Another Card"
                                        :collection_id ~'collection-id
                                        :dataset_query {:type    :query
                                                        :database ~'db-id
                                                        :query   {:source-table ~'table-id-checkins
                                                                  :joins [{:source-table (str "card__" ~'card-id-root)
                                                                           :alias        "v"
                                                                           :fields       "all"
                                                                           :condition    [:=
                                                                                          [:field
                                                                                           ~'checkins->venues-field-id
                                                                                           nil]
                                                                                          [:field
                                                                                           ~'venues-pk-field-id
                                                                                           {:join-alias "v"}]]}]}}}]]
     (qp.store/with-store ~@body)))

;; Don't memoize as IDs change in each `with-world` context
(alter-var-root #'names/path->context (fn [_] #'names/path->context*))
