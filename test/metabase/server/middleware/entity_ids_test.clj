(ns metabase.server.middleware.entity-ids-test
  "Responses with the `X-Metabase-Ids: entity` header name rows by entity ids and natural keys, never numeric ids."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(def ^:private entity-ids
  "The request options that ask for entity ids."
  {:request-options {:headers {"x-metabase-ids" "entity"}}})

(defn- venues-query
  "A query of the venues table, with at most `limit` rows when given."
  ([]
   (let [mp (mt/metadata-provider)]
     (lib/query mp (lib.metadata/table mp (mt/id :venues)))))
  ([limit]
   (lib/limit (venues-query) limit)))

(defn- get-with-entity-ids
  [user url & query-params]
  (apply mt/user-http-request user :get 200 url entity-ids query-params))

(defn- table-ref [table-id]
  (let [{:keys [db_id schema name]} (t2/select-one :model/Table :id table-id)]
    [(t2/select-one-fn :name :model/Database :id db_id) schema name]))

(defn- field-ref [field-id]
  (let [{:keys [table_id name]} (t2/select-one :model/Field :id field-id)]
    (conj (table-ref table_id) name)))

(deftest card-test
  (mt/with-temp [:model/Collection {coll-eid :entity_id coll-id :id} {:name "eid coll"}
                 :model/Card       {card-id :id card-eid :entity_id} {:collection_id coll-id
                                                                      :creator_id    (mt/user->id :crowberto)
                                                                      :dataset_query (venues-query)}]
    (testing "with the header, a Card names itself and its references by entity ids and natural keys"
      (is (=? {:id            card-eid
               :entity_id     card-eid
               :collection_id coll-eid
               :creator_id    "crowberto@metabase.com"
               :database_id   (:name (mt/db))
               :table_id      (table-ref (mt/id :venues))
               :collection    {:id coll-eid}
               :creator       {:id "crowberto@metabase.com"}}
              (get-with-entity-ids :crowberto (str "card/" card-id)))))
    (testing "without the header, nothing changes"
      (is (=? {:id card-id :collection_id coll-id :database_id (mt/id)}
              (mt/user-http-request :crowberto :get 200 (str "card/" card-id)))))))

(deftest dashboard-test
  (mt/with-temp [:model/Card                {card-id :id card-eid :entity_id}   {:dataset_query (venues-query)}
                 :model/Card                {series-id :id series-eid :entity_id} {:dataset_query (venues-query)}
                 :model/Dashboard           {dash-id :id dash-eid :entity_id}   {}
                 :model/DashboardTab        {tab-id :id tab-eid :entity_id}     {:dashboard_id dash-id :name "Tab" :position 0}
                 :model/DashboardCard       {dc-id :id dc-eid :entity_id}       {:dashboard_id     dash-id
                                                                                 :card_id          card-id
                                                                                 :dashboard_tab_id tab-id}
                 :model/DashboardCardSeries _                                   {:dashboardcard_id dc-id
                                                                                 :card_id          series-id
                                                                                 :position         0}]
    (testing "a Dashboard's tabs and dashcards, and the cards in them, name each other by entity ids"
      (is (=? {:id        dash-eid
               :tabs      [{:id tab-eid :dashboard_id dash-eid}]
               :dashcards [{:id               dc-eid
                            :dashboard_id     dash-eid
                            :dashboard_tab_id tab-eid
                            :card_id          card-eid
                            :card             {:id card-eid}
                            :series           [{:id series-eid}]}]}
              (get-with-entity-ids :crowberto (str "dashboard/" dash-id)))))))

(deftest collection-test
  (mt/with-temp [:model/Collection {parent-id :id parent-eid :entity_id} {:name "eid parent"}
                 :model/Collection {child-id :id child-eid :entity_id}   {:name "eid child" :location (str "/" parent-id "/")}
                 :model/Card       {card-eid :entity_id}                 {:collection_id child-id}
                 :model/Timeline   {timeline-eid :entity_id}             {:collection_id child-id}]
    (testing "a Collection's location names its ancestors by entity ids"
      (is (=? {:id parent-eid :location "/"}
              (get-with-entity-ids :crowberto (str "collection/" parent-id))))
      (is (=? {:id child-eid :location (str "/" parent-eid "/")}
              (get-with-entity-ids :crowberto (str "collection/" child-id)))))
    (testing "the items of a Collection name themselves by entity ids, plain-map items too"
      (is (= #{card-eid timeline-eid}
             (into #{} (map :id) (:data (get-with-entity-ids :crowberto (str "collection/" child-id "/items")))))))))

(deftest metadata-test
  (testing "a Table names itself and its Database by natural keys"
    (is (=? {:id    (table-ref (mt/id :venues))
             :db_id (:name (mt/db))
             :db    {:id (:name (mt/db))}}
            (get-with-entity-ids :crowberto (str "table/" (mt/id :venues))))))
  (testing "a Field names itself, its Table and its target by natural keys"
    (is (=? {:id                 (field-ref (mt/id :venues :category_id))
             :table_id           (table-ref (mt/id :venues))
             :fk_target_field_id (field-ref (mt/id :categories :id))}
            (get-with-entity-ids :crowberto (str "field/" (mt/id :venues :category_id))))))
  (testing "a Database names itself by its name"
    (is (=? {:id (:name (mt/db))}
            (get-with-entity-ids :crowberto (str "database/" (mt/id)))))))

(deftest rows-without-entity-ids-test
  (testing "rows of models with no entity id and no natural key keep their numeric ids"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (venues-query)}]
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:name "Renamed"})
      (is (every? (comp pos-int? :id)
                  (get-with-entity-ids :crowberto "revision" :entity "card" :id card-id)))))
  (testing "a plain map whose :id names no row is left alone"
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id]} {:type          :query
                                             :dataset_query (mt/native-query {:query "UPDATE categories SET name = {{name}} WHERE id = 1"
                                                                              :template-tags {"name" {:id "name" :name "name" :display-name "Name" :type "text"}}})
                                             :parameters    [{:id "name" :slug "name" :type "string/="}]}]
        (is (=? {:parameters [{:id "name"}]}
                (get-with-entity-ids :crowberto (str "action/" action-id))))))))

(deftest streaming-response-test
  (testing "a streaming response, a query's results, is not touched"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (venues-query 1)}]
      (is (=? {:status "completed" :row_count 1}
              (mt/user-http-request :crowberto :post 202 (format "card/%d/query" card-id) entity-ids))))))

(deftest only-superusers-test
  (mt/with-temp [:model/Card {card-id :id} {:dataset_query (venues-query)}]
    (testing "a non-admin's response keeps its numeric ids: references name rows, such as Users by email, that the
              caller may not be allowed to see"
      (mt/with-full-data-perms-for-all-users!
        (is (=? {:id card-id :creator_id pos-int?}
                (mt/user-http-request :rasta :get 200 (str "card/" card-id) entity-ids)))))
    (testing "an anonymous public request gets the same response as without the header"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (let [uuid (str (random-uuid))]
          (t2/update! :model/Card :id card-id {:public_uuid uuid :made_public_by_id (mt/user->id :crowberto)})
          (is (= (client/client :get 200 (str "public/card/" uuid))
                 (client/client :get 200 (str "public/card/" uuid) entity-ids))))))))

(deftest structures-test
  (testing "the ids inside a structure column, such as a query, are refs, as serialization exports the column"
    (let [price-ref (field-ref (mt/id :venues :price))]
      (mt/with-temp [:model/Card          {card-id :id card-eid :entity_id} {:dataset_query (venues-query)}
                     :model/Dashboard     {dash-id :id}                     {:parameters [{:id   "p1"
                                                                                           :slug "price"
                                                                                           :name "Price"
                                                                                           :type "category"}]}
                     :model/DashboardCard _                                 {:dashboard_id       dash-id
                                                                             :card_id            card-id
                                                                             :parameter_mappings [{:parameter_id "p1"
                                                                                                   :card_id      card-id
                                                                                                   :target       [:dimension [:field (mt/id :venues :price) nil]]}]}
                     :model/DashboardCard _                                 {:dashboard_id           dash-id
                                                                             :card_id                nil
                                                                             :visualization_settings {:link {:entity {:model "card"
                                                                                                                      :id    card-id}}}}]
        (testing "a Card's query"
          (is (=? {:dataset_query {:database (:name (mt/db))
                                   :stages   [{:source-table (table-ref (mt/id :venues))}]}}
                  (get-with-entity-ids :crowberto (str "card/" card-id)))))
        (testing "a dashcard's parameter mappings and visualization settings"
          (is (=? {:dashcards [{:parameter_mappings [{:card_id card-eid
                                                      :target  ["dimension" ["field" price-ref nil]]}]}
                               {:visualization_settings {:link {:entity {:id card-eid}}}}]}
                  (get-with-entity-ids :crowberto (str "dashboard/" dash-id)))))))))

(deftest failed-rewrite-test
  (testing "a failure to rewrite a response is an API error, formatted as the others are"
    (mt/with-dynamic-fn-redefs [eid-translation/->entity-ids (fn [_] (throw (ex-info "boom" {})))]
      (is (=? {:message "boom"}
              (mt/user-http-request :crowberto :get 500 (str "database/" (mt/id)) entity-ids))))))

(deftest references-of-rows-without-entity-ids-test
  (testing "a row of a model with entity ids names the rows it references by their refs"
    (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :venues :category_id)
                                       :human_readable_field_id (mt/id :categories :name)
                                       :type                    :external
                                       :name                    "Category"}]
      (is (=? {:dimensions [{:field_id                (field-ref (mt/id :venues :category_id))
                             :human_readable_field_id (field-ref (mt/id :categories :name))}]}
              (get-with-entity-ids :crowberto (str "field/" (mt/id :venues :category_id))))))))

(deftest hydrated-plain-maps-test
  (mt/with-temp [:model/Collection {parent-id :id parent-eid :entity_id} {}
                 :model/Collection {child-id :id}                         {:location (str "/" parent-id "/")}
                 :model/Dashboard  {dash-id :id dash-eid :entity_id}      {:collection_id child-id}
                 :model/Card       {card-id :id}                          {:dashboard_id  dash-id
                                                                           :collection_id child-id
                                                                           :dataset_query (venues-query)}]
    (testing "a Collection's effective location names its ancestors by entity ids"
      (is (=? {:effective_location (str "/" parent-eid "/")}
              (get-with-entity-ids :crowberto (str "collection/" child-id)))))
    (testing "a plain map hydrated under a reference column's name is a row of that column's model"
      (is (=? {:dashboard_id dash-eid
               :dashboard    {:id dash-eid}}
              (get-with-entity-ids :crowberto (str "card/" card-id)))))))

(deftest other-models-test
  (mt/with-temp [:model/Collection          {coll-id :id coll-eid :entity_id}         {}
                 :model/Card                {card-id :id card-eid :entity_id}         {:type          :model
                                                                                       :collection_id coll-id
                                                                                       :dataset_query (venues-query)}
                 :model/Timeline            {timeline-id :id timeline-eid :entity_id} {:collection_id coll-id}
                 :model/TimelineEvent       {event-id :id event-eid :entity_id}       {:timeline_id timeline-id}
                 :model/Segment             {segment-id :id segment-eid :entity_id}   {}
                 :model/Document            {document-id :id document-eid :entity_id} {:collection_id coll-id}
                 :model/NativeQuerySnippet  {snippet-id :id snippet-eid :entity_id}   {:creator_id (mt/user->id :crowberto)}
                 :model/Measure             {measure-id :id measure-eid :entity_id}   {}]
    (doseq [[url expected] [[(str "timeline/" timeline-id "?include=events")
                             {:id timeline-eid :collection_id coll-eid :events [{:id event-eid :timeline_id timeline-eid}]}]
                            [(str "timeline-event/" event-id)    {:id event-eid :timeline_id timeline-eid}]
                            [(str "segment/" segment-id)         {:id       segment-eid
                                                                  :table_id (table-ref (t2/select-one-fn :table_id :model/Segment :id segment-id))}]
                            [(str "measure/" measure-id)         {:id       measure-eid
                                                                  :table_id (table-ref (t2/select-one-fn :table_id :model/Measure :id measure-id))}]
                            [(str "document/" document-id)       {:id document-eid :collection_id coll-eid}]
                            [(str "native-query-snippet/" snippet-id) {:id         snippet-eid
                                                                       :creator_id "crowberto@metabase.com"}]]]
      (testing url
        (is (=? expected (get-with-entity-ids :crowberto url)))))
    (testing "an Action names its model by entity id"
      (mt/with-actions-enabled
        (mt/with-temp [:model/Action {action-id :id action-eid :entity_id} {:type :implicit :model_id card-id}]
          (is (=? {:id action-eid :model_id card-eid}
                  (get-with-entity-ids :crowberto (str "action/" action-id)))))))
    (testing "the results of a search name their rows and the Collections holding them by entity ids"
      (is (=? [{:id card-eid :collection {:id coll-eid}}]
              (filter #(= "dataset" (:model %))
                      (:data (get-with-entity-ids :crowberto "search" :search_engine "in-place"
                                                  :q (t2/select-one-fn :name :model/Card :id card-id)))))))
    (testing "a list of Cards names each by entity id"
      (is (some #{card-eid} (map :id (get-with-entity-ids :crowberto "card" :f "all")))))))

(deftest recents-test
  (testing "a recent item, whose model is a keyword, names itself and its references by entity ids and natural keys"
    (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}
                   :model/Card       {card-id :id card-eid :entity_id} {:collection_id coll-id :dataset_query (venues-query)}]
      (mt/user-http-request :crowberto :post 204 "activity/recents" {:context :selection :model "card" :model_id card-id})
      (is (=? {:id card-eid :database_id (:name (mt/db)) :parent_collection {:id coll-eid}}
              (m/find-first #(= card-eid (:entity_id %))
                            (:recents (get-with-entity-ids :crowberto "activity/recents" :context "selections"))))))))

(deftest field-values-test
  (testing "the values of a Field, a plain map, name the Field by its natural key"
    (is (=? {:field_id (field-ref (mt/id :venues :price))}
            (get-with-entity-ids :crowberto (str "field/" (mt/id :venues :price) "/values"))))))

(defn- restore!
  "Exports the `rows` of each `[model rows]` of `model-rows`, deletes them, and loads them back in order, so that each
  has a new numeric id and the same entity id, as a git-sync restore on another instance would."
  [model-rows]
  (let [exported (mapv (fn [[model rows]] [model (into [] (serialization/export model rows))]) model-rows)]
    (doseq [[model rows] (reverse model-rows)]
      (t2/delete! model :id [:in (map :id rows)]))
    (doseq [[model entities] exported]
      (serialization/load model entities))))

(defn- id-of [model eid]
  (t2/select-one-pk model :entity_id eid))

(defn- without-timestamps
  "`body` without its timestamps, the keys ending in `_at`, which a restore sets anew."
  [body]
  (walk/postwalk (fn [x]
                   (if (map? x)
                     (into {} (remove (fn [[k _]] (and (keyword? k) (str/ends-with? (name k) "_at")))) x)
                     x))
                 body))

(deftest restored-instance-test
  (testing "the responses of an instance and of its restore, whose rows have new numeric ids, are the same but for
            their timestamps"
    (mt/with-model-cleanup [:model/Collection :model/Card :model/Dashboard]
      (let [coll   (t2/insert-returning-instance! :model/Collection {:name "eid restore"})
            card   (mt/user-http-request :crowberto :post 200 "card" {:name                   "eid restore card"
                                                                      :collection_id          (:id coll)
                                                                      :display                :table
                                                                      :dataset_query          (venues-query)
                                                                      :visualization_settings {}})
            dash   (t2/insert-returning-instance! :model/Dashboard {:name          "eid restore dash"
                                                                    :collection_id (:id coll)
                                                                    :creator_id    (mt/user->id :crowberto)
                                                                    :parameters    []})
            _      (t2/insert! :model/DashboardCard {:dashboard_id (:id dash) :card_id (:id card)
                                                     :row 0 :col 0 :size_x 4 :size_y 4})
            fetch  (fn []
                     (without-timestamps
                      {:collection (get-with-entity-ids :crowberto (str "collection/" (id-of :model/Collection (:entity_id coll))))
                       :card       (get-with-entity-ids :crowberto (str "card/" (id-of :model/Card (:entity_id card))))
                       :dashboard  (get-with-entity-ids :crowberto (str "dashboard/" (id-of :model/Dashboard (:entity_id dash))))}))
            before (fetch)]
        (testing "the last edit of a Card names its User by email"
          (is (=? {:id "crowberto@metabase.com"}
                  (get-in before [:card :last-edit-info]))))
        (restore! [[:model/Collection [coll]]
                   [:model/Card [(t2/select-one :model/Card :id (:id card))]]
                   [:model/Dashboard [dash]]])
        (is (not= (:id card) (id-of :model/Card (:entity_id card))))
        ;; serialization does not restore Revisions, from which the last edit comes
        (is (= (update before :card dissoc :last-edit-info)
               (fetch)))))))

(defn- put-with-entity-ids
  [user url body]
  (mt/user-http-request user :put 200 url entity-ids body))

(deftest write-back-to-restored-instance-test
  (testing "a body read with entity ids from an instance writes the same rows of its restore, by entity id"
    (mt/with-model-cleanup [:model/Collection :model/Card :model/Dashboard]
      (let [price  (mt/id :venues :price)
            coll   (t2/insert-returning-instance! :model/Collection {:name "eid write back"})
            card   (mt/user-http-request :crowberto :post 200 "card"
                                         {:name                   "eid write back card"
                                          :collection_id          (:id coll)
                                          :display                :table
                                          :dataset_query          (venues-query)
                                          :parameters             [{:id "p1" :slug "price" :name "Price" :type "category"
                                                                    :target [:dimension [:field price nil]]}]
                                          :visualization_settings {:column_settings {(str "[\"ref\",[\"field\"," price ",null]]")
                                                                                     {:column_title "Cost"}}}})
            series (mt/user-http-request :crowberto :post 200 "card"
                                         {:name                   "eid write back series"
                                          :collection_id          (:id coll)
                                          :display                :line
                                          :dataset_query          (venues-query)
                                          :visualization_settings {}})
            dash   (t2/insert-returning-instance! :model/Dashboard {:name          "eid write back dash"
                                                                    :collection_id (:id coll)
                                                                    :creator_id    (mt/user->id :crowberto)
                                                                    :parameters    [{:id "p1" :slug "price" :name "Price"
                                                                                     :type "category"}]})
            tab    (t2/insert-returning-instance! :model/DashboardTab {:dashboard_id (:id dash) :name "Tab" :position 0})
            dc     (t2/insert-returning-instance! :model/DashboardCard
                                                  {:dashboard_id       (:id dash)
                                                   :dashboard_tab_id   (:id tab)
                                                   :card_id            (:id card)
                                                   :row 0 :col 0 :size_x 4 :size_y 4
                                                   :parameter_mappings [{:parameter_id "p1"
                                                                         :card_id      (:id card)
                                                                         :target       [:dimension [:field price nil]]}]})
            _      (t2/insert! :model/DashboardCardSeries {:dashboardcard_id (:id dc) :card_id (:id series) :position 0})
            fetch  (fn []
                     (without-timestamps
                      {:card      (dissoc (get-with-entity-ids :crowberto (str "card/" (:entity_id card))) :last-edit-info)
                       :dashboard (dissoc (get-with-entity-ids :crowberto (str "dashboard/" (:entity_id dash))) :last-edit-info)}))
            before (fetch)]
        (restore! [[:model/Collection [coll]]
                   [:model/Card (t2/select :model/Card :id [:in [(:id card) (:id series)]])]
                   [:model/Dashboard [dash]]])
        (is (not= (:id dc) (id-of :model/DashboardCard (:entity_id dc))))
        (testing "a Card"
          (put-with-entity-ids :crowberto (str "card/" (:entity_id card))
                               (-> (:card before)
                                   (select-keys [:name :collection_id :display :dataset_query :parameters
                                                 :parameter_mappings :visualization_settings])
                                   (assoc :name "eid written back card"))))
        (testing "a Dashboard with its tabs, dashcards and their series"
          (put-with-entity-ids :crowberto (str "dashboard/" (:entity_id dash))
                               (-> (:dashboard before)
                                   (select-keys [:name :collection_id :parameters :tabs :dashcards])
                                   (assoc :name "eid written back dash"))))
        (testing "the rows hold what the bodies said, with the restored rows' numeric ids"
          (is (=? {:dashboard_tab_id   (id-of :model/DashboardTab (:entity_id tab))
                   :card_id            (id-of :model/Card (:entity_id card))
                   :parameter_mappings [{:card_id (id-of :model/Card (:entity_id card))
                                         :target  [:dimension [:field price nil]]}]}
                  (t2/select-one :model/DashboardCard :entity_id (:entity_id dc))))
          (is (= [(id-of :model/Card (:entity_id series))]
                 (t2/select-fn-vec :card_id :model/DashboardCardSeries
                                   :dashboardcard_id (id-of :model/DashboardCard (:entity_id dc)))))
          (is (= (-> before
                     (assoc-in [:card :name] "eid written back card")
                     (update-in [:dashboard :dashcards] (partial mapv #(assoc-in % [:card :name] "eid written back card")))
                     (assoc-in [:dashboard :name] "eid written back dash"))
                 (fetch))))))))

(deftest structure-naming-a-missing-row-test
  (testing "with the header, a structure that names a row the instance lacks is a 404"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (venues-query)}]
      (is (= "Not found."
             (mt/user-http-request :crowberto :put 404 (str "card/" card-id) entity-ids
                                   {:dataset_query {:lib/type "mbql/query"
                                                    :database "no such database"
                                                    :stages   [{:lib/type     "mbql.stage/mbql"
                                                                :source-table ["no such database" "PUBLIC" "VENUES"]}]}}))))))

(deftest structures-without-the-header-test
  (testing "without the header, a body with refs in place of a dashcard's ids is refused, as before"
    (mt/with-temp [:model/Card          {card-eid :entity_id} {:dataset_query (venues-query)}
                   :model/Dashboard     {dash-id :id}         {}]
      (is (=? {:errors {:dashcards some?}}
              (mt/user-http-request :crowberto :put 400 (str "dashboard/" dash-id)
                                    {:dashcards [{:id -1 :card_id card-eid :row 0 :col 0 :size_x 4 :size_y 4}]}))))))

(deftest other-structures-write-back-test
  (testing "with the header, the structures of Segments, Measures and Documents read from an instance write the same
            rows of its restore"
    (mt/with-model-cleanup [:model/Collection :model/Card :model/Segment :model/Measure :model/Document]
      (let [mp       (mt/metadata-provider)
            price    (lib.metadata/field mp (mt/id :venues :price))
            coll     (t2/insert-returning-instance! :model/Collection {:name "eid structures"})
            card     (mt/user-http-request :crowberto :post 200 "card" {:name                   "eid structures card"
                                                                        :collection_id          (:id coll)
                                                                        :display                :table
                                                                        :dataset_query          (venues-query)
                                                                        :visualization_settings {}})
            segment  (mt/user-http-request :crowberto :post 200 "segment"
                                           {:name "eid structures segment" :definition (lib/filter (venues-query) (lib/= price 1))})
            measure  (mt/user-http-request :crowberto :post 200 "measure"
                                           {:name "eid structures measure" :definition (lib/aggregate (venues-query) (lib/sum price))})
            ;; a link, as a write of the Document would embed a copy of an embedded Card that it does not own
            document (mt/user-http-request :crowberto :post 200 "document"
                                           {:name          "eid structures document"
                                            :collection_id (:id coll)
                                            :document      {:type    "doc"
                                                            :content [{:type    "paragraph"
                                                                       :content [{:type  "smartLink"
                                                                                  :attrs {:entityId (:id card) :model "card"}}]}]}})
            urls     {:segment  (str "segment/" (:entity_id segment))
                      :measure  (str "measure/" (:entity_id measure))
                      :document (str "document/" (:entity_id document))}
            ;; a restore counts views anew, and makes a Measure's dimensions anew, as serialization skips them
            fetch    (fn []
                       (update-vals urls #(without-timestamps
                                           (dissoc (get-with-entity-ids :crowberto %)
                                                   :last-edit-info :view_count :dimensions :dimension_mappings))))
            before   (fetch)]
        (restore! [[:model/Collection [coll]]
                   [:model/Card [(t2/select-one :model/Card :id (:id card))]]
                   [:model/Segment [(t2/select-one :model/Segment :id (:id segment))]]
                   [:model/Measure [(t2/select-one :model/Measure :id (:id measure))]]
                   [:model/Document [(t2/select-one :model/Document :id (:id document))]]])
        (is (not= (:id card) (id-of :model/Card (:entity_id card))))
        (doseq [[k body] {:segment  (assoc (select-keys (:segment before) [:definition])
                                           :name "eid written back segment" :revision_message "written back")
                          :measure  (assoc (select-keys (:measure before) [:definition])
                                           :name "eid written back measure" :revision_message "written back")
                          :document (assoc (select-keys (:document before) [:document :collection_id])
                                           :name "eid written back document")}]
          (testing k
            (put-with-entity-ids :crowberto (k urls) body)))
        (testing "the Document links to the restored Card"
          (is (= (id-of :model/Card (:entity_id card))
                 (get-in (t2/select-one-fn :document :model/Document :entity_id (:entity_id document))
                         [:content 0 :content 0 :attrs :entityId]))))
        (is (= (-> before
                   (assoc-in [:segment :name] "eid written back segment")
                   (assoc-in [:measure :name] "eid written back measure")
                   (assoc-in [:document :name] "eid written back document"))
               (fetch)))))))
