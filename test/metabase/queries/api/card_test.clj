(ns ^:mb/driver-tests metabase.queries.api.card-test
  "Tests for /api/card endpoints."
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.macro :as tools.macro]
   [dk.ative.docjure.spreadsheet :as spreadsheet]
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.api.response :as api.response]
   [metabase.api.test-util :as api.test-util]
   [metabase.config.core :as config]
   [metabase.content-verification.models.moderation-review :as moderation-review]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.notification.api.notification-test :as api.notification-test]
   [metabase.notification.test-util :as notification.tu]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.util :as perms.u]
   [metabase.queries.api.card :as api.card]
   [metabase.queries.card :as queries.card]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot.test-util :as api.pivots]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.http-client :as client]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)
   (org.apache.poi.ss.usermodel DataFormatter)))

(set! *warn-on-reflection* true)

(comment api.card/keep-me)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- count-base-type []
  (-> (mt/run-mbql-query venues {:aggregation [[:count]]}) :data :cols first :base_type))

(def card-defaults
  "The default card params."
  {:archived               false
   :collection_id          nil
   :collection_position    nil
   :collection_preview     true
   :dataset_query          {}
   :type                   "question"
   :description            nil
   :display                "scalar"
   :enable_embedding       false
   :initially_published_at nil
   :entity_id              nil
   :embedding_params       nil
   :made_public_by_id      nil
   :parameters             []
   :parameter_mappings     []
   :moderation_reviews     ()
   :public_uuid            nil
   :query_type             nil
   :cache_ttl              nil
   :average_query_time     nil
   :last_query_start       nil
   :result_metadata        nil
   :cache_invalidated_at   nil
   :view_count             0
   :archived_directly      false})

;; Used in dashboard tests
(def card-defaults-no-hydrate
  (dissoc card-defaults :average_query_time :last_query_start))

(defn mbql-count-query
  ([]
   (mbql-count-query (mt/id) (mt/id :venues)))

  ([db-or-id table-or-id]
   {:database (u/the-id db-or-id)
    :type     :query
    :query    {:source-table (u/the-id table-or-id)
               :aggregation  [[:count]]}}))

(defn pmbql-count-query
  ([]
   (pmbql-count-query (mt/id) (mt/id :venues)))

  ([db-or-id table-or-id]
   (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (u/the-id db-or-id))
         venues            (lib.metadata/table metadata-provider (u/the-id table-or-id))
         query             (lib/query metadata-provider venues)]
     (lib/aggregate query (lib/count)))))

(defn card-with-name-and-query
  ([]
   (card-with-name-and-query (mt/random-name)))

  ([card-name]
   (card-with-name-and-query card-name (mbql-count-query)))

  ([card-name query]
   {:name                   card-name
    :display                "scalar"
    :dataset_query          query
    :visualization_settings {:global {:title nil}}}))

(defn- do-with-temp-native-card!
  [f]
  (mt/with-temp [:model/Database   db    {:details (:details (mt/db)), :engine :h2}
                 :model/Table      _     {:db_id (u/the-id db), :name "CATEGORIES"}
                 :model/Card      card  {:dataset_query {:database (u/the-id db)
                                                         :type     :native
                                                         :native   {:query "SELECT COUNT(*) FROM CATEGORIES;"}}}]
    (f db card)))

(defmacro ^:private with-temp-native-card!
  {:style/indent 1}
  [[db-binding card-binding] & body]
  `(do-with-temp-native-card! (fn [~(or db-binding '_) ~(or card-binding '_)]
                                ~@body)))

(defn do-with-cards-in-a-collection! [card-or-cards-or-ids grant-perms-fn! f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection]
      ;; put all the Card(s) in our temp `collection`
      (doseq [card-or-id (if (sequential? card-or-cards-or-ids)
                           card-or-cards-or-ids
                           [card-or-cards-or-ids])]
        (t2/update! :model/Card (u/the-id card-or-id) {:collection_id (u/the-id collection)}))
      ;; now use `grant-perms-fn!` to grant appropriate perms
      (grant-perms-fn! (perms-group/all-users) collection)
      ;; call (f)
      (f))))

(defmacro with-cards-in-readable-collection!
  "Execute `body` with `card-or-cards-or-ids` added to a temporary Collection that All Users have read permissions for."
  {:style/indent 1}
  [card-or-cards-or-ids & body]
  `(do-with-cards-in-a-collection! ~card-or-cards-or-ids perms/grant-collection-read-permissions! (fn [] ~@body)))

(defmacro with-cards-in-writeable-collection!
  "Execute `body` with `card-or-cards-or-ids` added to a temporary Collection that All Users have *write* permissions
  for."
  {:style/indent 1}
  [card-or-cards-or-ids & body]
  `(do-with-cards-in-a-collection! ~card-or-cards-or-ids perms/grant-collection-readwrite-permissions! (fn [] ~@body)))

(defn- do-with-temp-native-card-with-params! [f]
  (mt/with-temp
    [:model/Database   db    {:details (:details (mt/db)), :engine :h2}
     :model/Table      _     {:db_id (u/the-id db), :name "VENUES"}
     :model/Card      card  {:dataset_query
                             {:database (u/the-id db)
                              :type     :native
                              :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE CATEGORY_ID = {{category}};"
                                         :template-tags {:category {:id           "_CATEGORY_ID_"
                                                                    :name         "category"
                                                                    :display_name "Category"
                                                                    :type         "number"
                                                                    :required     true}}}}}]
    (f db card)))

(defmacro ^:private with-temp-native-card-with-params! {:style/indent 1} [[db-binding card-binding] & body]
  `(do-with-temp-native-card-with-params! (fn [~(or db-binding '_) ~(or card-binding '_)] ~@body)))

(deftest run-query-with-parameters-test
  (testing "POST /api/card/:id/query"
    (testing "should respect `:parameters`"
      (with-temp-native-card-with-params! [{db-id :id} {card-id :id}]
        (is (=? {:database_id db-id
                 :row_count   1
                 :data        {:rows [[8]]}}
                (mt/user-http-request
                 :rasta :post 202 (format "card/%d/query" card-id)
                 {:parameters [{:type   :number
                                :target [:variable [:template-tag :category]]
                                :value  2}]})))))))

(deftest execute-card-with-default-parameters-test
  (testing "GET /api/card/:id/query with parameters with default values"
    (mt/with-temp
      [:model/Card card {:dataset_query
                         {:database (mt/id)
                          :type     :native
                          :native   {:query         "SELECT id FROM venues where {{venue_id}}"
                                     :template-tags {"venue_id" {:dimension    [:field (mt/id :venues :id) nil],
                                                                 :display-name "Venue ID",
                                                                 :id           "_VENUE_ID_",
                                                                 :name         "venue_id",
                                                                 :required     false,
                                                                 :default      [1]
                                                                 :type         :dimension,
                                                                 :widget-type  :id}}}}}]
      (let [request (fn [body]
                      (mt/user-http-request :rasta :post 202 (format "card/%d/query" (:id card)) body))]
        (testing "the default can be overridden"
          (is (= [[2]]
                 (mt/rows (request {:parameters [{:id    "_VENUE_ID_"
                                                  :target ["dimension" ["template-tag" "venue_id"]],
                                                  :type  "id"
                                                  :value 2}]})))))
        (testing "the default should apply if no param value is provided"
          (is (= [[1]]
                 (mt/rows (request {:parameters []}))))
          (testing "check this is the same result as when the default value is provided"
            (is (= [[1]]
                   (mt/rows (request {:parameters [{:id     "_VENUE_ID_",
                                                    :target ["dimension" ["template-tag" "venue_id"]],
                                                    :type   "id",
                                                    :value  1}]}))))))
        (testing "the field filter should not apply if the parameter has a nil value"
          (is (= 100 (count (mt/rows (request {:parameters [{:id     "_VENUE_ID_",
                                                             :target ["dimension" ["template-tag" "venue_id"]],
                                                             :type   "id",
                                                             :value  nil}]}))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           FETCHING CARDS & FILTERING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- card-returned? [model object-or-id card-or-id]
  (contains? (set (for [card (mt/user-http-request :rasta :get 200 "card", :f model, :model_id (u/the-id object-or-id))]
                    (u/the-id card)))
             (u/the-id card-or-id)))

(deftest filter-cards-by-db-test
  (mt/with-temp [:model/Database db {}
                 :model/Card     card-1 {:database_id (mt/id)}
                 :model/Card     card-2 {:database_id (u/the-id db)}]
    (with-cards-in-readable-collection! [card-1 card-2]
      (is (true?
           (card-returned? :database (mt/id) card-1)))
      (is (= false
             (card-returned? :database db      card-1)))
      (is (true?
           (card-returned? :database db      card-2))))))

(deftest ^:parallel authentication-test
  (is (= (get api.response/response-unauthentic :body) (client/client :get 401 "card")))
  (is (= (get api.response/response-unauthentic :body) (client/client :put 401 "card/13"))))

(deftest ^:parallel model-id-requied-when-f-is-database-test
  (is (= {:errors {:model_id "model_id is a required parameter when filter mode is 'database'"}}
         (mt/user-http-request :crowberto :get 400 "card" :f :database))))

(deftest filter-cards-by-table-test
  (testing "Filter cards by table"
    (mt/with-temp [:model/Database db {}
                   :model/Table    table-1  {:db_id (u/the-id db)}
                   :model/Table    table-2  {:db_id (u/the-id db)}
                   :model/Card     card-1   {:table_id (u/the-id table-1)}
                   :model/Card     card-2   {:table_id (u/the-id table-2)}]
      (with-cards-in-readable-collection! [card-1 card-2]
        (is (true?
             (card-returned? :table (u/the-id table-1) (u/the-id card-1))))
        (is (= false
               (card-returned? :table (u/the-id table-2) (u/the-id card-1))))
        (is (true?
             (card-returned? :table (u/the-id table-2) (u/the-id card-2))))))))

;; Make sure `model_id` is required when `f` is :table
(deftest ^:parallel model_id-requied-when-f-is-table
  (is (= {:errors {:model_id "model_id is a required parameter when filter mode is 'table'"}}
         (mt/user-http-request :crowberto :get 400 "card", :f :table))))

(deftest filter-by-archived-test
  (testing "GET /api/card?f=archived"
    (mt/with-temp [:model/Card card-1 {:name "Card 1"}
                   :model/Card card-2 {:name "Card 2"}
                   :model/Card card-3 {:name "Card 3"}]
      (with-cards-in-readable-collection! [card-1 card-2 card-3]
        (mt/user-http-request :crowberto :put 200 (format "card/%d" (u/the-id card-2)) {:archived true})
        (mt/user-http-request :crowberto :put 200 (format "card/%d" (u/the-id card-3)) {:archived true})
        (is (= #{"Card 2" "Card 3"}
               (set (map :name (mt/user-http-request :rasta :get 200 "card", :f :archived))))
            "The set of Card returned with f=archived should be equal to the set of archived cards")))))

(deftest embedding-sdk-info-saves-view-log
  (testing "GET /api/card with embedding headers set"
    (let [;; any strings will work here (must be shorter than 254 chars), but these are semi-relaistic:
          client-string (mt/random-name)
          version-string (str "1." (rand-int 1000) "." (rand-int 1000))]
      (mt/with-temp [:model/Database {database-id :id} {}
                     :model/Card card-1 {:name "Card 1" :database_id database-id}]
        (mt/with-premium-features #{:audit-app}
          (mt/user-http-request :crowberto :get 200 (str "card/" (u/the-id card-1))
                                {:request-options {:headers {"x-metabase-client" client-string
                                                             "x-metabase-client-version" version-string}}}))
        (is (= {:embedding_client client-string, :embedding_version version-string}
               (t2/select-one [:model/ViewLog :embedding_client :embedding_version] :model "card" :model_id (u/the-id card-1))))))))

(deftest embedding-sdk-info-saves-query-execution
  (testing "GET /api/card with embedding headers set"
    (mt/with-temp [:model/Card card-1 {:name "Card 1"
                                       ;; This query is just to make sure the card actually runs a query, otherwise
                                       ;; there won't be a QueryExecution record to check!
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query "select (TIMESTAMP '2023-01-01 12:34:56') as T"}}}]
      (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (u/the-id card-1))
                            {:request-options {:headers {"x-metabase-client" "client-B"
                                                         "x-metabase-client-version" "2"}}})
      (is (=? {:embedding_client "client-B", :embedding_version "2"}
              ;; The query metadata is handled asynchronously, so we need to poll until it's available:
              (tu/poll-until 100
                             (t2/select-one [:model/QueryExecution :embedding_client :embedding_version]
                                            :card_id (u/the-id card-1))))))))

(deftest filter-by-bookmarked-test
  (testing "Filter by `bookmarked`"
    (mt/with-temp [:model/Card         card-1 {:name "Card 1"}
                   :model/Card         card-2 {:name "Card 2"}
                   :model/Card         card-3 {:name "Card 3"}
                   :model/CardBookmark _ {:card_id (u/the-id card-1), :user_id (mt/user->id :rasta)}
                   :model/CardBookmark _ {:card_id (u/the-id card-2), :user_id (mt/user->id :crowberto)}]
      (with-cards-in-readable-collection! [card-1 card-2 card-3]
        (is (= [{:name "Card 1"}]
               (for [card (mt/user-http-request :rasta :get 200 "card", :f :bookmarked)]
                 (select-keys card [:name]))))))))

(deftest filter-by-using-model-segment-metric
  (mt/with-temp [:model/Database {database-id :id} {}
                 :model/Table {table-id :id} {:db_id database-id}
                 :model/Segment {segment-id :id} {:table_id table-id}
                 :model/Card {model-id :id :as model} {:name "Model"
                                                       :type :model
                                                       :dataset_query {:query {:source-table (mt/id :venues)
                                                                               :filter [:= [:field 1 nil] "1"]}}}
                 ;; matching question
                 :model/Card card-1 {:name "Card 1"
                                     :dataset_query {:query {:source-table (str "card__" model-id)
                                                             :filter [:segment segment-id]}
                                                     :database (mt/id)
                                                     :type :query}}
                 :model/Card {other-card-id :id} {}
                 ;; matching join
                 :model/Card card-3 {:name "Card 3"
                                     :dataset_query (let [alias (str "Question " model-id)]
                                                      (mt/mbql-query nil
                                                        {:joins [{:fields [[:field 35 {:join-alias alias}]]
                                                                  :source-table (str "card__" model-id)
                                                                  :condition [:=
                                                                              [:field 5 nil]
                                                                              [:field 33 {:join-alias alias}]]
                                                                  :alias alias
                                                                  :strategy :inner-join}
                                                                 {:fields       :all
                                                                  :alias        "__alias__"
                                                                  :condition    [:=
                                                                                 [:field 1 nil]
                                                                                 [:field 2 {:join-alias "__alias__"}]]
                                                                  :source-query {:source-table 1
                                                                                 :filter [:or
                                                                                          [:> [:field 1 nil] 3]
                                                                                          [:segment segment-id]]
                                                                                 :aggregation  [[:+ [:count] 1]]
                                                                                 :breakout     [[:field 4 nil]]}}]
                                                         :fields [[:field 9 nil]]
                                                         :source-table (str "card__" other-card-id)}))}
                 ;; matching native query
                 :model/Card card-4 {:name "Card 4"
                                     :dataset_query {:type :native
                                                     :native (let [model-ref (format "#%d-q1" model-id)]
                                                               {:query (format "select o.id from orders o join {{%s}} q1 on o.PRODUCT_ID = q1.PRODUCT_ID"
                                                                               model-ref)
                                                                :template-tags {model-ref
                                                                                {:id "2185b98b-20b3-65e6-8623-4fb56acb0ca7"
                                                                                 :name model-ref
                                                                                 :display-name model-ref
                                                                                 :type :card
                                                                                 :card-id model-id}}})
                                                     :database (mt/id)}}
                 ;; native query reference doesn't match
                 :model/Card card-5 {:name "Card 5"
                                     :dataset_query {:type :native
                                                     :native (let [model-ref (str "card__" model-id)
                                                                   card-id other-card-id
                                                                   card-ref (format "#%d-q1" card-id)]
                                                               {:query (format "select o.id %s from orders o join {{%s}} q1 on o.PRODUCT_ID = q1.PRODUCT_ID"
                                                                               model-ref card-ref)
                                                                :template-tags {card-ref
                                                                                {:id "2185b98b-20b3-65e6-8623-4fb56acb0ca7"
                                                                                 :name card-ref
                                                                                 :display-name card-ref
                                                                                 :type :card
                                                                                 :card-id card-id}}})
                                                     :database (mt/id)}}
                 :model/Database {other-database-id :id} {}
                 ;; database doesn't quite match
                 :model/Card card-6 {:name "Card 6", :database_id other-database-id
                                     :dataset_query {:query {:source-table (str "card__" model-id)}}}
                 ;; same as matching question, but archived
                 :model/Card card-7 {:name "Card 7"
                                     :archived true
                                     :dataset_query {:query {:source-table (str "card__" model-id)}}}]
    (testing "list cards using a model"
      (with-cards-in-readable-collection! [model card-1 card-3 card-4 card-5 card-6 card-7]
        (is (= #{"Card 1" "Card 3" "Card 4"}
               (into #{} (map :name) (mt/user-http-request :rasta :get 200 "card"
                                                           :f :using_model :model_id model-id))))
        (is (= #{"Card 1" "Card 3"}
               (into #{} (map :name) (mt/user-http-request :rasta :get 200 "card"
                                                           :f :using_segment :model_id segment-id))))))))

(deftest get-cards-with-last-edit-info-test
  (mt/with-temp [:model/Card {card-1-id :id} {:name "Card 1"}
                 :model/Card {card-2-id :id} {:name "Card 2"}]
    (with-cards-in-readable-collection! [card-1-id card-2-id]
      (doseq [user-id [(mt/user->id :rasta) (mt/user->id :crowberto)]]
        (revision/push-revision!
         {:entity       :model/Card
          :id           card-1-id
          :user-id      user-id
          :is-creation? true
          :object       {:id card-1-id}}))

      (doseq [user-id [(mt/user->id :crowberto) (mt/user->id :rasta)]]
        (revision/push-revision!
         {:entity       :model/Card
          :id           card-2-id
          :user-id      user-id
          :is-creation? true
          :object       {:id card-2-id}}))
      (let [results (m/index-by :id (mt/user-http-request :rasta :get 200 "card"))]
        (is (=? {:name           "Card 1"
                 :last-edit-info {:id         (mt/user->id :rasta)
                                  :email      "rasta@metabase.com"
                                  :first_name "Rasta"
                                  :last_name  "Toucan"
                                  :timestamp  some?}}
                (get results card-1-id)))
        (is (=? {:name           "Card 2"
                 :last-edit-info {:id         (mt/user->id :crowberto)
                                  :email      "crowberto@metabase.com"
                                  :first_name "Crowberto"
                                  :last_name  "Corv"
                                  :timestamp  some?}}
                (get results card-2-id)))))))

(deftest get-series-for-card-permission-test
  (mt/with-temp
    [:model/Card {card-id :id} {:name          "Card"
                                :display       "line"
                                :dataset_query (mt/mbql-query venues)
                                :collection_id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :crowberto))}]
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 (format "card/%d/series" card-id))))

    (is (seq? (mt/user-http-request :crowberto :get 200 (format "card/%d/series" card-id))))))

(deftest get-series-for-card-type-check-test
  (testing "400 if the card's display is not comptaible"
    (mt/with-temp
      [:model/Card {card-id :id} {:name    "Card"
                                  :display "table"}]
      (is (= "Card with type table is not compatible to have series"
             (:message (mt/user-http-request :crowberto :get 400 (format "card/%d/series" card-id)))))))

  (testing "404 if the card does not exsits"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 (format "card/%d/series" Integer/MAX_VALUE))))))

(deftest get-series-check-compatibility-test
  (let [simple-mbql-chart-query (fn [attrs]
                                  (merge (mt/card-with-source-metadata-for-query
                                          (mt/mbql-query venues {:aggregation [[:sum $venues.price]]
                                                                 :breakout    [$venues.category_id]}))
                                         {:visualization_settings {:graph.metrics    ["sum"]
                                                                   :graph.dimensions ["CATEGORY_ID"]}}
                                         attrs))]
    (mt/with-temp
      [;; comptaible cards
       :model/Card line    (simple-mbql-chart-query {:name "A Line"   :display :line})
       :model/Card bar     (simple-mbql-chart-query {:name "A Bar"    :display :bar})
       :model/Card area    (simple-mbql-chart-query {:name "An Area"  :display :area})
       :model/Card scalar  (merge (mt/card-with-source-metadata-for-query
                                   (mt/mbql-query venues {:aggregation [[:count]]}))
                                  {:name "A Scalar 1" :display :scalar})
       :model/Card scalar-2 (merge (mt/card-with-source-metadata-for-query
                                    (mt/mbql-query venues {:aggregation [[:count]]}))
                                   {:name "A Scalar 2" :display :scalar})

       :model/Card native  (merge (mt/card-with-source-metadata-for-query (mt/native-query {:query "select sum(price) from venues;"}))
                                  {:name       "A Native query"
                                   :display    :scalar
                                   :query_type "native"})
       :model/Card metric  (simple-mbql-chart-query {:name "A Metric" :type :metric :visualization_settings {} :display :line})
       :model/Card metric-2 (merge (mt/card-with-source-metadata-for-query
                                    (mt/mbql-query venues {:aggregation [[:sum $venues.price]]}))
                                   {:name "Another Metric" :type :metric :display :scalar})

       ;; compatible but user doesn't have access so should not be readble
       :model/Card _       (simple-mbql-chart-query {:name "A Line with no access"   :display :line})
       ;; incomptabile cards
       :model/Card pie     (simple-mbql-chart-query {:name "A pie" :display :pie})
       :model/Card table   (simple-mbql-chart-query {:name "A table" :display :table})
       :model/Card native-2 (merge (mt/card-with-source-metadata-for-query (mt/native-query {:query "select sum(price) from venues;"}))
                                   {:name       "A Native query table"
                                    :display    :table
                                    :query_type "native"})]
      (with-cards-in-readable-collection! [line bar area scalar scalar-2 native pie table native-2 metric metric-2]
        (doseq [:let [excluded #{"A Scalar 2" "Another Metric" "A Line with no access" "A pie" "A table" "A Native query table"}]
                [card-id display-type expected excluded]
                [[(:id line)   :line   #{"A Native query" "An Area" "A Bar" "A Metric"} excluded]
                 [(:id bar)    :bar    #{"A Native query" "An Area" "A Line" "A Metric"} excluded]
                 [(:id area)   :area   #{"A Native query" "A Bar" "A Line" "A Metric"} excluded]
                 [(:id scalar) :scalar #{"A Native query" "A Scalar 2" "Another Metric"} (disj excluded "A Scalar 2" "Another Metric")]]]
          (testing (format "Card with display-type=%s should have compatible cards correctly returned" display-type)
            (let [returned-card-names (set (map :name (mt/user-http-request :rasta :get 200 (format "/card/%d/series" card-id))))]
              (is (set/subset? expected returned-card-names))
              (is (empty? (set/intersection excluded returned-card-names)))
              (is (not (contains? returned-card-names #{"A pie" "A table" "A Line with no access"}))))))))))

(deftest paging-and-filtering-works-for-series-card-test
  (let [simple-mbql-chart-query (fn [attrs]
                                  (merge (mt/card-with-source-metadata-for-query
                                          (mt/mbql-query venues {:aggregation [[:sum $venues.price]]
                                                                 :breakout    [$venues.category_id]}))
                                         {:visualization_settings {:graph.metrics    ["sum"]
                                                                   :graph.dimensions ["CATEGORY_ID"]}}
                                         attrs))]
    (mt/with-temp
      [:model/Card card   (simple-mbql-chart-query {:name "Captain Toad" :display :line})
       :model/Card card1  (simple-mbql-chart-query {:name "Luigi 1"  :display :line})
       :model/Card _      (simple-mbql-chart-query {:name "Luigi 2"  :display :line})
       :model/Card _      (simple-mbql-chart-query {:name "Luigi 3"  :display :line})
       :model/Card card4  (simple-mbql-chart-query {:name "Luigi 4"  :display :line})
       :model/Card _      (simple-mbql-chart-query {:name "Luigi 5"  :display :line})
       :model/Card _      (simple-mbql-chart-query {:name "Luigi 6"  :display :line})
       :model/Card card7  (simple-mbql-chart-query {:name "Luigi 7"  :display :line})
       :model/Card card8  (simple-mbql-chart-query {:name "Luigi 8"  :display :line})]
      (testing "filter by name works"
        (is (true? (every? #(str/includes? % "Toad")
                           (->> (mt/user-http-request :crowberto :get 200 (format "/card/%d/series" (:id card)) :query "toad")
                                (map :name)))))

        (testing "exclude ids works"
          (testing "with single id"
            (is (true?
                 (every?
                  #(not (#{(:id card) (:id card8)} %))
                  (->> (mt/user-http-request :crowberto :get 200 (format "/card/%d/series" (:id card))
                                             :query "luigi" :exclude_ids (:id card8))
                       (map :id))))))
          (testing "with multiple ids"
            (is (true?
                 (every?
                  #(not (#{(:id card) (:id card7) (:id card8)} %))
                  (->> (mt/user-http-request :crowberto :get 200 (format "/card/%d/series" (:id card))
                                             :query "luigi" :exclude_ids (:id card7) :exclude_ids (:id card8))
                       (map :id)))))))

        (testing "with limit and sort by id descending"
          (is (= ["Luigi 8" "Luigi 7" "Luigi 6" "Luigi 5"]
                 (->> (mt/user-http-request :crowberto :get 200 (format "/card/%d/series" (:id card))
                                            :query "luigi" :limit 4)
                      (map :name))))

          (testing "and paging works too"
            (is (= ["Luigi 3" "Luigi 2" "Luigi 1"]
                   (->> (mt/user-http-request :crowberto :get 200 (format "/card/%d/series" (:id card))
                                              :query "luigi" :limit 10 :last_cursor (:id card4))
                        (map :name)))))

          (testing "And returning empty list if reaches there are nothing..."
            (is (= []
                   (->> (mt/user-http-request :crowberto :get 200 (format "/card/%d/series" (:id card))
                                              :query "luigi" :limit 10 :last_cursor (:id card1))
                        (map :name))))))))))

(def ^:private millisecond-card
  {:name                   "Card with dimension is unixtimestmap"
   :visualization_settings {:graph.dimensions ["timestamp"]
                            :graph.metrics ["severity"]}

   :display                :line
   :result_metadata        [{:base_type :type/BigInteger
                             :coercion_strategy :Coercion/UNIXMilliSeconds->DateTime
                             :effective_type :type/DateTime
                             :display_name "Timestamp"
                             :name "timestamp"
                             :unit "week"}
                            {:base_type :type/Integer
                             :display_name "count"
                             :name "severity"
                             :semantic_type :type/Number}]})

(deftest series-are-compatible-test
  (mt/dataset test-data
    (let [database-id->metadata-provider {(mt/id) (lib.metadata.jvm/application-database-metadata-provider (mt/id))}]
      (testing "area-line-bar charts"
        (mt/with-temp
          [:model/Card datetime-card       (merge (mt/card-with-source-metadata-for-query
                                                   (mt/mbql-query orders {:aggregation [[:sum $orders.total]]
                                                                          :breakout    [!month.orders.created_at]}))
                                                  {:visualization_settings {:graph.metrics    ["sum"]
                                                                            :graph.dimensions ["CREATED_AT"]}}
                                                  {:name    "datetime card"
                                                   :display :line})
           :model/Card number-card         (merge (mt/card-with-source-metadata-for-query
                                                   (mt/mbql-query orders {:aggregation [:count]
                                                                          :breakout    [$orders.quantity]}))
                                                  {:visualization_settings {:graph.metrics    ["count"]
                                                                            :graph.dimensions ["QUANTITY"]}}
                                                  {:name    "number card"
                                                   :display :line})
           :model/Card without-metric-card (merge (mt/card-with-source-metadata-for-query
                                                   (mt/mbql-query orders {:breakout    [!month.orders.created_at]}))
                                                  {:visualization_settings {:graph.dimensions ["CREATED_AT"]}}
                                                  {:name    "card has no metric"
                                                   :display :line})
           :model/Card combo-card          (merge (mt/card-with-source-metadata-for-query
                                                   (mt/mbql-query orders {:aggregation [[:sum $orders.total]]
                                                                          :breakout    [!month.orders.created_at]}))
                                                  {:visualization_settings {:graph.metrics    ["sum"]
                                                                            :graph.dimensions ["CREATED_AT"]}}
                                                  {:name    "table card"
                                                   :display :combo})]
          (testing "2 datetime cards can be combined"
            (is (true? (api.card/series-are-compatible? datetime-card datetime-card database-id->metadata-provider))))

          (testing "2 number cards can be combined"
            (is (true? (api.card/series-are-compatible? number-card number-card database-id->metadata-provider))))

          (testing "number card can't be combined with datetime cards"
            (is (false? (api.card/series-are-compatible? number-card datetime-card database-id->metadata-provider)))
            (is (false? (api.card/series-are-compatible? datetime-card number-card database-id->metadata-provider))))

          (testing "can combine series with UNIX millisecond timestamp and datetime"
            (is (true? (api.card/series-are-compatible? millisecond-card datetime-card database-id->metadata-provider)))
            (is (true? (api.card/series-are-compatible? datetime-card millisecond-card database-id->metadata-provider))))

          (testing "can't combines series with UNIX milliseceond timestamp and number"
            (is (false? (api.card/series-are-compatible? millisecond-card number-card database-id->metadata-provider)))
            (is (false? (api.card/series-are-compatible? number-card millisecond-card database-id->metadata-provider))))

          (testing "second card must has a metric"
            (is (false? (api.card/series-are-compatible? datetime-card without-metric-card database-id->metadata-provider))))

          (testing "can't combine card of any other types rather than line/bar/area"
            (is (nil? (api.card/series-are-compatible? datetime-card combo-card database-id->metadata-provider))))))

      (testing "scalar test"
        (mt/with-temp
          [:model/Card scalar-1       (merge (mt/card-with-source-metadata-for-query
                                              (mt/mbql-query venues {:aggregation [[:count]]}))
                                             {:name "A Scalar 1" :display :scalar})
           :model/Card scalar-2       (merge (mt/card-with-source-metadata-for-query
                                              (mt/mbql-query venues {:aggregation [[:count]]}))
                                             {:name "A Scalar 2" :display :scalar})

           :model/Card scalar-2-cols  (merge (mt/card-with-source-metadata-for-query
                                              (mt/mbql-query venues {:aggregation [[:count]
                                                                                   [:sum $venues.price]]}))
                                             {:name "A Scalar with 2 columns" :display :scalar})
           :model/Card line-card       (merge (mt/card-with-source-metadata-for-query
                                               (mt/mbql-query venues {:aggregation [[:sum $venues.price]]
                                                                      :breakout    [$venues.category_id]}))
                                              {:visualization_settings {:graph.metrics    ["sum"]
                                                                        :graph.dimensions ["CATEGORY_ID"]}}
                                              {:name "Line card" :display :line})]
          (testing "2 scalars with 1 column can be combined"
            (is (true? (api.card/series-are-compatible? scalar-1 scalar-2 database-id->metadata-provider))))
          (testing "can't be combined if either one of 2 cards has more than one column"
            (is (false? (api.card/series-are-compatible? scalar-1 scalar-2-cols database-id->metadata-provider)))
            (is (false? (api.card/series-are-compatible? scalar-2-cols scalar-2 database-id->metadata-provider))))

          (testing "can only be cominbed with scalar cards"
            (is (false? (api.card/series-are-compatible? scalar-1 line-card database-id->metadata-provider)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        CREATING A CARD (POST /api/card)                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel doc-test
  (testing "Make sure generated docstring resolves Malli schemas in the registry correctly (#46799)"
    (let [openapi-object             (open-api/open-api-spec (api.macros/ns-handler 'metabase.queries.api.card) "/api/card")
          schemas                    (get-in openapi-object [:components :schemas])
          body-properties            (get-in openapi-object [:paths "/api/card/" :post :requestBody :content "application/json" :schema :properties])
          _                          (is (some? body-properties))
          type-schema-ref            (some-> (get-in body-properties ["type" :$ref])
                                             (str/replace #"^#/components/schemas/" "")
                                             (str/replace #"\Q~1\E" "/"))
          _                          (is (some? type-schema-ref))
          type-schema                (get schemas type-schema-ref)
          result-metadata-schema-ref (some-> (get-in body-properties ["result_metadata" :$ref])
                                             (str/replace #"^#/components/schemas/" "")
                                             (str/replace #"\Q~1\E" "/"))
          _                          (is (some? result-metadata-schema-ref))
          result-metadata-schema     (get schemas result-metadata-schema-ref)]
      (testing 'type
        (testing (pr-str type-schema-ref)
          (is (=? {:type :string, :enum [:question :metric :model]}
                  type-schema))))
      (testing 'result_metadata
        (testing (pr-str result-metadata-schema-ref)
          (is (=? {:type        :array
                   :description "value must be an array of valid results column metadata maps."
                   :optional    true}
                  result-metadata-schema)))))))

(deftest create-a-card
  (testing "POST /api/card"
    (testing "Test that we can create a new Card"
      (mt/with-full-data-perms-for-all-users!
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (mt/with-model-cleanup [:model/Card]
              (doseq [[mbql-version query] {"MBQL" (mbql-count-query)
                                            "pMBQL" (pmbql-count-query)}]
                (testing mbql-version
                  (let [card (assoc (card-with-name-and-query (mt/random-name) query)
                                    :collection_id (u/the-id collection)
                                    :parameters [{:id "abc123", :name "test", :type "date"}]
                                    :parameter_mappings [{:parameter_id "abc123", :card_id 10,
                                                          :target       [:dimension [:template-tags "category"]]}])]
                    (is (=? (merge
                             card-defaults
                             {:name                   (:name card)
                              :collection_id          true
                              :collection             (assoc collection :is_personal false)
                              :creator_id             (mt/user->id :rasta)
                              :parameters             [{:id "abc123", :name "test", :type "date"}]
                              :parameter_mappings     [{:parameter_id "abc123", :card_id 10,
                                                        :target       ["dimension" ["template-tags" "category"]]}]
                              :dataset_query          true
                              :query_type             "query"
                              :visualization_settings {:global {:title nil}}
                              :database_id            true
                              :table_id               true
                              :entity_id              true
                              :can_write              true
                              :dashboard_count        0
                              :result_metadata        true
                              :last-edit-info         {:timestamp true :id true :first_name "Rasta"
                                                       :last_name "Toucan" :email "rasta@metabase.com"}
                              :creator                (merge
                                                       (select-keys (mt/fetch-user :rasta) [:id :date_joined :last_login :locale])
                                                       {:common_name  "Rasta Toucan"
                                                        :is_superuser false
                                                        :last_name    "Toucan"
                                                        :first_name   "Rasta"
                                                        :email        "rasta@metabase.com"})
                              :metabase_version       config/mb-version-string})
                            (-> (mt/user-http-request :rasta :post 200 "card" card)
                                (dissoc :created_at :updated_at :id)
                                (update :table_id integer?)
                                (update :database_id integer?)
                                (update :collection_id integer?)
                                (update :dataset_query map?)
                                (update :entity_id string?)
                                (update :result_metadata (partial every? map?))
                                (update :creator dissoc :is_qbnewb)
                                (update :last-edit-info (fn [edit-info]
                                                          (-> edit-info
                                                              (update :id boolean)
                                                              (update :timestamp boolean)))))))))))))))))

(deftest ^:parallel create-card-validation-test
  (testing "POST /api/card"
    (is (=? {:errors {:name                   "value must be a non-blank string."
                      :dataset_query          "Value must be a map."
                      :display                "value must be a non-blank string."
                      :visualization_settings "Value must be a map."}
             :specific-errors {:name                   ["missing required key, received: nil"]
                               :dataset_query          ["missing required key, received: nil"]
                               :display                ["missing required key, received: nil"]
                               :visualization_settings ["Value must be a map., received: \"ABC\""]}}
            (mt/user-http-request :crowberto :post 400 "card" {:visualization_settings "ABC"})))))

(deftest ^:parallel create-card-validation-test-1b
  (testing "POST /api/card"
    (is (=? {:errors {:name          "value must be a non-blank string."
                      :dataset_query "Value must be a map."
                      :parameters    "nullable sequence of parameter must be a map with :id and :type keys"
                      :display       "value must be a non-blank string."}
             :specific-errors {:name          ["missing required key, received: nil"]
                               :dataset_query ["missing required key, received: nil"]
                               :parameters    ["invalid type, received: \"abc\""]
                               :display       ["missing required key, received: nil"]}}
            (mt/user-http-request :crowberto :post 400 "card" {:visualization_settings {:global {:title nil}}
                                                               :parameters             "abc"})))))

(deftest create-card-validation-test-2
  (testing "POST /api/card"
    (with-temp-native-card-with-params! [db card]
      (testing "You cannot create a card with variables as a model"
        (is (= "A model made from a native SQL question cannot have a variable or field filter."
               (mt/user-http-request :rasta :post 400 "card"
                                     (merge
                                      (mt/with-temp-defaults :model/Card)
                                      {:type          :model
                                       :query_type    "native"
                                       :dataset_query (:dataset_query card)})))))
      (testing "You can create a card with a saved question CTE as a model"
        (mt/with-model-cleanup [:model/Card]
          (let [card-tag-name (str "#" (u/the-id card))
                dataset-query {:dataset_query {:database (u/the-id db)
                                               :type     :native
                                               :native   {:query         (format "SELECT * FROM {{%s}};" card-tag-name)
                                                          :template-tags {card-tag-name {:card-id      (u/the-id card),
                                                                                         :display-name card-tag-name,
                                                                                         :id           (str (random-uuid))
                                                                                         :name         card-tag-name,
                                                                                         :type         :card}}}}}
                {card-id :id
                 :as     created} (mt/user-http-request :rasta :post 200 "card"
                                                        (merge
                                                         (mt/with-temp-defaults :model/Card)
                                                         dataset-query))
                retrieved     (mt/user-http-request :rasta :get 200 (str "card/" card-id))]
            (is (pos-int? card-id))
            (testing "A POST returns the newly created object, so no follow-on GET is required (#34828)"
              (is (=
                   (-> created
                       (update :last-edit-info dissoc :timestamp)
                       (dissoc :collection))
                   (-> retrieved
                       (update :last-edit-info dissoc :timestamp)
                       (dissoc :collection)))))))))))

(deftest create-and-update-metric-card-validation-test
  (testing "POST /api/card"
    (let [query (pmbql-count-query)
          card-name (mt/random-name)
          card (-> (card-with-name-and-query card-name query)
                   (assoc :type :metric))
          updated-card (-> card-name
                           (card-with-name-and-query
                            (-> query
                                (lib/filter (lib/= (lib.metadata/field query (mt/id :venues :id)) 1))))
                           (assoc :type :metric))
          invalid-card (-> card-name
                           (card-with-name-and-query
                            (-> query (lib/aggregate (lib/sum (lib.metadata/field query (mt/id :venues :id))))))
                           (assoc :type :metric))]
      (mt/with-full-data-perms-for-all-users!
        (mt/with-model-cleanup [:model/Card]
          (testing "Can create a card defining a metric"
            (let [{card-id :id} (mt/user-http-request :rasta :post 200 "card"
                                                      (merge
                                                       (mt/with-temp-defaults :model/Card)
                                                       card))]
              (is (pos-int? card-id))
              (testing "Can update a card defining a metric"
                (mt/user-http-request :rasta :put 200 (str "card/" card-id)
                                      (merge
                                       (mt/with-temp-defaults :model/Card)
                                       updated-card)))
              (testing "Update fails if there are multiple aggregations"
                (let [response (mt/user-http-request :rasta :put 400 (str "card/" card-id)
                                                     (merge
                                                      (mt/with-temp-defaults :model/Card)
                                                      invalid-card))]
                  (is (= "Card of type metric is invalid, cannot be saved." response))))))
          (testing "Creation fails if there are multiple aggregations"
            (let [response (mt/user-http-request :rasta :post 400 "card"
                                                 (merge
                                                  (mt/with-temp-defaults :model/Card)
                                                  invalid-card))]
              (is (= "Card of type metric is invalid, cannot be saved." response)))))))))

(deftest create-card-disallow-setting-enable-embedding-test
  (testing "POST /api/card"
    (testing "Ignore values of `enable_embedding` while creating a Card (this must be done via `PUT /api/card/:id` instead)"
      ;; should be ignored regardless of the value of the `enable-embedding` Setting.
      (doseq [enable-embedding? [true false]]
        (mt/with-temporary-setting-values [enable-embedding-static enable-embedding?]
          (mt/with-model-cleanup [:model/Card]
            (is (=? {:enable_embedding false}
                    (mt/user-http-request :crowberto :post 200 "card" {:name                   "My Card"
                                                                       :display                :table
                                                                       :dataset_query          (mt/mbql-query venues)
                                                                       :visualization_settings {}
                                                                       :enable_embedding       true})))))))))

(deftest save-empty-card-test
  (testing "POST /api/card"
    (testing "Should be able to save an empty Card"
      (doseq [[query-description query] {"native query"
                                         (mt/native-query {:query "SELECT * FROM VENUES WHERE false;"})

                                         "MBQL query"
                                         (mt/mbql-query venues {:filter [:= $id 0]})}]
        (testing query-description
          (mt/with-model-cleanup [:model/Card]
            (testing "without result metadata"
              (is (=? {:id pos-int?}
                      (mt/user-http-request :crowberto :post 200 "card"
                                            (merge (mt/with-temp-defaults :model/Card)
                                                   {:dataset_query query})))))
            (let [card     (mt/card-with-metadata
                            (merge (mt/with-temp-defaults :model/Card)
                                   {:dataset_query query}))
                  metadata (:result_metadata card)]
              (testing (format "with result metadata\n%s" (u/pprint-to-str metadata))
                (is (some? metadata))
                (is (=? {:id pos-int?}
                        (mt/user-http-request :crowberto :post 200 "card" card)))))))))))

(deftest save-card-with-empty-result-metadata-test
  (testing "we should be able to save a Card if the `result_metadata` is *empty* (but not nil) (#9286)"
    (mt/with-model-cleanup [:model/Card]
      (let [card        (card-with-name-and-query)]
        (is (=? {:id pos-int?}
                (mt/user-http-request :crowberto
                                      :post
                                      200
                                      "card"
                                      (assoc card :result_metadata []))))))))

(deftest cache-ttl-save
  (testing "POST /api/card/:id"
    (testing "saving cache ttl by post actually saves it"
      (mt/with-model-cleanup [:model/Card]
        (let [card (card-with-name-and-query)]
          (is (= 1234
                 (:cache_ttl (mt/user-http-request :crowberto
                                                   :post
                                                   200
                                                   "card"
                                                   (assoc card :cache_ttl 1234)))))))))
  (testing "PUT /api/card/:id"
    (testing "saving cache ttl by put actually saves it"
      (mt/with-temp [:model/Card card]
        (is (= 1234
               (:cache_ttl (mt/user-http-request :crowberto
                                                 :put
                                                 200
                                                 (str "card/" (u/the-id card))
                                                 {:cache_ttl 1234}))))))
    (testing "nilling out cache ttl works"
      (mt/with-temp [:model/Card card]
        (is (= nil
               (do
                 (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:cache_ttl 1234})
                 (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:cache_ttl nil})
                 (:cache_ttl (mt/user-http-request :crowberto :get 200 (str "card/" (u/the-id card)))))))))))

(deftest saving-card-fetches-correct-metadata
  (testing "make sure when saving a Card the correct query metadata is fetched (if incorrect)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [card-name (mt/random-name)]
        (mt/with-temp [:model/Collection collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [:model/Card]
            (mt/user-http-request :crowberto :post 200 "card"
                                  (assoc (card-with-name-and-query card-name)
                                         :collection_id      (u/the-id collection)))
            (testing "check the correct metadata was fetched and was saved in the DB"
              (is (=? [{:base_type     :type/Integer
                        :display_name  "Count"
                        :name          "count"
                        :semantic_type :type/Quantity
                        :source        :aggregation
                        :field_ref     [:aggregation 0]}]
                      (t2/select-one-fn :result_metadata :model/Card :name card-name))))))))))

(defn- updating-card-updates-metadata-query []
  (mt/mbql-query venues {:fields [$id $name]}))

(defn- norm [s]
  (u/upper-case-en (:name s)))

(defn- to-native [query]
  {:database (:database query)
   :type     :native
   :native   (qp.compile/compile query)})

(deftest updating-card-updates-metadata
  (let [query          (updating-card-updates-metadata-query)
        modified-query (mt/mbql-query venues {:fields [$id $name $price]})]
    (testing "Updating query updates metadata"
      (doseq [[query-type query modified-query] [["mbql" query modified-query]
                                                 ["native" (to-native query) (to-native modified-query)]]]
        (testing (str "For: " query-type)
          (mt/with-model-cleanup [:model/Card]
            (let [{metadata :result_metadata
                   card-id  :id :as card} (mt/user-http-request
                                           :crowberto :post 200
                                           "card"
                                           (card-with-name-and-query "card-name"
                                                                     query))
                  ;; simulate a user changing the query without rerunning the query
                  updated   (mt/user-http-request
                             :crowberto :put 200 (str "card/" card-id)
                             (assoc card :dataset_query modified-query))
                  retrieved (mt/user-http-request :crowberto :get 200 (str "card/" card-id))]
              (is (= ["ID" "NAME"] (map norm metadata)))
              (is (= ["ID" "NAME" "PRICE"]
                     (map norm (t2/select-one-fn :result_metadata :model/Card :id card-id))))
              (testing "A PUT returns the updated object, so no follow-on GET is required (#34828)"
                (is (=
                     (-> updated
                         (update :last-edit-info dissoc :timestamp)
                         (dissoc :collection))
                     (-> retrieved
                         (update :last-edit-info dissoc :timestamp)
                         (dissoc :collection))))))))))))

(deftest updating-card-updates-metadata-2
  (let [query (updating-card-updates-metadata-query)]
    (testing "Updating other parts but not query does not update the metadata"
      (let [orig   @#'card.metadata/legacy-result-metadata-future
            called (atom 0)]
        (with-redefs [card.metadata/legacy-result-metadata-future (fn [q]
                                                                    (swap! called inc)
                                                                    (orig q))]
          (mt/with-model-cleanup [:model/Card]
            (let [card (mt/user-http-request :crowberto :post 200 "card"
                                             (card-with-name-and-query "card-name"
                                                                       query))]
              (is (= 1
                     @called))
              (is (=? {:result_metadata #(= ["ID" "NAME"] (map norm %))}
                      card))
              (mt/user-http-request
               :crowberto :put 200 (str "card/" (u/the-id card))
               (assoc card
                      :description "a change that doesn't change the query"
                      :name "compelling title"
                      :cache_ttl 20000
                      :display "table"
                      :collection_position 1))
              (is (= 1
                     @called)))))))))

(deftest updating-card-updates-metadata-3
  (let [query (updating-card-updates-metadata-query)]
    (testing "Patching the card _without_ the query does not clear the metadata"
      ;; in practice the application does not do this. But cypress does and it poisons the state of the frontend
      (mt/with-model-cleanup [:model/Card]
        (let [card (mt/user-http-request :crowberto :post 200 "card"
                                         (card-with-name-and-query "card-name"
                                                                   query))]
          (is (= ["ID" "NAME"] (map norm (:result_metadata card))))
          (let [updated (mt/user-http-request :crowberto :put 200 (str "card/" (:id card))
                                              {:description "I'm innocently updating the description"
                                               :type        :model})]
            (is (= ["ID" "NAME"] (map norm (:result_metadata updated))))))))))

(deftest updating-card-updates-metadata-4
  (let [query (updating-card-updates-metadata-query)]
    (testing "You can update just the metadata"
      (mt/with-model-cleanup [:model/Card]
        (let [card (mt/user-http-request :crowberto :post 200 "card"
                                         (card-with-name-and-query "card-name"
                                                                   query))]
          (is (= ["ID" "NAME"] (map norm (:result_metadata card))))
          (let [new-metadata (map #(assoc % :display_name "UPDATED") (:result_metadata card))
                updated      (mt/user-http-request :crowberto :put 200 (str "card/" (:id card))
                                                   {:result_metadata new-metadata})]
            (is (= ["UPDATED" "UPDATED"]
                   (map :display_name (:result_metadata updated))))))))))

(deftest updating-native-card-preserves-metadata
  (testing "A trivial change in a native question should not remove result_metadata (#37009)"
    (let [query (to-native (updating-card-updates-metadata-query))
          updated-query (update-in query [:native :query] str/replace #"\d+$" "1000")]
      ;; sanity check
      (is (not= query updated-query))
      ;; the actual test
      (mt/with-model-cleanup [:model/Card]
        (let [card (mt/user-http-request :rasta :post 200 "card"
                                         (card-with-name-and-query "card-name"
                                                                   query))
              metadata (:result_metadata card)]
          (is (some? metadata))
          (let [updated (mt/user-http-request :rasta :put 200 (str "card/" (:id card))
                                              {:dataset_query updated-query})]
            (is (= metadata (:result_metadata updated)))))))))

(deftest fetch-results-metadata-test
  (testing "Check that the generated query to fetch the query result metadata includes user information in the generated query"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [card-name (mt/random-name)]
        (mt/with-temp [:model/Collection collection]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [:model/Card]
            ;; Rebind the `execute-statement!` function so that we can capture the generated SQL and inspect it
            (let [orig       sql-jdbc.execute/execute-statement!
                  sql-result (atom nil)]
              (with-redefs [sql-jdbc.execute/execute-statement! (fn [driver stmt sql]
                                                                  (reset! sql-result sql)
                                                                  (orig driver stmt sql))
                            driver/query-result-metadata        (get-method driver/query-result-metadata :default)]
                (mt/user-http-request
                 :crowberto :post 200 "card"
                 (assoc (card-with-name-and-query card-name)
                        :dataset_query      (mt/native-query {:query "SELECT count(*) AS \"count\" FROM VENUES"})
                        :collection_id      (u/the-id collection))))
              (testing "check the correct metadata was fetched and was saved in the DB"
                (is (=? [{:base_type      (count-base-type)
                          :display_name   "count"
                          :name           "count"}]
                        (t2/select-one-fn :result_metadata :model/Card :name card-name))))
              (testing "Was the user id found in the generated SQL?"
                (is (string? @sql-result))
                (when-some [s @sql-result]
                  (is (re-find (re-pattern (str "userID: " (mt/user->id :crowberto)))
                               s)))))))))))

(deftest create-card-with-collection-position
  (testing "Make sure we can create a Card with a Collection position"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [card-name (mt/random-name)]
        (mt/with-temp [:model/Collection collection]
          (mt/with-model-cleanup [:model/Card]
            (is (=? {:collection_id       (u/the-id collection)
                     :collection_position 1
                     :name                card-name}
                    (mt/user-http-request :crowberto :post 200 "card"
                                          (assoc (card-with-name-and-query card-name)
                                                 :collection_id (u/the-id collection), :collection_position 1))))
            (is (=? {:collection_id       (u/the-id collection)
                     :collection_position 1}
                    (t2/select-one :model/Card :name card-name)))))))))

(deftest need-permission-for-collection
  (testing "You need to have Collection permissions to create a Card in a Collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [card-name (mt/random-name)]
        (mt/with-temp [:model/Collection collection]
          (mt/with-model-cleanup [:model/Card]
            (mt/user-http-request :rasta :post 403 "card"
                                  (assoc (card-with-name-and-query card-name)
                                         :collection_id (u/the-id collection)
                                         :collection_position 1))
            (is (nil? (some-> (t2/select-one [:model/Card :collection_id :collection_position] :name card-name)
                              (update :collection_id (partial = (u/the-id collection))))))))))))

(deftest create-card-check-adhoc-query-permissions-test
  (testing (str "Ad-hoc query perms should be required to save a Card -- otherwise people could save arbitrary "
                "queries, then run them.")
    ;; create a copy of the test data warehouse DB, then revoke permissions to it for All Users. Only admins should be
    ;; able to ad-hoc query it now.
    (mt/with-temp-copy-of-db
      (mt/with-no-data-perms-for-all-users!
        (let [query        (mt/mbql-query venues)
              create-card! (fn [test-user expected-status-code]
                             (mt/with-model-cleanup [:model/Card]
                               (mt/user-http-request test-user :post expected-status-code "card"
                                                     (merge (mt/with-temp-defaults :model/Card) {:dataset_query query}))))]
          (testing "admin should be able to save a Card if All Users doesn't have ad-hoc data perms"
            (is (some? (create-card! :crowberto 200))))
          (testing "non-admin should get an error"
            (testing "Permissions errors should be meaningful and include info for debugging (#14931)"
              (is (malli= [:map
                           [:message        [:= "You cannot save this Question because you do not have permissions to run its query."]]
                           [:query          [:= {} (mt/obj->json->obj query)]]
                           [:required-perms :map]
                           [:actual-perms   [:sequential perms.u/PathSchema]]
                           [:trace          [:sequential :any]]]
                          (create-card! :rasta 403))))))))))

(deftest ^:parallel create-card-with-type-and-dataset-test
  (t2/with-transaction [_]
    (testing "can create a model using type"
      (is (=? {:type "model"}
              (mt/user-http-request :crowberto :post 200 "card" (assoc (card-with-name-and-query (mt/random-name))
                                                                       :type :model)))))
    (testing "default is a question"
      (is (=? {:type "question"}
              (mt/user-http-request :crowberto :post 200 "card" (card-with-name-and-query (mt/random-name))))))))

(deftest create-card-with-metric-type
  (mt/with-model-cleanup [:model/Card]
    (testing "can create a metric card"
      (is (=? {:type "metric"}
              (mt/user-http-request :crowberto :post 200 "card" (assoc (card-with-name-and-query (mt/random-name))
                                                                       :type "metric")))))))

(deftest update-card-with-type-and-dataset-test
  (testing "can toggle model using only type"
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query orders
                                                      {:fields [$id $subtotal $created_at]})}]
      (let [base-metadata [{:id    (mt/id :orders :id)
                            :name  "ID"}
                           {:id    (mt/id :orders :subtotal)
                            :name  "SUBTOTAL"}
                           {:id    (mt/id :orders :created_at)
                            :name  "CREATED_AT"}]]
        (is (=? {:type            "question"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :get 200 (str "card/" (:id card))))
            "initial result_metadata is inferred correctly")

        (is (=? {:type            "model"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:type "model"})))
        (is (=? {:type            "question"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:type "question"})))))))

(deftest update-card-with-type-and-dataset-test-2-native-query
  (testing "can toggle model using only type for a native query"
    (mt/with-temp [:model/Card card (mt/card-with-metadata
                                     {:dataset_query
                                      (mt/native-query {:query "SELECT id, subtotal, created_at FROM orders"})})]
      (let [base-metadata [{:name      "ID"
                            :field_ref ["field" "ID" {:base-type "type/BigInteger"}]}
                           {:name      "SUBTOTAL"
                            :field_ref ["field" "SUBTOTAL" {:base-type "type/Float"}]}
                           {:name      "CREATED_AT"
                            :field_ref ["field" "CREATED_AT" {:base-type string?}]}]]
        (is (=? {:type            "question"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :get 200 (str "card/" (:id card))))
            "initial result_metadata is inferred correctly")

        (is (=? {:type            "model"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:type "model"})))
        (is (=? {:type            "question"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:type "question"})))))))

(deftest update-native-card-with-changed-columns-test
  (testing "metadata is recomputed correctly when the query changes"
    (mt/with-temp [:model/Card card (mt/card-with-metadata
                                     {:dataset_query
                                      (mt/native-query {:query "SELECT id, subtotal, created_at FROM orders"})})]
      (let [base-metadata [{:name      "ID"
                            :field_ref ["field" "ID" {:base-type "type/BigInteger"}]}
                           {:name      "SUBTOTAL"
                            :field_ref ["field" "SUBTOTAL" {:base-type "type/Float"}]}
                           {:name      "CREATED_AT"
                            :field_ref ["field" "CREATED_AT" {:base-type string?}]}]]
        (is (=? {:type            "question"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :get 200 (str "card/" (:id card))))
            "initial result_metadata is inferred correctly")

        (is (=? {:type            "model"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :put 200 (str "card/" (:id card))
                                      (assoc card :type "model"))))
        (is (=? {:type            "question"
                 :result_metadata base-metadata}
                (mt/user-http-request :crowberto :put 200 (str "card/" (:id card)) {:type "question"})))))))

(deftest update-card-with-metric-type
  (testing "can update a metric"
    (mt/with-temp [:model/Card card {:dataset_query (mbql-count-query)
                                     :type "metric"}]
      (is (=? {:dataset_query {:query {:source-table (mt/id :checkins)}}
               :type    "metric"}
              (mt/user-http-request :crowberto :put 200 (str "card/" (:id card))
                                    {:dataset_query (mbql-count-query (mt/id) (mt/id :checkins))}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    COPYING A CARD (POST /api/card/:id/copy)                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest copy-card
  (testing "POST /api/card/:id/copy"
    (testing "Test that we can copy a Card"
      (mt/with-full-data-perms-for-all-users!
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (mt/with-model-cleanup [:model/Card]
              (let [card    (assoc (card-with-name-and-query (mt/random-name)
                                                             (mbql-count-query (mt/id) (mt/id :venues)))
                                   :collection_id (u/the-id collection))
                    card    (mt/user-http-request :rasta :post 200 "card" card)
                    newcard (mt/user-http-request :rasta :post 200 (format "card/%d/copy" (u/the-id card)))]
                (is (= (:name newcard) (str "Copy of " (:name card))))
                (is (= (:display newcard) (:display card)))
                (is (not= (:id newcard) (:id card)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            FETCHING A SPECIFIC CARD                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-card-test
  (testing "GET /api/card/:id"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       card {:collection_id (u/the-id collection)
                                             :dataset_query (mt/mbql-query venues)}]
        (testing "You have to have Collection perms to fetch a Card"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "card/" (u/the-id card))))))

        (testing "Should be able to fetch the Card if you have Collection read perms"
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (is (=? (merge
                   card-defaults
                   (select-keys card [:id :name :entity_id :created_at :updated_at :last_used_at])
                   {:dashboard_count        0
                    :parameter_usage_count  0
                    :creator_id             (mt/user->id :rasta)
                    :creator                (merge
                                             (select-keys (mt/fetch-user :rasta) [:id :date_joined :last_login])
                                             {:common_name  "Rasta Toucan"
                                              :is_superuser false
                                              :is_qbnewb    true
                                              :last_name    "Toucan"
                                              :first_name   "Rasta"
                                              :email        "rasta@metabase.com"})
                    :dataset_query          (mt/obj->json->obj (:dataset_query card))
                    :display                "table"
                    :query_type             "query"
                    :visualization_settings {}
                    :can_write              false
                    :database_id            (mt/id) ; these should be inferred from the dataset_query
                    :table_id               (mt/id :venues)
                    :collection_id          (u/the-id collection)
                    :collection             (into {:is_personal false} collection)
                    :result_metadata        (mt/obj->json->obj (:result_metadata card))
                    :metabase_version       config/mb-version-string})
                  (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card))))))
        (testing "Card should include last edit info if available"
          (mt/with-temp [:model/User     {user-id :id} {:first_name "Test" :last_name "User" :email "user@test.com"}
                         :model/Revision _             {:model    "Card"
                                                        :model_id (:id card)
                                                        :user_id  user-id
                                                        :object   (revision/serialize-instance card (:id card) card)}]
            (is (= {:id true :email "user@test.com" :first_name "Test" :last_name "User" :timestamp true}
                   (-> (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card)))
                       mt/boolean-ids-and-timestamps
                       :last-edit-info)))))
        (testing "Card should include moderation reviews"
          (letfn [(clean [mr] (-> mr
                                  (update :user #(select-keys % [:id]))
                                  (select-keys [:status :text :user])))]
            (mt/with-temp [:model/ModerationReview review {:moderated_item_id   (:id card)
                                                           :moderated_item_type "card"
                                                           :moderator_id        (mt/user->id :rasta)
                                                           :most_recent         true
                                                           :status              "verified"
                                                           :text                "lookin good"}]
              (is (= [(clean (assoc review :user {:id true}))]
                     (->> (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card)))
                          mt/boolean-ids-and-timestamps
                          :moderation_reviews
                          (map clean)))))))))))

(deftest fetch-card-entity-id-test
  (testing "GET /api/card/:id with entity ID"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       card {:collection_id (u/the-id collection)
                                             :dataset_query (mt/mbql-query venues)}]
        (testing "Should be able to fetch a Card using entity ID when you have Collection read perms"
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (is (=? {:name (:name card)}
                  (mt/user-http-request :rasta :get 200 (str "card/" (:entity_id card))))))))))

(deftest card-query-metadata-entity-id-test
  (testing "GET /api/card/:id/query_metadata with entity ID"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       card {:collection_id (u/the-id collection)
                                             :dataset_query (mt/mbql-query venues)}]
        (testing "Should be able to get query metadata using entity ID when you have Collection read perms"
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (is (map? (mt/user-http-request :rasta :get 200 (str "card/" (:entity_id card) "/query_metadata")))))))))

(deftest run-query-entity-id-test
  (testing "POST /api/card/:card-id/query with entity ID"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       card {:collection_id (u/the-id collection)
                                             :dataset_query (mt/mbql-query venues)}]
        (testing "Should be able to run query using entity ID when you have Collection read perms"
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (is (map? (mt/user-http-request :rasta :post 202 (str "card/" (:entity_id card) "/query")))))))))

(deftest ^:parallel fetch-card-404-test
  (testing "GET /api/card/:id"
    (is (= "Not found."
           (mt/user-http-request :crowberto :get 404 (format "card/%d" Integer/MAX_VALUE))))))

(deftest fetch-card-with-metric-type
  (testing "can fetch a metric card"
    (mt/with-temp [:model/Card card {:dataset_query (mbql-count-query)
                                     :type "metric"}]
      (is (=? {:type "metric"}
              (mt/user-http-request :crowberto :get 200 (str "card/" (u/the-id card))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       UPDATING A CARD (PUT /api/card/:id)
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel updating-a-card-that-doesnt-exist-should-give-a-404
  (is (= "Not found."
         (mt/user-http-request :crowberto :put 404 (format "card/%d" Integer/MAX_VALUE) {}))))

(deftest test-that-we-can-edit-a-card
  (mt/with-temp [:model/Card card {:name "Original Name"}]
    (with-cards-in-writeable-collection! card
      (is (= "Original Name"
             (t2/select-one-fn :name :model/Card, :id (u/the-id card))))
      (is (= {:timestamp true, :first_name "Rasta", :last_name "Toucan", :email "rasta@metabase.com", :id true}
             (-> (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:name "Updated Name"})
                 mt/boolean-ids-and-timestamps
                 :last-edit-info)))
      (is (= "Updated Name"
             (t2/select-one-fn :name :model/Card, :id (u/the-id card)))))))

(deftest can-we-update-a-card-s-archived-status-
  (mt/with-temp [:model/Card card]
    (with-cards-in-writeable-collection! card
      (let [archived?     (fn [] (:archived (t2/select-one :model/Card :id (u/the-id card))))
            set-archived! (fn [archived]
                            (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:archived archived})
                            (archived?))]
        (is (= false
               (archived?)))
        (is (true?
             (set-archived! true)))
        (is (= false
               (set-archived! false)))))))

(deftest we-shouldn-t-be-able-to-archive-cards-if-we-don-t-have-collection--write--perms
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection  collection {}
                   :model/Card card {:collection_id (u/the-id collection)}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card)) {:archived true}))))))

(deftest we-shouldn-t-be-able-to-unarchive-cards-if-we-don-t-have-collection--write--perms
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection  collection {}
                   :model/Card card {:collection_id (u/the-id collection) :archived true}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card)) {:archived false}))))))

(deftest clear-description-test
  (testing "Can we clear the description of a Card? (#4738)"
    (mt/with-temp [:model/Card card {:description "What a nice Card"}]
      (with-cards-in-writeable-collection! card
        (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:description nil})
        (is (nil? (t2/select-one-fn :description :model/Card :id (u/the-id card))))))))

(deftest description-should-be-blankable-as-well
  (mt/with-temp [:model/Card card {:description "What a nice Card"}]
    (with-cards-in-writeable-collection! card
      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:description ""})
      (is (= ""
             (t2/select-one-fn :description :model/Card :id (u/the-id card)))))))

(deftest update-card-parameters-test
  (testing "PUT /api/card/:id"
    (mt/with-temp [:model/Card card]
      (testing "successfully update with valid parameters"
        (is (partial= {:parameters [{:id   "random-id"
                                     :type "number"}]}
                      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                            {:parameters [{:id   "random-id"
                                                           :type "number"}]})))))

    (mt/with-temp [:model/Card card {:parameters [{:id   "random-id"
                                                   :type "number"}]}]
      (testing "nil parameters will no-op"
        (is (partial= {:parameters [{:id   "random-id"
                                     :type "number"}]}
                      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                            {:parameters nil}))))
      (testing "an empty list will remove parameters"
        (is (partial= {:parameters []}
                      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                            {:parameters []})))))))

(deftest update-card-parameter-mappings-test
  (testing "PUT /api/card/:id"
    (mt/with-temp [:model/Card card]
      (testing "successfully update with valid parameter_mappings"
        (is (partial= {:parameter_mappings [{:parameter_id "abc123", :card_id 10,
                                             :target ["dimension" ["template-tags" "category"]]}]}
                      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                            {:parameter_mappings [{:parameter_id "abc123", :card_id 10,
                                                                   :target ["dimension" ["template-tags" "category"]]}]})))))

    (mt/with-temp [:model/Card card {:parameter_mappings [{:parameter_id "abc123", :card_id 10,
                                                           :target ["dimension" ["template-tags" "category"]]}]}]
      (testing "nil parameters will no-op"
        (is (partial= {:parameter_mappings [{:parameter_id "abc123", :card_id 10,
                                             :target ["dimension" ["template-tags" "category"]]}]}
                      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                            {:parameters nil}))))
      (testing "an empty list will remove parameter_mappings"
        (is (partial= {:parameter_mappings []}
                      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                            {:parameter_mappings []})))))))

(deftest update-embedding-params-test
  (testing "PUT /api/card/:id"
    (mt/with-temp [:model/Card card]
      (testing "If embedding is disabled, even an admin should not be allowed to update embedding params"
        (mt/with-temporary-setting-values [enable-embedding-static false]
          (is (= "Embedding is not enabled."
                 (mt/user-http-request :crowberto :put 400 (str "card/" (u/the-id card))
                                       {:embedding_params {:abc "enabled"}})))))

      (mt/with-temporary-setting-values [enable-embedding-static true]
        (testing "Non-admin should not be allowed to update Card's embedding parms"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                                       {:embedding_params {:abc "enabled"}}))))

        (testing "Admin should be able to update Card's embedding params"
          (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card))
                                {:embedding_params {:abc "enabled"}})
          (is (= {:abc "enabled"}
                 (t2/select-one-fn :embedding_params :model/Card :id (u/the-id card)))))))))

(deftest can-we-change-the-collection-position-of-a-card-
  (mt/with-temp [:model/Card card]
    (with-cards-in-writeable-collection! card
      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                            {:collection_position 1})
      (is (= 1
             (t2/select-one-fn :collection_position :model/Card :id (u/the-id card)))))))

(deftest can-we-change-the-collection-preview-flag-of-a-card-
  (mt/with-temp [:model/Card card]
    (with-cards-in-writeable-collection! card
      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                            {:collection_preview false})
      (is (= false
             (t2/select-one-fn :collection_preview :model/Card :id (u/the-id card)))))))

(deftest ---and-unset--unpin--it-as-well-
  (mt/with-temp [:model/Card card {:collection_position 1}]
    (with-cards-in-writeable-collection! card
      (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                            {:collection_position nil})
      (is (= nil
             (t2/select-one-fn :collection_position :model/Card :id (u/the-id card)))))))

(deftest ---we-shouldn-t-be-able-to-if-we-don-t-have-permissions-for-the-collection
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection  collection {}
                   :model/Card card {:collection_id (u/the-id collection)}]
      (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                            {:collection_position 1})
      (is (= nil
             (t2/select-one-fn :collection_position :model/Card :id (u/the-id card)))))))

(deftest gets-a-card
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection  collection {}
                   :model/Card card {:collection_id (u/the-id collection), :collection_position 1}]
      (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                            {:collection_position nil})
      (is (= 1
             (t2/select-one-fn :collection_position :model/Card :id (u/the-id card)))))))

(deftest update-card-validation-test
  (testing "PUT /api/card"
    (with-temp-native-card-with-params! [_db card]
      (testing  "You cannot update a model to have variables"
        (is (= "A model made from a native SQL question cannot have a variable or field filter."
               (mt/user-http-request :rasta :put 400 (format "card/%d" (:id card)) {:type :model})))))))

(deftest ^:parallel turn-card-to-model-change-display-test
  (mt/with-temp [:model/Card card {:display :line}]
    (is (=? {:display "table"}
            (mt/user-http-request :crowberto :put 200 (str "card/" (:id card))
                                  {:type :model}))))

  (mt/with-temp [:model/Card card {:display :line}]
    (is (=? {:display "table"}
            (mt/user-http-request :crowberto :put 200 (str "card/" (:id card))
                                  {:type "model"})))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Updating the positions of stuff                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- name->position [results]
  (zipmap (map :name results)
          (map :collection_position results)))

(defn get-name->collection-position
  "Call the collection endpoint for `collection-id` as `user-kwd`. Will return a map with the names of the items as
  keys and their position as the value"
  [user-kwd collection-or-collection-id]
  (name->position (:data (mt/user-http-request user-kwd :get 200
                                               (format "collection/%s/items" (u/the-id collection-or-collection-id))))))

(defmacro with-ordered-items
  "Macro for creating many sequetial collection_position model instances, putting each in `collection`"
  {:style/indent :defn}
  [collection model-and-name-syms & body]
  `(mt/with-temp ~(vec (mapcat (fn [idx [model-instance name-sym]]
                                 [model-instance name-sym {:name                (name name-sym)
                                                           :collection_id       `(u/the-id ~collection)
                                                           :collection_position idx}])
                               (iterate inc 1)
                               (partition-all 2 model-and-name-syms)))
     (testing (format "\nWith ordered items in Collection %d: %s"
                      (u/the-id ~collection)
                      ~(str/join ", " (for [[model symb] (partition-all 2 model-and-name-syms)]
                                        (format "%s %s" (name model) (name symb)))))
       ~@body)))

(deftest check-to-make-sure-we-can-move-a-card-in-a-collection-of-just-cards
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection]
      (with-ordered-items collection [:model/Card a
                                      :model/Card b
                                      :model/Card c
                                      :model/Card d]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id c))
                              {:collection_position 1})
        (is (= {"c" 1
                "a" 2
                "b" 3
                "d" 4}
               (get-name->collection-position :rasta collection)))))))

(deftest add-new-card-update-positions-test
  (testing "POST /api/card"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (doseq [{:keys [message position expected]}
                [{:message  (str "Add a new card to an existing collection at position 1, will cause all existing "
                                 "positions to increment by 1")
                  :position 1
                  :expected {"d" 1
                             "a" 2
                             "b" 3
                             "c" 4}}
                 {:message  "Add new card in the middle, should only increment positions of objects that come after"
                  :position 2
                  :expected {"a" 1
                             "d" 2
                             "b" 3
                             "c" 4}}
                 {:message  "Add new card to end, shouldn't affect positions of other objects"
                  :position 4
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "d" 4}}
                 {:message  (str "When adding a new Card to a Collection that does not have a position, it should not "
                                 "change positions of other objects")
                  :position nil
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "d" nil}}]]
          (testing (str "\n" message)
            (with-ordered-items collection [:model/Dashboard a
                                            :model/Pulse     b
                                            :model/Card      c]
              (testing "Original collection, before adding the new card"
                (is (= {"a" 1
                        "b" 2
                        "c" 3}
                       (get-name->collection-position :crowberto collection))))
              (mt/with-model-cleanup [:model/Card]
                (mt/user-http-request :crowberto :post 200 "card"
                                      (merge (card-with-name-and-query "d")
                                             {:collection_id       (u/the-id collection)
                                              :collection_position position}))
                (is (= expected
                       (get-name->collection-position :rasta collection)))))))))))

(deftest move-existing-card-update-positions-test
  (testing "PUT /api/card/:id"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (doseq [{:keys [message position expected]}
                [{:message  "Move existing Card to front"
                  :position 1
                  :expected {"d" 1
                             "a" 2
                             "b" 3
                             "c" 4
                             "e" 5
                             "f" 6}}
                 {:message  "Move existing Card to end"
                  :position 6
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "e" 4
                             "f" 5
                             "d" 6}}
                 {:message  (str "When setting Collection position to nil, positions of other things should be adjusted "
                                 "accordingly")
                  :position nil
                  :expected {"a" 1
                             "b" 2
                             "c" 3
                             "e" 4
                             "f" 5
                             "d" nil}}]]
          (testing (str "\n" message)
            (with-ordered-items collection [:model/Dashboard a
                                            :model/Dashboard b
                                            :model/Card      c
                                            :model/Card      d
                                            :model/Pulse     e
                                            :model/Pulse     f]
              (testing "Original collection, before moving the Card"
                (is (= {"a" 1
                        "b" 2
                        "c" 3
                        "d" 4
                        "e" 5
                        "f" 6}
                       (get-name->collection-position :crowberto collection))))
              (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id d))
                                    {:collection_position position, :collection_id (u/the-id collection)})
              (is (= expected
                     (get-name->collection-position :rasta collection))))))))))

(deftest give-existing-card-a-position-test
  (testing "Give an existing Card without a `:collection_position` a position, and things should be adjusted accordingly"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection  {coll-id :id :as collection} {}
                     :model/Card _ {:name "a", :collection_id coll-id, :collection_position 1}
                     ;; Card b does not start with a collection_position
                     :model/Card b {:name "b", :collection_id coll-id}
                     :model/Dashboard   _ {:name "c", :collection_id coll-id, :collection_position 2}
                     :model/Card _ {:name "d", :collection_id coll-id, :collection_position 3}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id b))
                              {:collection_position 2})
        (is (= {"a" 1
                "b" 2
                "c" 3
                "d" 4}
               (get-name->collection-position :rasta coll-id)))))))

(deftest change-collections-update-positions-test
  (testing (str "Change the Collection the Card is in, leave the position, should cause old and new collection to have "
                "their positions updated")
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection-1 {}
                     :model/Collection collection-2] {}
        (with-ordered-items collection-1 [:model/Dashboard a
                                          :model/Card      b
                                          :model/Pulse     c
                                          :model/Dashboard d]
          (with-ordered-items collection-2 [:model/Pulse     e
                                            :model/Card      f
                                            :model/Card      g
                                            :model/Dashboard h]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-1)
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-2)
            (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id f))
                                  {:collection_id (u/the-id collection-1)})
            (testing "Dest collection should get updated positions"
              (is (= {"a" 1
                      "f" 2
                      "b" 3
                      "c" 4
                      "d" 5}
                     (get-name->collection-position :rasta collection-1))))
            (testing "Original collection should get updated positions"
              (is (= {"e" 1
                      "g" 2
                      "h" 3}
                     (get-name->collection-position :rasta collection-2))))))))))

(deftest change-both-collection-and-position-test
  (testing "Change the collection and the position, causing both collections and the updated card to have their order changed"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection-1 {}
                     :model/Collection collection-2] {}
        (with-ordered-items collection-1 [:model/Pulse     a
                                          :model/Pulse     b
                                          :model/Dashboard c
                                          :model/Dashboard d]
          (with-ordered-items collection-2 [:model/Dashboard e
                                            :model/Dashboard f
                                            :model/Pulse     g
                                            :model/Card      h]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-1)
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-2)
            (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id h))
                                  {:collection_position 1, :collection_id (u/the-id collection-1)})
            (is (= {"h" 1
                    "a" 2
                    "b" 3
                    "c" 4
                    "d" 5}
                   (get-name->collection-position :rasta collection-1)))
            (is (= {"e" 1
                    "f" 2
                    "g" 3}
                   (get-name->collection-position :rasta collection-2)))))))))

(deftest update-card-check-adhoc-query-permissions-test
  (testing (str "Ad-hoc query perms should be required to update the query for a Card -- otherwise people could save "
                "arbitrary queries, then run them.")
    ;; create a copy of the test data warehouse DB, then revoke permissions to it for All Users. Only admins should be
    ;; able to ad-hoc query it now.
    (mt/with-temp-copy-of-db
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
          (let [update-card! (fn [test-user expected-status-code request-body]
                               (mt/user-http-request test-user :put expected-status-code (format "card/%d" card-id)
                                                     request-body))]
            (testing "\nadmin"
              (testing "*should* be allowed to update query"
                (is (=? {:id            card-id
                         :dataset_query (mt/obj->json->obj (mt/mbql-query checkins))}
                        (update-card! :crowberto 200 {:dataset_query (mt/mbql-query checkins)})))))

            (testing "\nnon-admin"
              (testing "should be allowed to update fields besides query"
                (is (=? {:id   card-id
                         :name "Updated name"}
                        (update-card! :rasta 200 {:name "Updated name"}))))

              (testing "should *not* be allowed to update query"
                (testing "Permissions errors should be meaningful and include info for debugging (#14931)"
                  (is (malli= [:map
                               [:message        [:= "You cannot save this Question because you do not have permissions to run its query."]]
                               [:query          [:= {} (mt/obj->json->obj (mt/mbql-query users))]]
                               [:required-perms :map]
                               [:actual-perms   [:sequential perms.u/PathSchema]]
                               [:trace          [:sequential :any]]]
                              (update-card! :rasta 403 {:dataset_query (mt/mbql-query users)}))))
                (testing "make sure query hasn't changed in the DB"
                  (is (= (mt/mbql-query checkins)
                         (t2/select-one-fn :dataset_query :model/Card :id card-id)))))

              (testing "should be allowed to update other fields if query is passed in but hasn't changed (##11719)"
                (is (=? {:id            card-id
                         :name          "Another new name"
                         :dataset_query (mt/obj->json->obj (mt/mbql-query checkins))}
                        (update-card! :rasta 200 {:name "Another new name", :dataset_query (mt/mbql-query checkins)})))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Card updates that impact alerts                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest alert-deletion-test
  (doseq [{:keys [message card deleted? expected-email-re f]}
          [{:message           "Archiving a Card should trigger Alert deletion"
            :deleted?          true
            :expected-email-re #"Alerts about [A-Za-z]+ \(#\d+\) have stopped because the question was archived by Rasta Toucan"
            :f                 (fn [card]
                                 (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:archived true}))}
           {:message           "Validate changing a display type triggers alert deletion"
            :card              {:display :table}
            :deleted?          true
            :expected-email-re #"Alerts about <a href=\"https?://[^\/]+\/question/\d+\">([^<]+)<\/a> have stopped because the question was edited by Rasta Toucan"
            :f                 (fn [card]
                                 (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:display :line}))}
           {:message           "Changing the display type from line to table should force a delete"
            :card              {:display :line}
            :deleted?          true
            :expected-email-re #"Alerts about <a href=\"https?://[^\/]+\/question/\d+\">([^<]+)<\/a> have stopped because the question was edited by Rasta Toucan"
            :f                 (fn [card]
                                 (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:display :table}))}
           {:message           "Removing the goal value will trigger the alert to be deleted"
            :card              {:display                :line
                                :visualization_settings {:graph.goal_value 10}}
            :deleted?          true
            :expected-email-re #"Alerts about <a href=\"https?://[^\/]+\/question/\d+\">([^<]+)<\/a> have stopped because the question was edited by Rasta Toucan"
            :f                 (fn [card]
                                 (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card)) {:visualization_settings {:something "else"}}))}
           {:message           "Adding an additional breakout does not cause the alert to be removed if no goal is set"
            :card              {:display                :line
                                :visualization_settings {}
                                :dataset_query          (assoc-in
                                                         (mbql-count-query (mt/id) (mt/id :checkins))
                                                         [:query :breakout]
                                                         [[:field
                                                           (mt/id :checkins :date)
                                                           {:temporal-unit :hour}]])}
            :deleted?          false
            :f                 (fn [card]
                                 (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card))
                                                       {:dataset_query (assoc-in (mbql-count-query (mt/id) (mt/id :checkins))
                                                                                 [:query :breakout] [[:field (mt/id :checkins :date) {:temporal-unit :hour}]
                                                                                                     [:field (mt/id :checkins :date) {:temporal-unit :minute}]])}))}
           {:message           "Adding an additional breakout will cause the alert to be removed if a goal is set"
            :card              {:display                :line
                                :visualization_settings {:graph.goal_value 10}
                                :dataset_query          (assoc-in
                                                         (mbql-count-query (mt/id) (mt/id :checkins))
                                                         [:query :breakout]
                                                         [[:field
                                                           (mt/id :checkins :date)
                                                           {:temporal-unit :hour}]])}
            :deleted?          true
            :expected-email-re #"Alerts about <a href=\"https?://[^\/]+\/question/\d+\">([^<]+)<\/a> have stopped because the question was edited by Crowberto Corv"
            :f                 (fn [card]
                                 (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card))
                                                       {:dataset_query (assoc-in (mbql-count-query (mt/id) (mt/id :checkins))
                                                                                 [:query :breakout] [[:field (mt/id :checkins :date) {:temporal-unit :hour}]
                                                                                                     [:field (mt/id :checkins :date) {:temporal-unit :minute}]])}))}]]
    (testing message
      (notification.tu/with-channel-fixtures [:channel/email]
        (api.notification-test/with-send-messages-sync!
          (notification.tu/with-card-notification
            [notification {:card     (merge {:name "YOLO"} card)
                           :handlers [{:channel_type :channel/email
                                       :recipients  [{:type    :notification-recipient/user
                                                      :user_id (mt/user->id :crowberto)}
                                                     {:type    :notification-recipient/user
                                                      :user_id (mt/user->id :rasta)}
                                                     {:type    :notification-recipient/raw-value
                                                      :details {:value "ngoc@metabase.com"}}]}]}]
            (when deleted?
              (let [[email] (notification.tu/with-mock-inbox-email!
                              (f (->> notification :payload :card_id (t2/select-one :model/Card))))]
                (is (=? {:bcc     #{"rasta@metabase.com" "crowberto@metabase.com" "ngoc@metabase.com"}
                         :subject "One of your alerts has stopped working"
                         :body    [{(str expected-email-re) true}]}
                        (mt/summarize-multipart-single-email email expected-email-re)))))
            (if deleted?
              (is (= nil (t2/select-one :model/Notification :id (:id notification)))
                  "Alert should have been deleted")
              (is (not= nil (t2/select-one :model/Notification :id (:id notification)))
                  "Alert should not have been deleted"))))))))

(deftest changing-the-display-type-from-line-to-area-bar-is-fine-and-doesnt-delete-the-alert
  (doseq [{:keys [message display]}
          [{:message "Changing display type from line to area should not delete alert"
            :display :area}
           {:message "Changing display type from line to bar should not delete alert"
            :display :bar}]]
    (testing message
      (notification.tu/with-channel-fixtures [:channel/email]
        (api.notification-test/with-send-messages-sync!
          (notification.tu/with-card-notification
            [notification {:card     {:name "Test Card"
                                      :display :line
                                      :visualization_settings {:graph.goal_value 10}}
                           :handlers [{:channel_type :channel/email
                                       :recipients   [{:type    :notification-recipient/user
                                                       :user_id (mt/user->id :crowberto)}
                                                      {:type    :notification-recipient/user
                                                       :user_id (mt/user->id :rasta)}
                                                      {:type    :notification-recipient/raw-value
                                                       :details {:value "ngoc@metabase.com"}}]}]}]
            (mt/with-temporary-setting-values [site-url "https://metabase.com"]
              (mt/user-http-request :rasta :put 200 (str "card/" (->> notification :payload :card_id)) {:display display})
              (is (t2/exists? :model/Notification (:id notification))
                  "Alert should not have been deleted"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          DELETING A CARD (DEPRECATED)                                          |
;;; +----------------------------------------------------------------------------------------------------------------+
;; Deprecated because you're not supposed to delete cards anymore. Archive them instead

(deftest check-that-we-can-delete-a-card
  (is (nil? (mt/with-temp [:model/Card card]
              (with-cards-in-writeable-collection! card
                (mt/user-http-request :rasta :delete 204 (str "card/" (u/the-id card)))
                (t2/select-one :model/Card :id (u/the-id card)))))))

;; deleting a card that doesn't exist should return a 404 (#1957)
(deftest deleting-a-card-that-doesnt-exist-should-return-a-404---1957-
  (is (= "Not found."
         (mt/user-http-request :crowberto :delete 404 "card/12345"))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            CSV/JSON/XLSX DOWNLOADS                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; Test GET /api/card/:id/query/csv & GET /api/card/:id/json & GET /api/card/:id/query/xlsx **WITH PARAMETERS**
(def ^:private ^String test-params
  [{:type   :number
    :target [:variable [:template-tag :category]]
    :value  2}])

(deftest csv-download-test
  (testing "no parameters"
    (with-temp-native-card! [_ card]
      (with-cards-in-readable-collection! card
        (let [response (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv" (u/the-id card)))]
          (is (= ["COUNT(*)"
                  "75"]
                 (cond-> response
                   (string? response) str/split-lines))))))))

(deftest csv-download-test-2
  (testing "with parameters"
    (with-temp-native-card-with-params! [_ card]
      (with-cards-in-readable-collection! card
        (let [response (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv" (u/the-id card))
                                             {:parameters test-params})]
          (is (= ["COUNT(*)"
                  "8"]
                 (cond-> response
                   (string? response) str/split-lines))))))))

(deftest json-download-test
  (testing "no parameters"
    (with-temp-native-card! [_ card]
      (with-cards-in-readable-collection! card
        (is (= [{(keyword "COUNT(*)") "75"}]
               (mt/user-http-request :rasta :post 200 (format "card/%d/query/json" (u/the-id card)) {:format_rows true})))))))

(deftest json-download-test-2
  (testing "with parameters"
    (with-temp-native-card-with-params! [_ card]
      (with-cards-in-readable-collection! card
        (is (= [{(keyword "COUNT(*)") "8"}]
               (mt/user-http-request :rasta :post 200 (format "card/%d/query/json" (u/the-id card))
                                     {:format_rows true, :parameters test-params})))))))

(deftest renamed-column-names-are-applied-to-json-test
  (testing "JSON downloads should have the same columns as displayed in Metabase (#18572)"
    (mt/with-temporary-setting-values [custom-formatting nil]
      (let [query        {:source-table (mt/id :orders)
                          :fields       [[:field (mt/id :orders :id) {:base-type :type/BigInteger}]
                                         [:field (mt/id :orders :tax) {:base-type :type/Float}]
                                         [:field (mt/id :orders :total) {:base-type :type/Float}]
                                         [:field (mt/id :orders :discount) {:base-type :type/Float}]
                                         [:field (mt/id :orders :quantity) {:base-type :type/Integer}]
                                         [:expression "Tax Rate"]],
                          :expressions  {"Tax Rate" [:/
                                                     [:field (mt/id :orders :tax) {:base-type :type/Float}]
                                                     [:field (mt/id :orders :total) {:base-type :type/Float}]]},
                          :limit        10}
            viz-settings {:table.cell_column "TAX",
                          :column_settings   {(format "[\"ref\",[\"field\",%s,null]]" (mt/id :orders :id))
                                              {:column_title "THE_ID"}
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Float\"}]]"
                                                      (mt/id :orders :tax))
                                              {:column_title "ORDER TAX"}
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Float\"}]]"
                                                      (mt/id :orders :total))
                                              {:column_title "Total Amount"},
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Float\"}]]"
                                                      (mt/id :orders :discount))
                                              {:column_title "Discount Applied"}
                                              (format "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Integer\"}]]"
                                                      (mt/id :orders :quantity))
                                              {:column_title "Amount Ordered"}
                                              "[\"ref\",[\"expression\",\"Tax Rate\"]]"
                                              {:column_title "Effective Tax Rate"}}}]
        (mt/with-temp [:model/Card {base-card-id :id} {:dataset_query          {:database (mt/id)
                                                                                :type     :query
                                                                                :query    query}
                                                       :visualization_settings viz-settings}
                       :model/Card {model-card-id  :id
                                    model-metadata :result_metadata} {:type          :model
                                                                      :dataset_query {:database (mt/id)
                                                                                      :type     :query
                                                                                      :query    {:source-table
                                                                                                 (format "card__%s" base-card-id)}}}
                       :model/Card {meta-model-card-id :id} {:type            :model
                                                             :dataset_query   {:database (mt/id)
                                                                               :type     :query
                                                                               :query    {:source-table
                                                                                          (format "card__%s" model-card-id)}}
                                                             :result_metadata (mapv
                                                                               (fn [{column-name :name :as col}]
                                                                                 (cond-> col
                                                                                   (= "DISCOUNT" column-name)
                                                                                   (assoc :display_name "Amount of Discount")
                                                                                   (= "TOTAL" column-name)
                                                                                   (assoc :display_name "Grand Total")
                                                                                   (= "QUANTITY" column-name)
                                                                                   (assoc :display_name "N")))
                                                                               model-metadata)}
                       :model/Card {question-card-id :id} {:dataset_query          {:database (mt/id)
                                                                                    :type     :query
                                                                                    :query    {:source-table
                                                                                               (format "card__%s" meta-model-card-id)}}
                                                           :visualization_settings {:table.pivot_column "DISCOUNT",
                                                                                    :table.cell_column  "TAX",
                                                                                    :column_settings    {(format
                                                                                                          "[\"ref\",[\"field\",%s,{\"base-type\":\"type/Integer\"}]]"
                                                                                                          (mt/id :orders :quantity))
                                                                                                         {:column_title "Count"}
                                                                                                         (format
                                                                                                          "[\"ref\",[\"field\",%s,{\"base-type\":\"type/BigInteger\"}]]"
                                                                                                          (mt/id :orders :id))
                                                                                                         {:column_title "IDENTIFIER"}}}}]
          (letfn [(col-names [card-id]
                    (->> (mt/user-http-request :crowberto :post 200
                                               (format "card/%d/query/json" card-id)
                                               {:format_rows true})
                         first keys (map name) set))]
            (testing "Renaming columns via viz settings is correctly applied to the CSV export"
              (is (= #{"THE_ID" "ORDER TAX" "Total Amount" "Discount Applied ($)" "Amount Ordered" "Effective Tax Rate"}
                     (col-names base-card-id))))
            (testing "A question derived from another question does not bring forward any renames"
              (is (= #{"ID" "Tax" "Total" "Discount ($)" "Quantity" "Tax Rate"}
                     (col-names model-card-id))))
            (testing "A model with custom metadata shows the renamed metadata columns"
              (is (= #{"ID" "Tax" "Grand Total" "Amount of Discount ($)" "N" "Tax Rate"}
                     (col-names meta-model-card-id))))
            (testing "A question based on a model retains the curated metadata column names but overrides these with any existing visualization_settings"
              (is (= #{"IDENTIFIER" "Tax" "Grand Total" "Amount of Discount ($)" "Count" "Tax Rate"}
                     (col-names question-card-id))))))))))

(defn- parse-xlsx-results [results]
  (->> results
       ByteArrayInputStream.
       spreadsheet/load-workbook
       (spreadsheet/select-sheet "Query result")
       (spreadsheet/select-columns {:A :col})))

(deftest xlsx-download-test
  (testing "no parameters"
    (with-temp-native-card! [_ card]
      (with-cards-in-readable-collection! card
        (is (= [{:col "COUNT(*)"} {:col 75.0}]
               (parse-xlsx-results
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))))))))))

(deftest xlsx-download-test-2
  (testing "with parameters"
    (with-temp-native-card-with-params! [_ card]
      (with-cards-in-readable-collection! card
        (is (= [{:col "COUNT(*)"} {:col 8.0}]
               (parse-xlsx-results
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                      {:parameters test-params}))))))))

(defn- parse-xlsx-results-to-strings
  "Parse an excel response into a 2-D array of formatted values"
  [results]
  (let [df (DataFormatter.)]
    (->> results
         ByteArrayInputStream.
         spreadsheet/load-workbook
         (spreadsheet/select-sheet "Query result")
         spreadsheet/row-seq
         (mapv (fn [row]
                 (mapv (fn [cell] (.formatCellValue df cell)) (spreadsheet/cell-seq row)))))))

(deftest xlsx-timestamp-formatting-test
  (testing "A timestamp should format correctly in an excel export (#14393)"
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                     :type     :native
                                                     :native   {:query "select (TIMESTAMP '2023-01-01 12:34:56') as T"}}
                                     :display :table
                                     :visualization_settings {:table.pivot_column "T",
                                                              :column_settings {"[\"name\",\"T\"]" {:date_style "YYYY/M/D",
                                                                                                    :date_separator "-",
                                                                                                    :time_enabled nil}}}}]
      (testing "Removing the time portion of the timestamp should only show the date"
        (is (= [["T"] ["2023-1-1"]]
               (parse-xlsx-results-to-strings
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                      {:format_rows true}))))))))

(deftest xlsx-default-currency-formatting-test
  (testing "The default currency is USD"
    (mt/with-temp [:model/Card card {:dataset_query          {:database (mt/id)
                                                              :type     :native
                                                              :native   {:query "SELECT 123.45 AS MONEY"}}
                                     :display                :table
                                     :visualization_settings {:column_settings {"[\"name\",\"MONEY\"]"
                                                                                {:number_style       "currency"
                                                                                 :currency_in_header false}}}}]
      (is (= [["MONEY"]
              ["[$$]123.45"]]
             (parse-xlsx-results-to-strings
              (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                    {:format_rows true})))))))

(deftest xlsx-default-currency-formatting-test-2
  (testing "Default localization settings take effect"
    (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_abbreviate true}
                                                          :type/Currency {:currency "EUR", :currency_style "symbol"}}]
      (mt/with-temp [:model/Card card {:dataset_query          {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query "SELECT 123.45 AS MONEY"}}
                                       :display                :table
                                       :visualization_settings {:column_settings {"[\"name\",\"MONEY\"]"
                                                                                  {:number_style       "currency"
                                                                                   :currency_in_header false}}}}]
        (is (= [["MONEY"]
                ["[$€]123.45"]]
               (parse-xlsx-results-to-strings
                (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                      {:format_rows true}))))))))

(deftest xlsx-currency-formatting-test
  (testing "Currencies are applied correctly in Excel files"
    (let [currencies ["USD" "CAD" "EUR" "JPY"]
          q (format "SELECT %s" (str/join "," (map (partial format "123.45 as %s") currencies)))
          settings (reduce (fn [acc currency]
                             (assoc acc (format "[\"name\",\"%s\"]" currency)
                                    {:number_style       "currency"
                                     :currency           currency
                                     :currency_in_header false}))
                           {}
                           currencies)]
      (mt/with-temp [:model/Card card {:dataset_query          {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query q}}
                                       :display                :table
                                       :visualization_settings {:column_settings settings}}]
        (testing "Removing the time portion of the timestamp should only show the date"
          (is (= [currencies
                  ["[$$]123.45" "[$CA$]123.45" "[$€]123.45" "[$¥]123.45"]]
                 (parse-xlsx-results-to-strings
                  (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                        {:format_rows true})))))))))

(def ^:private excel-data-query
  "with t1 as (
               select *
               FROM (
                VALUES
                  (1234.05, 1234.05, 2345.05, 4321.05, 7180.643352291768, 1234.00, 0.053010935820623994, 0.1920, TIMESTAMP '2023-01-01 12:34:56'),
                  (2345.30, 2345.30, 3456.30, 2931.30, 17180.643352291768, 0.00, 8.01623207863001, 0.00, TIMESTAMP '2023-01-01 12:34:56'),
                  (3456.00, 3456.00, 2300.00, 2250.00, 127180.643352291768, 122.00, 95.40200874663908, 0.1158, TIMESTAMP '2023-01-01 12:34:56')
                )
              ),
              t2 as (
              select
                  c1 as default_currency,
                  c2 as currency1,
                  c3 as currency2,
                  c4 as currency3,
                  c5 as scientific,
                  c6 as hide_me,
                  c7 as percent1,
                  c8 as percent2,
                  c9 as og_creation_timestamp,
                  c9 as creation_timestamp,
                  c9 as creation_timestamp_dup,
                  CAST(c9 AS DATE) as creation_date,
                  CAST(c9 AS TIME) as creation_time,
                  from t1
              )
              select * from t2")

(def ^:private excel-viz-settings
  {:table.pivot_column "SCIENTIFIC"
   :table.cell_column  "CURRENCY1"
   :table.columns      [{:name     "OG_CREATION_TIMESTAMP"
                         :fieldRef [:field "OG_CREATION_TIMESTAMP" {:base-type :type/DateTime}]
                         :enabled  true}
                        {:name     "CREATION_TIMESTAMP"
                         :fieldRef [:field "CREATION_TIMESTAMP" {:base-type :type/DateTime}]
                         :enabled  true}
                        {:name     "CREATION_TIMESTAMP_DUP"
                         :fieldRef [:field "CREATION_TIMESTAMP_DUP" {:base-type :type/DateTime}]
                         :enabled  true}
                        {:name     "CREATION_DATE"
                         :fieldRef [:field "CREATION_DATE" {:base-type :type/Date}]
                         :enabled  true}
                        {:name     "CREATION_TIME"
                         :fieldRef [:field "CREATION_TIME" {:base-type :type/Time}]
                         :enabled  true}
                        {:name     "DEFAULT_CURRENCY"
                         :fieldRef [:field "DEFAULT_CURRENCY" {:base-type :type/Decimal}]
                         :enabled  true}
                        {:name     "CURRENCY1"
                         :fieldRef [:field "CURRENCY1" {:base-type :type/Decimal}]
                         :enabled  true}
                        {:name     "CURRENCY2"
                         :fieldRef [:field "CURRENCY2" {:base-type :type/Decimal}]
                         :enabled  true}
                        {:name     "CURRENCY3"
                         :fieldRef [:field "CURRENCY3" {:base-type :type/Decimal}]
                         :enabled  true}
                        {:name     "SCIENTIFIC"
                         :fieldRef [:field "SCIENTIFIC" {:base-type :type/Decimal}]
                         :enabled  true}
                        {:name     "HIDE_ME"
                         :fieldRef [:field "HIDE_ME" {:base-type :type/Decimal}]
                         :enabled  false}
                        {:name     "PERCENT1"
                         :fieldRef [:field "PERCENT1" {:base-type :type/Decimal}]
                         :enabled  true}
                        {:name     "PERCENT2"
                         :fieldRef [:field "PERCENT2" {:base-type :type/Decimal}]
                         :enabled  true}]
   :column_settings    {"[\"name\",\"OG_CREATION_TIMESTAMP\"]"  {:column_title "No Formatting TS"}
                        "[\"name\",\"SCIENTIFIC\"]"             {:number_style "scientific"
                                                                 :column_title "EXPO"}
                        "[\"name\",\"CREATION_TIME\"]"          {:column_title "Time"}
                        "[\"name\",\"CURRENCY3\"]"              {:number_style       "currency"
                                                                 :currency_style     "name"
                                                                 :number_separators  ".’"
                                                                 :column_title       "DOL Col"
                                                                 :currency_in_header false}
                        "[\"name\",\"PERCENT2\"]"               {:number_style "percent"
                                                                 :column_title "3D PCT"
                                                                 :decimals     3}
                        "[\"name\",\"CURRENCY1\"]"              {:number_style       "currency"
                                                                 :currency_in_header false
                                                                 :column_title       "Col $"}
                        "[\"name\",\"CREATION_TIMESTAMP\"]"     {:time_enabled   nil
                                                                 :time_style     "HH:mm"
                                                                 :date_style     "YYYY/M/D"
                                                                 :date_separator "-"
                                                                 :column_title   "DATE-ONLY TS"}
                        "[\"name\",\"CREATION_TIMESTAMP_DUP\"]" {:time_enabled   "milliseconds",
                                                                 :time_style     "HH:mm",
                                                                 :date_style     "D/M/YYYY",
                                                                 :date_separator "-",
                                                                 :column_title   "TS W/FORMATTING"}
                        "[\"name\",\"PERCENT1\"]"               {:number_style "percent"
                                                                 :scale        0.01
                                                                 :column_title "Scaled PCT"}
                        "[\"name\",\"CURRENCY2\"]"              {:number_style       "currency"
                                                                 :currency_style     "code"
                                                                 :currency_in_header false
                                                                 :number_separators  "."
                                                                 :column_title       "USD Col"}
                        "[\"name\",\"CREATION_DATE\"]"          {:column_title "Date"}
                        "[\"name\",\"DEFAULT_CURRENCY\"]"       {:number_style "currency"
                                                                 :column_title "Plain Currency"}}})

(deftest xlsx-full-formatting-test
  (testing "Formatting should be applied correctly for all types, including numbers, currencies, exponents, and times. (relates to #14393)"
    (testing "The default settings (USD) are applied correctly"
      (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_abbreviate true}}]
        (mt/with-temp [:model/Card card {:dataset_query          {:database (mt/id)
                                                                  :type     :native
                                                                  :native   {:query excel-data-query}}
                                         :display                :table
                                         :visualization_settings excel-viz-settings}]
          ;; The following formatting has been applied:
          ;; - All columns renamed
          ;; - Column reordering
          ;; - Column hiding (See "HIDE_ME") above
          ;; - Base formatting ("No Formatting TS") conforms to standard datetime format
          ;; - "DATE-ONLY TS" shows only a date-formatted timestamp
          ;; - "TS W/FORMATTING" shows a timestamp with custom date and time formatting
          ;; - "Date" shows simple date formatting
          ;; - "Time" shows simple time formatting
          ;; - "Plain Currency ($)" formats numbers as regular numbers with no dollar sign in the number column
          ;; - "Col $" formats currency with leading $. Note that the strings as presented aren't as you'd see in Excel. Excel properly just adds a leading $.
          ;; - "USD Col" has a leading USD. Again, the formatting of this output is an artifact of POI rendering. It is correct in Excel as "USD 1.23"
          ;; - "DOL Col" has trailing US dollars
          ;; - "EXPO" has exponentiated values
          ;; - "Scaled PCT" multiplies values by 0.01 and presents as percentages
          ;; - "3D PCT" is a standard percentage with a customization of 3 significant digits
          (testing "All formatting is applied correctly in a complex situation."
            (is (= [["No Formatting TS" "DATE-ONLY TS" "TS W/FORMATTING" "Date" "Time" "Plain Currency ($)" "Col $" "USD Col" "DOL Col" "EXPO" "Scaled PCT" "3D PCT"]
                    ["Jan 1, 2023, 12:34 PM" "2023-1-1" "1-1-2023, 12:34:56.000" "Jan 1, 2023" "12:34 PM" "1,234.05" "[$$]1,234.05" "[$USD] 2345.05" "4,321.05 US dollars" "7180.64E+0" "0.05%" "19.200%"]
                    ["Jan 1, 2023, 12:34 PM" "2023-1-1" "1-1-2023, 12:34:56.000" "Jan 1, 2023" "12:34 PM" "2,345.30" "[$$]2,345.30" "[$USD] 3456.30" "2,931.30 US dollars" "1.71806E+4" "8.02%" "0.000%"]
                    ["Jan 1, 2023, 12:34 PM" "2023-1-1" "1-1-2023, 12:34:56.000" "Jan 1, 2023" "12:34 PM" "3,456.00" "[$$]3,456.00" "[$USD] 2300.00" "2,250.00 US dollars" "12.7181E+4" "95.40%" "11.580%"]]
                   (parse-xlsx-results-to-strings
                    (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                          {:format_rows true}))))))))))

(deftest xlsx-full-formatting-test-2
  (testing "Formatting should be applied correctly for all types, including numbers, currencies, exponents, and times. (relates to #14393)"
    (testing "Global currency settings are applied correctly"
      (mt/with-temporary-setting-values [custom-formatting {:type/Temporal {:date_abbreviate true}
                                                            :type/Currency {:currency "EUR", :currency_style "symbol"}}]
        (mt/with-temp [:model/Card card {:dataset_query          {:database (mt/id)
                                                                  :type     :native
                                                                  :native   {:query excel-data-query}}
                                         :display                :table
                                         :visualization_settings excel-viz-settings}]
          (testing "All formatting is applied correctly in a complex situation."
            (is (= [["No Formatting TS" "DATE-ONLY TS" "TS W/FORMATTING" "Date" "Time" "Plain Currency (€)" "Col $" "USD Col" "DOL Col" "EXPO" "Scaled PCT" "3D PCT"]
                    ["Jan 1, 2023, 12:34 PM" "2023-1-1" "1-1-2023, 12:34:56.000" "Jan 1, 2023" "12:34 PM" "1,234.05" "[$€]1,234.05" "[$EUR] 2345.05" "4,321.05 euros" "7180.64E+0" "0.05%" "19.200%"]
                    ["Jan 1, 2023, 12:34 PM" "2023-1-1" "1-1-2023, 12:34:56.000" "Jan 1, 2023" "12:34 PM" "2,345.30" "[$€]2,345.30" "[$EUR] 3456.30" "2,931.30 euros" "1.71806E+4" "8.02%" "0.000%"]
                    ["Jan 1, 2023, 12:34 PM" "2023-1-1" "1-1-2023, 12:34:56.000" "Jan 1, 2023" "12:34 PM" "3,456.00" "[$€]3,456.00" "[$EUR] 2300.00" "2,250.00 euros" "12.7181E+4" "95.40%" "11.580%"]]
                   (parse-xlsx-results-to-strings
                    (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                          {:format_rows true})))))
          (parse-xlsx-results-to-strings
           (mt/user-http-request :rasta :post 200 (format "card/%d/query/xlsx" (u/the-id card))
                                 {:format_rows true})))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(deftest download-default-constraints-test
  (mt/with-temp [:model/Card card {:dataset_query {:database   (mt/id)
                                                   :type       :query
                                                   :query      {:source-table (mt/id :venues)}
                                                   :middleware {:add-default-userland-constraints? true
                                                                :userland-query?                   true}}}]
    (with-cards-in-readable-collection! card
      (let [orig qp.card/process-query-for-card]
        (with-redefs [qp.card/process-query-for-card (fn [card-id export-format & options]
                                                       (apply orig card-id export-format
                                                              :make-run (constantly (fn [{:keys [constraints]} _]
                                                                                      {:constraints constraints}))
                                                              options))]
          (testing "Sanity check: this CSV download should not be subject to C O N S T R A I N T S"
            (is (= {:constraints nil}
                   (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv" (u/the-id card))))))
          (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
            (testing (str "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints -- even "
                          "if the query comes in with `add-default-userland-constraints` (as will be the case if the query "
                          "gets saved from one that had it -- see #9831)")
              (is (= {:constraints nil}
                     (mt/user-http-request :rasta :post 200 (format "card/%d/query/csv" (u/the-id card))))))

            (testing (str "non-\"download\" queries should still get the default constraints (this also is a sanitiy "
                          "check to make sure the `with-redefs` in the test above actually works)")
              (is (= {:constraints {:max-results 10, :max-results-bare-rows 10}}
                     (mt/user-http-request :rasta :post 200 (format "card/%d/query" (u/the-id card))))))))))))

(defn- test-download-response-headers
  [url]
  (-> (client/client-full-response (test.users/username->token :rasta)
                                   :post 200 url
                                   :query (json/encode (mt/mbql-query checkins {:limit 1})))
      :headers
      (select-keys ["Cache-Control" "Content-Disposition" "Content-Type" "Expires" "X-Accel-Buffering"])
      (update "Content-Disposition" #(some-> % (str/replace #"my_awesome_card_.+(\.\w+)"
                                                            "my_awesome_card_<timestamp>$1")))))

(deftest download-response-headers-test
  (testing "Make sure CSV/etc. download requests come back with the correct headers"
    (mt/with-temp [:model/Card card {:name "My Awesome Card"}]
      (is (= {"Cache-Control"       "max-age=0, no-cache, must-revalidate, proxy-revalidate"
              "Content-Disposition" "attachment; filename=\"my_awesome_card_<timestamp>.csv\""
              "Content-Type"        "text/csv"
              "Expires"             "Tue, 03 Jul 2001 06:00:00 GMT"
              "X-Accel-Buffering"   "no"}
             (test-download-response-headers (format "card/%d/query/csv" (u/the-id card)))))
      (is (= {"Cache-Control"       "max-age=0, no-cache, must-revalidate, proxy-revalidate"
              "Content-Disposition" "attachment; filename=\"my_awesome_card_<timestamp>.json\""
              "Content-Type"        "application/json; charset=utf-8"
              "Expires"             "Tue, 03 Jul 2001 06:00:00 GMT"
              "X-Accel-Buffering"   "no"}
             (test-download-response-headers (format "card/%d/query/json" (u/the-id card)))))
      (is (= {"Cache-Control"       "max-age=0, no-cache, must-revalidate, proxy-revalidate"
              "Content-Disposition" "attachment; filename=\"my_awesome_card_<timestamp>.xlsx\""
              "Content-Type"        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              "Expires"             "Tue, 03 Jul 2001 06:00:00 GMT"
              "X-Accel-Buffering"   "no"}
             (test-download-response-headers (format "card/%d/query/xlsx" (u/the-id card))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  COLLECTIONS                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest make-sure-we-can-create-a-card-and-specify-its--collection-id--at-the-same-time
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection collection]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (mt/with-model-cleanup [:model/Card]
        (let [card (mt/user-http-request :crowberto :post 200 "card"
                                         (assoc (card-with-name-and-query)
                                                :collection_id (u/the-id collection)))]
          (is (= (t2/select-one-fn :collection_id :model/Card :id (u/the-id card))
                 (u/the-id collection))))))))

(deftest make-sure-we-card-creation-fails-if-we-try-to-set-a--collection-id--we-don-t-have-permissions-for
  (testing "POST /api/card"
    (testing "You must have permissions for the parent Collection to create a new Card in it"
      (mt/with-full-data-perms-for-all-users!
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection collection]
            (mt/with-model-cleanup [:model/Card]
              (is (=? {:message "You do not have curate permissions for this Collection."}
                      (mt/user-http-request :rasta :post 403 "card"
                                            (assoc (card-with-name-and-query) :collection_id (u/the-id collection))))))))))))

(deftest set-card-collection-id-test
  (testing "Should be able to set the Collection ID of a Card in the Root Collection (i.e., `collection_id` is nil)"
    (mt/with-temp [:model/Card        card {}
                   :model/Collection  collection]
      (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:collection_id (u/the-id collection)})
      (is (= (t2/select-one-fn :collection_id :model/Card :id (u/the-id card))
             (u/the-id collection))))))

(deftest update-card-require-parent-perms-test
  (testing "Should require perms for the parent collection to change a Card's properties"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection  collection {}
                     :model/Card card       {:collection_id (u/the-id collection)}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "card/" (u/the-id card))
                                     {:name "Number of Blueberries Consumed Per Month"})))))))

(deftest change-collection-permissions-test
  (testing "PUT /api/card/:id"
    (testing "\nChange the `collection_id` of a Card"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection  original-collection {}
                       :model/Collection  new-collection      {}
                       :model/Card card                {:collection_id (u/the-id original-collection)}]
          (letfn [(change-collection! [expected-status-code]
                    (mt/user-http-request :rasta :put expected-status-code (str "card/" (u/the-id card))
                                          {:collection_id (u/the-id new-collection)}))]
            (testing "requires write permissions for the new Collection"
              (is (= "You don't have permissions to do that."
                     (change-collection! 403))))

            (testing "requires write permissions for the current Collection"
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
              (is (= "You don't have permissions to do that."
                     (change-collection! 403))))

            (testing "Should be able to change it once you have perms for both collections"
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
              (change-collection! 200)
              (is (= (t2/select-one-fn :collection_id :model/Card :id (u/the-id card))
                     (u/the-id new-collection))))))))))

;;; ------------------------------ Bulk Collections Update (POST /api/card/collections) ------------------------------

(defn- collection-names
  "Given a sequences of `cards-or-card-ids`, return a corresponding sequence of names of the Collection each Card is
  in."
  [cards-or-card-ids]
  (when (seq cards-or-card-ids)
    (let [cards               (t2/select [:model/Card :collection_id] :id [:in (map u/the-id cards-or-card-ids)])
          collection-ids      (set (filter identity (map :collection_id cards)))
          collection-id->name (when (seq collection-ids)
                                (t2/select-pk->fn :name :model/Collection :id [:in collection-ids]))]
      (for [card cards]
        (get collection-id->name (:collection_id card))))))

(defn- POST-card-collections!
  "Update the Collection of `cards-or-card-ids` via the `POST /api/card/collections` endpoint using `username`; return
  the response of this API request and the latest Collection IDs from the database."
  [username expected-status-code collection-or-collection-id-or-nil cards-or-card-ids]
  (array-map
   :response
   (mt/user-http-request username :post expected-status-code "card/collections"
                         {:collection_id (when collection-or-collection-id-or-nil
                                           (u/the-id collection-or-collection-id-or-nil))
                          :card_ids      (map u/the-id cards-or-card-ids)})

   :collections
   (collection-names cards-or-card-ids)))

(deftest update-verified-card-test
  (tools.macro/macrolet
   [(with-card [verified & body]
      `(mt/with-temp ~(cond-> `[:model/Collection  ~'collection  {}
                                :model/Collection  ~'collection2 {}
                                :model/Card ~'card        {:collection_id (u/the-id ~'collection)
                                                           :dataset_query (mt/mbql-query ~'venues)}]
                        (= verified :verified)
                        (into
                         `[:model/ModerationReview
                           ~'review {:moderated_item_id   (:id ~'card)
                                     :moderated_item_type "card"
                                     :moderator_id        (mt/user->id :crowberto)
                                     :most_recent         true
                                     :status              "verified"
                                     :text                "lookin good"}]))
         ~@body))]
    (letfn [(verified? [card]
              (-> card (t2/hydrate [:moderation_reviews :moderator_details])
                  :moderation_reviews first :status #{"verified"} boolean))
            (reviews [card]
              (t2/select :model/ModerationReview
                         :moderated_item_type "card"
                         :moderated_item_id (u/the-id card)
                         {:order-by [[:id :desc]]}))
            (update-card [card diff]
              (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) (merge card diff)))]
      (testing "Changing core attributes un-verifies the card"
        (with-card :verified
          (is (verified? card))
          (update-card card (update-in card [:dataset_query :query :source-table] inc))
          (is (not (verified? card)))
          (testing "The unverification edit has explanatory text"
            (is (= "Unverified due to edit"
                   (-> (reviews card) first :text))))))
      (testing "Changing some attributes does not unverify"
        (tools.macro/macrolet [(remains-verified [& body]
                                 `(~'with-card :verified
                                               (is (~'verified? ~'card) "Not verified initially")
                                               ~@body
                                               (is (~'verified? ~'card) "Not verified after action")))]
          (testing "changing collection"
            (remains-verified
             (update-card card {:collection_id (u/the-id collection2)})))
          (testing "pinning"
            (remains-verified
             (update-card card {:collection_position 1})))
          (testing "making public"
            (remains-verified
             (update-card card {:made_public_by_id (mt/user->id :rasta)
                                :public_uuid (random-uuid)})))
          (testing "Changing description"
            (remains-verified
             (update-card card {:description "foo"})))
          (testing "Changing name"
            (remains-verified
             (update-card card {:name "foo"})))
          (testing "Changing archived"
            (remains-verified
             (update-card card {:archived true})))
          (testing "Changing display"
            (remains-verified
             (update-card card {:display :line})))
          (testing "Changing visualization settings"
            (remains-verified
             (update-card card {:visualization_settings {:table.cell_column "FOO"}})))))
      (testing "Does not add a new nil moderation review when not verified"
        (with-card :not-verified
          (is (empty? (reviews card)))
          (update-card card {:description "a new description"})
          (is (empty? (reviews card)))))
      (testing "Does not add nil moderation reviews when there are reviews but not verified"
       ;; testing that we aren't just adding a nil moderation each time we update a card
        (with-card :verified
          (is (verified? card))
          (moderation-review/create-review! {:moderated_item_id   (u/the-id card)
                                             :moderated_item_type "card"
                                             :moderator_id        (mt/user->id :rasta)
                                             :status              nil})
          (is (not (verified? card)))
          (is (= 2 (count (reviews card))))
          (update-card card {:description "a new description"})
          (is (= 2 (count (reviews card)))))))))

(deftest test-that-we-can-bulk-move-some-cards-with-no-collection-into-a-collection
  (mt/with-temp [:model/Collection  collection {:name "Pog Collection"}
                 :model/Card card-1     {}
                 :model/Card card-2     {}]
    (is (= {:response    {:status "ok"}
            :collections ["Pog Collection"
                          "Pog Collection"]}
           (POST-card-collections! :crowberto 200 collection [card-1 card-2])))))

(deftest test-that-we-can-bulk-move-some-cards-from-one-collection-to-another
  (mt/with-temp [:model/Collection  old-collection {:name "Old Collection"}
                 :model/Collection  new-collection {:name "New Collection"}
                 :model/Card card-1         {:collection_id (u/the-id old-collection)}
                 :model/Card card-2         {:collection_id (u/the-id old-collection)}]
    (is (= {:response    {:status "ok"}
            :collections ["New Collection" "New Collection"]}
           (POST-card-collections! :crowberto 200 new-collection [card-1 card-2])))))

(deftest test-that-we-can-bulk-remove-some-cards-from-a-collection
  (mt/with-temp [:model/Collection  collection {}
                 :model/Card card-1     {:collection_id (u/the-id collection)}
                 :model/Card card-2     {:collection_id (u/the-id collection)}]
    (is (= {:response    {:status "ok"}
            :collections [nil nil]}
           (POST-card-collections! :crowberto 200 nil [card-1 card-2])))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-destination-collection
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection  collection {}
                   :model/Card card-1 {}
                   :model/Card card-2 {}]
      (is (= {:response    "You don't have permissions to do that."
              :collections [nil nil]}
             (POST-card-collections! :rasta 403 collection [card-1 card-2]))))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-source-collection
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection  collection {:name "Horseshoe Collection"}
                   :model/Card card-1     {:collection_id (u/the-id collection)}
                   :model/Card card-2     {:collection_id (u/the-id collection)}]
      (is (= {:response    "You don't have permissions to do that."
              :collections ["Horseshoe Collection" "Horseshoe Collection"]}
             (POST-card-collections! :rasta 403 nil [card-1 card-2]))))))

(deftest check-that-we-aren-t-allowed-to-move-cards-if-we-don-t-have-permissions-for-the-card
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection  collection {}
                   :model/Database    database   {}
                   :model/Table       table      {:db_id (u/the-id database)}
                   :model/Card card-1     {:dataset_query (mbql-count-query (u/the-id database) (u/the-id table))}
                   :model/Card card-2     {:dataset_query (mbql-count-query (u/the-id database) (u/the-id table))}]
      (mt/with-no-data-perms-for-all-users!
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (is (= {:response    "You don't have permissions to do that."
                :collections [nil nil]}
               (POST-card-collections! :rasta 403 collection [card-1 card-2])))))))

;; Test that we can bulk move some Cards from one collection to another, while updating the collection position of the
;; old collection and the new collection
(deftest bulk-move-cards
  (mt/with-temp [:model/Collection   {coll-id-1 :id}      {:name "Old Collection"}
                 :model/Collection   {coll-id-2 :id
                                      :as new-collection} {:name "New Collection"}
                 :model/Card  card-a               {:name "a" :collection_id coll-id-1 :collection_position 1}
                 :model/Card  card-b               {:name "b" :collection_id coll-id-1 :collection_position 2}
                 :model/Card  _                    {:name "c" :collection_id coll-id-1 :collection_position 3}
                 :model/Card  _                    {:name "d" :collection_id coll-id-2 :collection_position 1}
                 :model/Card  _                    {:name "e" :collection_id coll-id-2 :collection_position 2}
                 :model/Card  _                    {:name "f" :collection_id coll-id-2 :collection_position 3}]
    (is (= {:response    {:status "ok"}
            :collections ["New Collection" "New Collection"]}
           (POST-card-collections! :crowberto 200 new-collection [card-a card-b])))
    (is (= {"a" 4                       ;-> Moved to the new collection, gets the first slot available
            "b" 5
            "c" 1                       ;-> With a and b no longer in the collection, c is first
            "d" 1                       ;-> Existing cards in new collection are untouched and position unchanged
            "e" 2
            "f" 3}
           (merge (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-1)
                                                               :model "card" :archived "false")))
                  (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-2)
                                                               :model "card" :archived "false"))))))))

(deftest moving-a-card-without-a-collection-position-keeps-the-collection-position-nil
  (mt/with-temp [:model/Collection  {coll-id-1 :id}      {:name "Old Collection"}
                 :model/Collection  {coll-id-2 :id
                                     :as new-collection} {:name "New Collection"}
                 :model/Card card-a               {:name "a" :collection_id coll-id-1}
                 :model/Card card-b               {:name "b" :collection_id coll-id-2 :collection_position 1}
                 :model/Card _card-c              {:name "c" :collection_id coll-id-2 :collection_position 2}]
    (is (= {:response    {:status "ok"}
            :collections ["New Collection" "New Collection"]}
           (POST-card-collections! :crowberto 200 new-collection [card-a card-b])))
    (is (= {"a" nil
            "b" 1
            "c" 2}
           (merge (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-1)
                                                               :model "card" :archived "false")))
                  (name->position (:data (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id-2)
                                                               :model "card" :archived "false"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-card []
  {:public_uuid       (str (random-uuid))
   :made_public_by_id (mt/user->id :crowberto)})

(deftest share-card-test
  (testing "POST /api/card/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card card]
        (let [{uuid :uuid} (mt/user-http-request :crowberto :post 200 (format "card/%d/public_link" (u/the-id card)))]
          (is (true?
               (boolean (t2/exists? :model/Card :id (u/the-id card), :public_uuid uuid)))))))))

(deftest share-card-preconditions-test
  (testing "POST /api/card/:id/public_link"
    (testing "Public sharing has to be enabled to share a Card"
      (mt/with-temporary-setting-values [enable-public-sharing false]
        (mt/with-temp [:model/Card card]
          (is (= "Public sharing is not enabled."
                 (mt/user-http-request :crowberto :post 400 (format "card/%d/public_link" (u/the-id card))))))))

    (mt/with-temporary-setting-values [enable-public-sharing true]
      (testing "Have to be an admin to share a Card"
        (mt/with-temp [:model/Card card]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "Cannot share an archived Card"
        (mt/with-temp [:model/Card card {:archived true}]
          (is (=? {:message    "The object has been archived."
                   :error_code "archived"}
                  (mt/user-http-request :crowberto :post 404 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "Cannot share a Card that doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404 (format "card/%d/public_link" Integer/MAX_VALUE))))))))

(deftest share-already-shared-card-test
  (testing "POST /api/card/:id/public_link"
    (testing "Attempting to share a Card that's already shared should return the existing public UUID"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Card card (shared-card)]
          (is (= (:public_uuid card)
                 (:uuid (mt/user-http-request :crowberto :post 200 (format
                                                                    "card/%d/public_link"
                                                                    (u/the-id card)))))))))))

(deftest unshare-card-test
  (testing "DELETE /api/card/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card card (shared-card)]
        (testing "requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 (format "card/%d/public_link" (u/the-id card))))))

        (mt/user-http-request :crowberto :delete 204 (format "card/%d/public_link" (u/the-id card)))
        (is (= false
               (t2/exists? :model/Card :id (u/the-id card), :public_uuid (:public_uuid card))))))))

(deftest unshare-card-preconditions-test
  (testing "DELETE /api/card/:id/public_link\n"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (testing "Endpoint should return 404 if Card isn't shared"
        (mt/with-temp [:model/Card card]
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "You have to be an admin to unshare a Card"
        (mt/with-temp [:model/Card card (shared-card)]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 (format "card/%d/public_link" (u/the-id card)))))))

      (testing "Endpoint should 404 if Card doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404 (format "card/%d/public_link" Integer/MAX_VALUE))))))))

(deftest test-that-we-can-fetch-a-list-of-publicly-accessible-cards
  (testing "GET /api/card/public"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card _ (shared-card)]
        (testing "Test that it requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "card/public"))))

        (testing "Test that superusers can fetch a list of publicly-accessible cards"
          (is (= [{:name true, :id true, :public_uuid true}]
                 (for [card (mt/user-http-request :crowberto :get 200 "card/public")]
                   (m/map-vals boolean (select-keys card [:name :id :public_uuid]))))))))))

(deftest test-that-we-can-fetch-a-list-of-embeddable-cards
  (testing "GET /api/card/embeddable"
    (mt/with-temporary-setting-values [enable-embedding-static true]
      (mt/with-temp [:model/Card _ {:enable_embedding true}]
        (is (= [{:name true, :id true}]
               (for [card (mt/user-http-request :crowberto :get 200 "card/embeddable")]
                 (m/map-vals boolean (select-keys card [:name :id])))))))))

(deftest ^:parallel pivot-card-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset test-data
      (testing "POST /api/card/pivot/:card-id/query"
        (doseq [card-attributes [(api.pivots/pivot-card) (api.pivots/legacy-pivot-card)]]
          (mt/with-temp [:model/Card card card-attributes]
            (let [result (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" (u/the-id card)))
                  rows   (mt/rows result)]
              (is (= 1144 (:row_count result)))
              (is (= "completed" (:status result)))
              (is (= 6 (count (get-in result [:data :cols]))))
              (is (= 1144 (count rows)))

              (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
              (is (= ["MS" "Organic" "Gizmo" 0 16 42] (nth rows 445)))
              (is (= [nil nil nil 7 18760 69540] (last rows))))))))))

(deftest ^:parallel model-card-test
  (testing "Setting a question to a dataset makes it viz type table"
    (mt/with-temp [:model/Card card {:display       :bar
                                     :dataset_query (mbql-count-query)}]
      (is (=? {:display "table" :type "model"}
              (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card))
                                    (assoc card :type :model :type "model")))))))

;;; See also:
;;;
;;; - [[metabase.lib.field.resolution-test/preserve-model-metadata-test]]
;;;
;;; - [[metabase.lib.card-test/preserve-edited-metadata-test]]
;;;
;;; - [[metabase.lib.metadata.result-metadata-test/preserve-edited-metadata-test]]
;;;
;;; - [[metabase.query-processor.preprocess-test/preserve-edited-metadata-test]]
;;;
;;; - [[metabase.query-processor.card-test/preserve-model-metadata-test]]
(deftest model-card-test-2
  (testing "Cards preserve their edited metadata"
    (letfn [(query! [card-id] (mt/user-http-request :rasta :post 202 (format "card/%d/query" card-id)))
            (only-user-edits [col] (select-keys col [:name :description :display_name :semantic_type]))
            (refine-type [base-type] (condp #(isa? %2 %1) base-type
                                       :type/Integer :type/Quantity
                                       :type/Float :type/Cost
                                       :type/Text :type/Name
                                       base-type))
            (add-preserved [cols] (map merge
                                       cols
                                       (repeat {:description "user description"
                                                :display_name "user display name"})
                                       (map (comp
                                             (fn [x] {:semantic_type x})
                                             refine-type
                                             :base_type)
                                            cols)))]
      (mt/with-temp [:model/Card mbql-model {:name "mbql-model" ; names are for debugging purposes
                                             :dataset_query
                                             {:database (mt/id)
                                              :type     :query
                                              :query    {:source-table (mt/id :venues)}}
                                             :type :model}
                     :model/Card mbql-nested {:name "mbql-nested"
                                              :dataset_query
                                              {:database (mt/id)
                                               :type     :query
                                               :query    {:source-table
                                                          (str "card__" (u/the-id mbql-model))}}}
                     :model/Card native-model {:name "native-model"
                                               :type :model
                                               :dataset_query
                                               {:database (mt/id)
                                                :type :native
                                                :native
                                                {:query
                                                 "select * from venues"
                                                 :template-tags {}}}}
                     :model/Card native-nested {:name "native-nested"
                                                :dataset_query
                                                {:database (mt/id)
                                                 :type :query
                                                 :query {:source-table
                                                         (str "card__" (u/the-id native-model))}}}]
        (doseq [[query-type card-id nested-id] [[:mbql
                                                 (u/the-id mbql-model) (u/the-id mbql-nested)]
                                                [:native
                                                 (u/the-id native-model) (u/the-id native-nested)]]]
          (testing query-type
            (query! card-id)            ; populate metadata by running the query.
            (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)
                  ;; simulate updating metadat with user changed stuff
                  user-edited (add-preserved metadata)]
              (t2/update! :model/Card card-id {:result_metadata user-edited})
              (testing "Saved metadata preserves user edits"
                (is (= (map only-user-edits user-edited)
                       (map only-user-edits (t2/select-one-fn :result_metadata :model/Card :id card-id)))))
              (testing "API response includes user edits"
                (is (= (map only-user-edits user-edited)
                       (->> (query! card-id)
                            :data :results_metadata :columns
                            (map only-user-edits)
                            (map #(update % :semantic_type keyword))))))
              (testing "Nested queries have metadata"
                (is (= (map only-user-edits user-edited)
                       (->> (query! nested-id)
                            :data :results_metadata :columns
                            (map only-user-edits)
                            (map #(update % :semantic_type keyword)))))))))))))

(deftest model-card-test-3
  (testing "Cards preserve edits to metadata when query changes"
    (let [query          (mt/mbql-query venues {:fields [$id $name]})
          modified-query (mt/mbql-query venues {:fields [$id $name $price]})
          norm           (comp u/upper-case-en :name)
          update-card!   (fn [card]
                           (mt/user-http-request :crowberto :put 200
                                                 (str "card/" (u/the-id card)) card))]
      (doseq [[query-type query modified-query] [["mbql"   query modified-query]
                                                 #_["native" (to-native query) (to-native modified-query)]]]
        (testing (str "For: " query-type)
          (mt/with-model-cleanup [:model/Card]
            (let [{metadata :result_metadata
                   card-id  :id :as card} (mt/user-http-request
                                           :crowberto :post 200
                                           "card"
                                           (assoc (card-with-name-and-query "card-name" query)
                                                  :type :model))]
              (assert (some? metadata))
              (is (= ["ID" "NAME"] (map norm metadata)))
              (is (=? {:result_metadata [{:display_name "EDITED DISPLAY"}
                                         {:display_name "EDITED DISPLAY"}]}
                      (update-card!
                       (assoc card
                              :result_metadata (map #(assoc % :display_name "EDITED DISPLAY") metadata)))))
              ;; simulate a user changing the query without rerunning the query
              (is (= ["EDITED DISPLAY" "EDITED DISPLAY" "PRICE"]
                     (->> (update-card! (assoc card
                                               :dataset_query modified-query
                                               :result_metadata (map #(assoc % :display_name "EDITED DISPLAY")
                                                                     metadata)))
                          :result_metadata
                          (map (comp u/upper-case-en :display_name)))))
              (is (= ["EDITED DISPLAY" "EDITED DISPLAY" "PRICE"]
                     (map (comp u/upper-case-en :display_name)
                          (t2/select-one-fn :result_metadata :model/Card :id card-id))))
              (testing "Even if you only send the new query and not existing metadata"
                (is (= ["EDITED DISPLAY" "EDITED DISPLAY"]
                       (->> (update-card! {:id (u/the-id card) :dataset_query query}) :result_metadata (map :display_name)))))
              (testing "Descriptions can be cleared (#20517)"
                (is (= ["foo" "foo"]
                       (->> (update-card! (update card
                                                  :result_metadata (fn [m]
                                                                     (map #(assoc % :description "foo") m))))
                            :result_metadata
                            (map :description))))
                (is (= ["" ""]
                       (->> (update-card! (update card
                                                  :result_metadata (fn [m]
                                                                     (map #(assoc % :description "") m))))
                            :result_metadata
                            (map :description))))))))))))

(deftest model-card-test-4
  (testing "Cards preserve edits to `visibility_type` (#22520)"
    (mt/with-temp [:model/Card model {:dataset_query (mt/mbql-query venues
                                                       {:fields [$id $name]
                                                        :limit 2})
                                      :type          :model}]
      (let [updated-metadata (-> model :result_metadata vec
                                 (assoc-in [1 :visibility_type]
                                           :details-only))
            response         (mt/user-http-request :crowberto :put 200 (format "card/%d" (u/the-id model))
                                                   (assoc model :result_metadata updated-metadata))]
        ;; check they come back from saving the question
        (is (= "details-only" (-> response :result_metadata last :visibility_type))
            "saving metadata lacks visibility type")
        (let [query-result (mt/user-http-request :crowberto :post 202 (format "card/%d/query"
                                                                              (u/the-id model)))]
          ;; ensure future responses also include them
          (is (= "details-only" (-> query-result
                                    :data :results_metadata :columns last :visibility_type))
              "subsequent query lacks visibility type")
          (is (= "details-only" (-> query-result
                                    :data :cols last :visibility_type))
              "in cols (important for the saved metadata)"))))))

(defn param-values-url
  "Returns an URL used to get values for parameter of a card.
  Use search end point if a `query` is provided."
  ([card-or-id param-key]
   (param-values-url card-or-id param-key nil))
  ([card-or-id param-key query]
   (if query
     (format "card/%d/params/%s/search/%s" (u/the-id card-or-id) (name param-key) query)
     (format "card/%d/params/%s/values" (u/the-id card-or-id) (name param-key)))))

(defn do-with-card-param-values-fixtures
  "Impl of `with-card-param-values-fixtures` macro."
  ([f]
   (do-with-card-param-values-fixtures nil f))

  ([card-values f]
   (mt/with-temp
     [:model/Card source-card {:database_id   (mt/id)
                               :table_id      (mt/id :venues)
                               :dataset_query (mt/mbql-query venues {})}
      :model/Card field-filter-card {:dataset_query
                                     {:database (mt/id)
                                      :type     :native
                                      :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE {{NAME}}"
                                                 :template-tags {"NAME" {:id           "name_param_id"
                                                                         :name         "NAME"
                                                                         :display_name "Name"
                                                                         :type         :dimension
                                                                         :dimension    [:field (mt/id :venues :name) nil]
                                                                         :required     true}}}}
                                     :name       "native card with field filter"
                                     :parameters [{:id     "name_param_id"
                                                   :type   :string/=
                                                   :target [:dimension [:template-tag "NAME"]]
                                                   :name   "Name"
                                                   :slug   "NAME"}]}
      :model/Card name-mapped-card  {:dataset_query
                                     {:database (mt/id)
                                      :type     :native
                                      :native   {:query         "SELECT COUNT(*) FROM PEOPLE WHERE {{ID}}"
                                                 :template-tags {"id" {:id           "id"
                                                                       :name         "ID"
                                                                       :display_name "Id"
                                                                       :type         :dimension
                                                                       :dimension    [:field (mt/id :people :id) nil]
                                                                       :required     true}}}}
                                     :name       "native card with named field filter"
                                     :parameters [{:id     "id"
                                                   :type   :number/>=
                                                   :target [:dimension [:template-tag "id"]]
                                                   :name   "Id"
                                                   :slug   "id"}]}
      :model/Card card        (merge
                               {:database_id   (mt/id)
                                :dataset_query (mt/mbql-query venues)
                                :parameters    [{:name                 "Static Category"
                                                 :slug                 "static_category"
                                                 :id                   "_STATIC_CATEGORY_"
                                                 :type                 "category"
                                                 :values_source_type   "static-list"
                                                 :values_source_config {:values ["African" "American" "Asian"]}}
                                                {:name                 "Static Category label"
                                                 :slug                 "static_category_label"
                                                 :id                   "_STATIC_CATEGORY_LABEL_"
                                                 :type                 "category"
                                                 :values_source_type   "static-list"
                                                 :values_source_config {:values [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}}
                                                {:name                 "Card as source"
                                                 :slug                 "card"
                                                 :id                   "_CARD_"
                                                 :type                 "category"
                                                 :values_source_type   "card"
                                                 :values_source_config {:card_id     (:id source-card)
                                                                        :value_field (mt/$ids $venues.name)}}]
                                :table_id      (mt/id :venues)}
                               card-values)]
     (f {:source-card       source-card
         :card              card
         :field-filter-card field-filter-card
         :name-mapped-card  name-mapped-card
         :param-keys        {:static-list          "_STATIC_CATEGORY_"
                             :static-list-label    "_STATIC_CATEGORY_LABEL_"
                             :card                 "_CARD_"
                             :field-values         "name_param_id"
                             :labeled-field-values "id"}}))))

(defmacro with-card-param-values-fixtures
  "Execute `body` with all needed setup to tests param values on card."
  [[binding card-values] & body]
  `(do-with-card-param-values-fixtures ~card-values (fn [~binding] ~@body)))

(deftest parameter-remapping-test
  (with-card-param-values-fixtures [{:keys [card field-filter-card name-mapped-card param-keys]}]
    (letfn [(request [{:keys [id] :as _card} value-source value]
              (mt/user-http-request :crowberto :get 200
                                    (format "card/%d/params/%s/remapping?value=%s" id (param-keys value-source) value)))]
      (are [card value-source value] (= [value] (request card value-source value))
        field-filter-card :field-values      "20th Century Cafe"
        field-filter-card :field-values      "Not a value in the DB"
        card              :card              "33 Taps"
        card              :card              "Not provided by the card"
        card              :static-list       "African"
        card              :static-list       "Whatever"
        card              :static-list-label "European")
      (is (= ["African" "Af"] (request card :static-list-label "African")))
      (is (= [42 "Reyes Strosin"] (request name-mapped-card :labeled-field-values "42"))))))

(deftest parameters-with-source-is-card-test
  (testing "getting values"
    (binding [custom-values/*max-rows* 5]
      (with-card-param-values-fixtures [{:keys [card param-keys]}]
        (testing "GET /api/card/:card-id/params/:param-key/values"
          (is (=? {:values          [["20th Century Cafe"] ["25°"] ["33 Taps"]
                                     ["800 Degrees Neapolitan Pizzeria"] ["BCD Tofu House"]]
                   :has_more_values true}
                  (mt/user-http-request :rasta :get 200 (param-values-url card (:card param-keys))))))

        (testing "GET /api/card/:card-id/params/:param-key/search/:query"
          (is (= {:values          [["Fred 62"] ["Red Medicine"]]
                  :has_more_values false}
                 (mt/user-http-request :rasta :get 200 (param-values-url card (:card param-keys) "red")))))))))

(deftest parameters-with-source-is-card-test-2
  (testing "fallback to field-values"
    (let [mock-default-result {:values          [["field-values"]]
                               :has_more_values false}]
      (with-redefs [queries.card/mapping->field-values (constantly mock-default-result)]
        (testing "if value-field not found in source card"
          (mt/with-temp
            [:model/Card {source-card-id :id} {}
             :model/Card card {:parameters [{:id                   "abc"
                                             :type                 "category"
                                             :name                 "CATEGORY"
                                             :values_source_type   "card"
                                             :values_source_config {:card_id     source-card-id
                                                                    :value_field (mt/$ids $venues.name)}}]}]
            (let [url (param-values-url card "abc")]
              (is (= mock-default-result (mt/user-http-request :rasta :get 200 url))))))

        (testing "if card is archived"
          (mt/with-temp
            [:model/Card {source-card-id :id} {:archived true}
             :model/Card card {:parameters [{:id                   "abc"
                                             :type                 "category"
                                             :name                 "CATEGORY"
                                             :values_source_type   "card"
                                             :values_source_config {:card_id     source-card-id
                                                                    :value_field (mt/$ids $venues.name)}}]}]
            (let [url (param-values-url card "abc")]
              (is (= mock-default-result (mt/user-http-request :rasta :get 200 url))))))))))

(deftest parameters-with-source-is-card-test-3
  (testing "users must have permissions to read the collection that source card is in"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp
        [:model/Collection  coll1                 {:name "Source card collection"}
         :model/Card {source-card-id :id}  {:collection_id (:id coll1)
                                            :database_id   (mt/id)
                                            :table_id      (mt/id :venues)
                                            :dataset_query (mt/mbql-query venues {:limit 5})}
         :model/Collection  coll2                 {:name "Card collections"}
         :model/Card {card-id         :id} {:collection_id  (:id coll2)
                                            :database_id    (mt/id)
                                            :dataset_query  (mt/mbql-query venues)
                                            :parameters     [{:id                   "abc"
                                                              :type                 "category"
                                                              :name                 "CATEGORY"
                                                              :values_source_type   "card"
                                                              :values_source_config {:card_id     source-card-id
                                                                                     :value_field (mt/$ids $venues.name)}}]
                                            :table_id       (mt/id :venues)}]
        (testing "Fail because user doesn't have read permissions to coll1"
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (param-values-url card-id "abc"))))
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (param-values-url card-id "abc" "search-query")))))
        ;; grant permission to read the collection contains the card
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll2)
        (testing "having read permissions to the card collection is not enough"
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (param-values-url card-id "abc"))))
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 (param-values-url card-id "abc" "search-query")))))
        ;; grant permission to read the collection contains the source card
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll1)
        (testing "success if has read permission to the source card's collection"
          (is (some? (mt/user-http-request :rasta :get 200 (param-values-url card-id "abc"))))
          (is (some? (mt/user-http-request :rasta :get 200 (param-values-url card-id "abc" "search-query")))))))))

(deftest parameters-using-old-style-field-values
  (with-card-param-values-fixtures [{:keys [param-keys field-filter-card]}]
    (testing "GET /api/card/:card-id/params/:param-key/values for field-filter based params"
      (testing "without search query"
        (let [response (mt/user-http-request :crowberto :get 200
                                             (param-values-url field-filter-card (:field-values param-keys)))]
          (is (false? (:has_more_values response)))
          (is (set/subset? #{["20th Century Cafe"] ["33 Taps"]}
                           (-> response :values set)))))
      (testing "with search query"
        (let [response (mt/user-http-request :crowberto :get 200
                                             (param-values-url field-filter-card
                                                               (:field-values param-keys)
                                                               "bar"))]
          (is (set/subset? #{["Barney's Beanery"] ["bigmista's barbecue"]}
                           (-> response :values set)))
          (is (not ((into #{} (mapcat identity) (:values response)) "The Virgil")))))))
  (testing "Old style, inferred parameters from native template-tags"
    (with-card-param-values-fixtures [{:keys [param-keys field-filter-card]}]
      ;; e2e tests and some older cards don't have an explicit parameter and infer them from the native template tags
      (t2/update! :model/Card (:id field-filter-card) {:parameters []})
      (testing "GET /api/card/:card-id/params/:param-key/values for field-filter based params"
        (testing "without search query"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (param-values-url field-filter-card (:field-values param-keys)))]
            (is (false? (:has_more_values response)))
            (is (set/subset? #{["20th Century Cafe"] ["33 Taps"]}
                             (-> response :values set)))))
        (testing "with search query"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (param-values-url field-filter-card
                                                                 (:field-values param-keys)
                                                                 "bar"))]
            (is (set/subset? #{["Barney's Beanery"] ["bigmista's barbecue"]}
                             (-> response :values set)))
            (is (not ((into #{} (mapcat identity) (:values response)) "The Virgil")))))))))

(deftest parameters-with-field-to-field-remapping-test
  (let [param-key "id_param_id"]
    (mt/with-temp
      [:model/Card card {:dataset_query
                         {:database (mt/id)
                          :type     :native
                          :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE {{ID}}"
                                     :template-tags {"ID" {:id           param-key
                                                           :name         "ID"
                                                           :display_name "ID"
                                                           :type         :dimension
                                                           :dimension    [:field (mt/id :venues :id) nil]
                                                           :required     true}}}}
                         :name       "native card with ID field filter"
                         :parameters [{:id     param-key,
                                       :type   :id,
                                       :target [:dimension [:template-tag "ID"]],
                                       :name   "ID",
                                       :slug   "ID"}]}]
      (testing "Get values for field-filter based params for Fields that have a Field -> Field remapping\n"
        (is (= :type/Name
               (t2/select-one-fn :semantic_type :model/Field (mt/id :venues :name)))
            "venues.name has semantic_type=type/Name, so it will be searched")
        (testing "without search query"
          (mt/let-url [url (param-values-url card param-key)]
            (is (partial= {:has_more_values false
                           :values [[1 "Red Medicine"] [2 "Stout Burgers & Beers"] [3 "The Apple Pan"]]}
                          (mt/user-http-request :crowberto :get 200 url)))))
        (testing "with search query"
          (mt/let-url [url (param-values-url card param-key "pan")]
            (is (partial= {:has_more_values true
                           :values [[3 "The Apple Pan"] [18 "The Original Pantry"] [62 "Hot Sauce and Panko"]]}
                          (mt/user-http-request :crowberto :get 200 url)))))))))

(deftest parameters-with-source-is-static-list-test
  (with-card-param-values-fixtures [{:keys [card param-keys]}]
    (testing "we could get the values"
      (is (= {:has_more_values false,
              :values          [["African"] ["American"] ["Asian"]]}
             (mt/user-http-request :rasta :get 200
                                   (param-values-url card (:static-list param-keys)))))

      (is (= {:has_more_values false,
              :values          [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}
             (mt/user-http-request :rasta :get 200
                                   (param-values-url card (:static-list-label param-keys))))))

    (testing "we could search the values"
      (is (= {:has_more_values false,
              :values          [["African"]]}
             (mt/user-http-request :rasta :get 200
                                   (param-values-url card (:static-list param-keys) "af"))))

      (is (= {:has_more_values false,
              :values          [["African" "Af"]]}
             (mt/user-http-request :rasta :get 200
                                   (param-values-url card (:static-list-label param-keys) "af")))))

    (testing "we could edit the values list"
      (let [card (mt/user-http-request :rasta :put 200 (str "card/" (:id card))
                                       {:parameters [{:name                  "Static Category",
                                                      :slug                  "static_category"
                                                      :id                    "_STATIC_CATEGORY_",
                                                      :type                  "category",
                                                      :values_source_type    "static-list"
                                                      :values_source_config {"values" ["BBQ" "Bakery" "Bar"]}}]})]
        (is (= [{:name                  "Static Category",
                 :slug                  "static_category"
                 :id                    "_STATIC_CATEGORY_",
                 :type                  "category",
                 :values_source_type    "static-list"
                 :values_source_config {:values ["BBQ" "Bakery" "Bar"]}}]
               (:parameters card)))))))

(deftest pivot-from-model-test
  (testing "Pivot options should match fields through models (#35319)"
    (mt/dataset test-data
      (testing "visualization_settings references field by id"
        (mt/with-temp [:model/Card model {:dataset_query (mt/mbql-query orders)
                                          :type :model}
                       :model/Card card {:dataset_query
                                         (mt/mbql-query nil
                                           {:source-table (str "card__" (u/the-id model))
                                            :breakout [[:field "USER_ID" {:base-type :type/Integer}]]
                                            :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]})
                                                   ;; The FE sometimes used a field id instead of field by name - we need
                                                   ;; to handle this
                                         :visualization_settings {:pivot_table.column_split {:rows    ["USER_ID"],
                                                                                             :columns [],
                                                                                             :values  ["sum"]},
                                                                  :table.cell_column "sum"}}]
          (with-cards-in-readable-collection! [model card]
            (is (=?
                 {:data {:cols [{:name "USER_ID"} {:name "pivot-grouping"} {:name "sum"}]}}
                 (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" (u/the-id card)))))))))))

(deftest pivot-from-model-test-2
  (testing "Pivot options should match fields through models (#35319)"
    (mt/dataset test-data
      (testing "visualization_settings references field by name"
        (mt/with-temp [:model/Card model {:dataset_query (mt/mbql-query orders)
                                          :type :model}
                       :model/Card card {:dataset_query
                                         (mt/mbql-query nil
                                           {:source-table (str "card__" (u/the-id model))
                                            :breakout [[:field "USER_ID" {:base-type :type/Integer}]]
                                            :aggregation [[:sum [:field "TOTAL" {:base-type :type/Float}]]]})
                                         :visualization_settings {:pivot_table.column_split {:rows    ["USER_ID"],
                                                                                             :columns [],
                                                                                             :values  ["sum"]},
                                                                  :table.cell_column "sum"}}]
          (with-cards-in-readable-collection! [model card]
            (is (=?
                 {:data {:cols [{:name "USER_ID"} {:name "pivot-grouping"} {:name "sum"}]}}
                 (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" (u/the-id card)))))))))))

(defn run-based-on-upload-test!
  "Runs tests for based-on-upload `request` is a function that takes a card and returns a map which may have {:based_on_upload <table-id>}]
  This function exists to deduplicate test logic for all API endpoints that must return `based_on_upload`,
  including GET /api/collection/:id/items and GET /api/card/:id"
  [request]
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (mt/with-discard-model-updates! [:model/Database] ; to restore any existing metabase_database.uploads_enabled=true
      (mt/with-temp [:model/Database   {db-id :id}         {:engine driver/*driver*}
                     :model/Database   {other-db-id :id}   {:engine driver/*driver* :uploads_enabled true}
                     :model/Table      {table-id :id}      {:db_id db-id, :is_upload true}
                     :model/Collection {collection-id :id} {}]
        (let [card-defaults {:collection_id collection-id
                             :type          :model
                             :dataset_query {:type     :query
                                             :database db-id
                                             :query    {:source-table table-id}}}]
          (mt/with-temp [:model/Card {card-id :id :as card} card-defaults]
            (testing "\nCards based on uploads have based_on_upload=<table-id> if they meet all the criteria"
              (is (= table-id (:based_on_upload (request card)))))
            (testing "If one of the criteria for appends is not met, based_on_upload should be nil."
              (testing "\nIf the card is based on another card, which is based on the table, based_on_upload should be nil"
                (mt/with-temp [:model/Card card' (assoc card-defaults
                                                        :dataset_query
                                                        {:type     :query
                                                         :database db-id
                                                         :query    {:source-table (str "card__" card-id)}})]
                  (is (nil? (:based_on_upload (request card'))))))
              (testing "\nIf the card has a join in the query (even to itself), based_on_upload should be nil"
                (mt/with-temp [:model/Card card' (assoc card-defaults
                                                        :dataset_query
                                                        {:type     :query
                                                         :database db-id
                                                         :query    {:source-table table-id
                                                                    :joins [{:fields       :all
                                                                             :source-table table-id
                                                                             :condition    [:= 1 2] ; field-ids don't matter
                                                                             :alias        "SomeAlias"}]}})]
                  (is (nil? (:based_on_upload (request card'))))))
              (testing "\nIf the table is not based on uploads, based_on_upload should be nil"
                (t2/update! :model/Table table-id {:is_upload false})
                (is (nil? (:based_on_upload (request card))))
                (t2/update! :model/Table table-id {:is_upload true}))
              (testing "\nIf the user doesn't have data perms for the database, based_on_upload should be nil"
                (mt/with-temp-copy-of-db
                  (mt/with-no-data-perms-for-all-users!
                    (is (nil? (:based_on_upload (mt/user-http-request :rasta :get 200 (str "card/" card-id))))))))
              (testing "\nIf the card is not a model, based_on_upload should be nil"
                (mt/with-temp [:model/Card card' (assoc card-defaults :type :question)]
                  (is (nil? (:based_on_upload (request card'))))))
              (testing "\nIf the card is a native query, based_on_upload should be nil"
                (mt/with-temp [:model/Card card' (assoc card-defaults
                                                        :dataset_query (mt/native-query {:query "select 1"}))]
                  (is (nil? (:based_on_upload (request card'))))))
              (testing "\nIf uploads are disabled on all databases, based_on_upload should be nil"
                (t2/update! :model/Database other-db-id {:uploads_enabled false})
                (is (nil? (:based_on_upload (request card))))))))))))

(deftest based-on-upload-test
  (run-based-on-upload-test!
   (fn [card]
     (mt/user-http-request :crowberto :get 200 (str "card/" (:id card))))))

(deftest save-mlv2-card-test
  (testing "POST /api/card"
    (testing "Should be able to save a Card with an MLv2 query (#39024)"
      (mt/with-model-cleanup [:model/Card]
        (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
              venues            (lib.metadata/table metadata-provider (mt/id :venues))
              query             (lib/query metadata-provider venues)
              response          (mt/user-http-request :crowberto :post 200 "card"
                                                      {:name                   "pMBQL Card"
                                                       :dataset_query          (dissoc query :lib/metadata)
                                                       :display                :table
                                                       :visualization_settings {}})]
          (is (=? {:dataset_query {:lib/type     "mbql/query"
                                   :lib/metadata (symbol "nil #_\"key is not present.\"") ; should be removed in JSON serialization
                                   :database     (mt/id)
                                   :stages       [{:lib/type     "mbql.stage/mbql"
                                                   :source-table (mt/id :venues)}]}}
                  response)))))))

(deftest ^:parallel run-mlv2-card-query-test
  (testing "POST /api/card/:id/query"
    (testing "Should be able to run a query for a Card with an MLv2 query (#39024)"
      (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            venues            (lib.metadata/table metadata-provider (mt/id :venues))
            query             (-> (lib/query metadata-provider venues)
                                  (lib/order-by (lib.metadata/field metadata-provider (mt/id :venues :id)))
                                  (lib/limit 2))]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
          (is (=? {:data {:rows [[1 "Red Medicine" 4 10.0646 -165.374 3]
                                 [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]}}
                  (mt/user-http-request :crowberto :post 202 (format "card/%d/query" card-id)))))))))

(deftest ^:parallel validate-template-tags-test
  (testing "POST /api/card"
    (testing "Disallow saving a Card with native query Field filter template tags referencing a different Database (#14145)"
      (let [bird-counts-db-id (mt/dataset daily-bird-counts (mt/id))
            card-data         {:database_id            bird-counts-db-id
                               :dataset_query          {:database bird-counts-db-id
                                                        :type     :native
                                                        :native   {:query         "SELECT COUNT(*) FROM PRODUCTS WHERE {{FILTER}}"
                                                                   :template-tags {"FILTER" {:id           "_FILTER_"
                                                                                             :name         "FILTER"
                                                                                             :display-name "Filter"
                                                                                             :type         :dimension
                                                                                             :dimension    [:field (mt/id :venues :name) nil]
                                                                                             :widget-type  :string/=
                                                                                             :default      nil}}}}
                               :name                   "Bad Card"
                               :display                "table"
                               :visualization_settings {}}]
        (is (=? {:message #"Invalid Field Filter: Field \d+ \"VENUES\"\.\"NAME\" belongs to Database \d+ \"test-data \(h2\)\", but the query is against Database \d+ \"daily-bird-counts \(h2\)\""}
                (mt/user-http-request :crowberto :post 400 "card" card-data)))))))

(deftest ^:parallel format-export-middleware-test
  (testing "The `:format-rows` query processor middleware results in formatted/unformatted rows when set to true/false."
    (let [q             {:database (mt/id)
                         :type     :native
                         :native   {:query "SELECT 2000 AS number, '2024-03-26'::DATE AS date;"}}
          output-helper {:csv  (fn [output] (->> output csv/read-csv))
                         :json (fn [[row]] [(map name (keys row)) (vals row)])}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query q
                                                :display       :table
                                                :visualization_settings
                                                {:column_settings
                                                 {"[\"name\",\"NUMBER\"]" {:column_title "Custom Title"}
                                                  "[\"name\",\"DATE\"]"   {:column_title "Custom Title 2"}}}}]
        (doseq [[export-format apply-formatting? expected] [[:csv true [["Custom Title" "Custom Title 2"]
                                                                        ["2,000" "March 26, 2024"]]]
                                                            [:csv false [["NUMBER" "DATE"]
                                                                         ["2000" "2024-03-26"]]]
                                                            [:json true [["Custom Title" "Custom Title 2"]
                                                                         ["2,000" "March 26, 2024"]]]
                                                            [:json false [["NUMBER" "DATE"]
                                                                          [2000 "2024-03-26"]]]]]
          (testing (format "export_format %s yields expected output for %s exports." apply-formatting? export-format)
            (is (= expected
                   (->> (mt/user-http-request
                         :crowberto :post 200
                         (format "card/%s/query/%s" card-id (name export-format))
                         {:format_rows apply-formatting?})
                        ((get output-helper export-format)))))))))))

(deftest ^:parallel can-restore
  (mt/with-temp [:model/Collection collection-a {:name "A"}
                 :model/Card {card-id :id} {:name "My Card"
                                            :collection_id (u/the-id collection-a)}]
    ;; trash the card
    (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived true})
    ;; trash the parent collection
    (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection-a)) {:archived true})
    (is (false? (:can_restore (mt/user-http-request :crowberto :get 200 (str "card/" card-id)))))))

(deftest ^:parallel can-run-adhoc-query-test
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        venues            (lib.metadata/table metadata-provider (mt/id :venues))
        query             (lib/query metadata-provider venues)]
    (mt/with-temp [:model/Card card {:dataset_query query}
                   :model/Card no-query {}]
      (is (=? {:can_run_adhoc_query true}
              (mt/user-http-request :crowberto :get 200 (str "card/" (:id card)))))
      (is (=? {:can_run_adhoc_query false}
              (mt/user-http-request :crowberto :get 200 (str "card/" (:id no-query))))))))

(deftest can-manage-db-test
  (mt/with-temp [:model/Card card {:type :model}]
    (mt/with-no-data-perms-for-all-users!
      (is (=? {:can_manage_db true}
              (mt/user-http-request :crowberto :get 200 (str "card/" (:id card)))))
      (is (=? {:can_manage_db false}
              (mt/user-http-request :rasta :get 200 (str "card/" (:id card))))))))

(deftest data-and-collection-query-permissions-test
  (mt/with-temp [:model/Collection collection  {}
                 :model/Card       card        {:dataset_query {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query "SELECT id FROM venues ORDER BY id ASC LIMIT 2;"}}
                                                :database_id   (mt/id)
                                                :collection_id (u/the-id collection)}]
    (letfn [(process-query []
              (mt/user-http-request :rasta :post (format "card/%d/query" (u/the-id card))))
            (blocked? [response] (= "You don't have permissions to do that." response))]
      ;;    | Data perms | Collection perms | outcome
      ;;    ------------ | ---------------- | --------
      ;;    | no         | no               | blocked
      ;;    | yes        | no               | blocked
      ;;    | no         | yes              | blocked
      ;;    | yes        | yes              | OK

      (testing "Should NOT be able to run the parent Card with :blocked data-perms and no collection perms"
        (mt/with-no-data-perms-for-all-users!
          (mt/with-non-admin-groups-no-collection-perms collection
            (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :blocked)
            (perms/revoke-collection-permissions! (perms-group/all-users) collection)
            (mt/with-test-user :rasta
              (is (not (mi/can-read? collection)))
              (is (not (mi/can-read? card))))
            (is (blocked? (process-query))))))

      (testing "Should NOT be able to run the parent Card with valid data-perms and no collection perms"
        (mt/with-no-data-perms-for-all-users!
          (mt/with-non-admin-groups-no-collection-perms collection
            (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :unrestricted)
            (perms/revoke-collection-permissions! (perms-group/all-users) collection)
            (mt/with-test-user :rasta
              (is (not (mi/can-read? collection)))
              (is (not (mi/can-read? card))))
            (is (blocked? (process-query))))))

      (testing "should NOT be able to run native queries with :blocked data-perms on any table"
        (mt/with-no-data-perms-for-all-users!
          (mt/with-non-admin-groups-no-collection-perms collection
            (data-perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :blocked)
            (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
            (mt/with-test-user :rasta
              (is (mi/can-read? collection))
              (is (mi/can-read? card)))
            (is (process-query)))))

      ;; delete these in place so we can reset them below, you cannot set them twice in a row
      (perms/revoke-collection-permissions! (perms-group/all-users) collection)

      (testing "should NOT be able to run the parent Card when data-perms and valid collection perms"
        (mt/with-no-data-perms-for-all-users!
          (mt/with-non-admin-groups-no-collection-perms collection
            (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
            (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
            (mt/with-test-user :rasta
              (is (mi/can-read? collection))
              (is (mi/can-read? card)))
            (is (= [[1] [2]] (mt/rows (process-query))))))))))

(defn- native-card-with-template-tags []
  {:dataset_query
   {:type     :native
    :native   {:query "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */"
               :template-tags
               {"id"      {:name         "id"
                           :display-name "Id"
                           :id           "_id_"
                           :type         :dimension
                           :dimension    [:field (mt/id :people :id) nil]
                           :widget-type  :id
                           :default      nil}
                "name"    {:name         "name"
                           :display-name "Name"
                           :id           "_name_"
                           :type         :dimension
                           :dimension    [:field (mt/id :people :name) nil]
                           :widget-type  :category
                           :default      nil}
                "source"  {:name         "source"
                           :display-name "Source"
                           :id           "_soure_"
                           :type         :dimension
                           :dimension    [:field (mt/id :people :source) nil]
                           :widget-type  :category
                           :default      nil}
                "user_id" {:name         "user_id"
                           :display-name "User"
                           :id           "_user_id_"
                           :type         :dimension
                           :dimension    [:field (mt/id :orders :user_id) nil]
                           :widget-type  :id
                           :default      nil}}}
    :database (mt/id)}
   :query_type :native
   :database_id (mt/id)})

(deftest ^:parallel query-metadata-test
  (mt/with-temp
    [:model/Card {card-id-1 :id} {:dataset_query (mt/mbql-query products)
                                  :database_id (mt/id)}
     :model/Card {card-id-2 :id} (native-card-with-template-tags)]
    (testing "Simple card"
      (is (=?
           {:fields empty?
            :tables (sort-by :id [{:id (mt/id :products)}])
            :databases [{:id (mt/id) :engine string?}]}
           (-> (mt/user-http-request :crowberto :get 200 (str "card/" card-id-1 "/query_metadata"))
               (api.test-util/select-query-metadata-keys-for-debugging)))))
    (testing "Parameterized native query"
      (is (=?
           {:fields (sort-by :id
                             [{:id (mt/id :people :id)}
                              {:id (mt/id :orders :user_id)}
                              {:id (mt/id :people :source)}
                              {:id (mt/id :people :name)}])
            :tables (sort-by :id
                             [{:id (str "card__" card-id-2)}])
            :databases [{:id (mt/id) :engine string?}]}
           (-> (mt/user-http-request :crowberto :get 200 (str "card/" card-id-2 "/query_metadata"))
               (api.test-util/select-query-metadata-keys-for-debugging)))))))

(deftest card-query-metadata-with-archived-and-deleted-source-card-test
  (testing "Don't throw an error if source card is deleted (#48461)"
    (mt/with-temp
      [:model/Card {card-id-1 :id} {:dataset_query (mt/mbql-query products)}
       :model/Card {card-id-2 :id} {:dataset_query {:type  :query
                                                    :query {:source-table (str "card__" card-id-1)}}}]
      (letfn [(query-metadata [expected-status card-id]
                (-> (mt/user-http-request :crowberto :get expected-status (str "card/" card-id "/query_metadata"))
                    (api.test-util/select-query-metadata-keys-for-debugging)))]
        (api.test-util/before-and-after-deleted-card
         card-id-1
         #(testing "Before delete"
            (doseq [[card-id table-id] [[card-id-1 (mt/id :products)]
                                        [card-id-2 (str "card__" card-id-1)]]]
              (is (=?
                   {:fields empty?
                    :tables [{:id table-id}]
                    :databases [{:id (mt/id) :engine string?}]}
                   (query-metadata 200 card-id)))))
         #(testing "After delete"
            (doseq [card-id [card-id-1 card-id-2]]
              (is (= "Not found."
                     (query-metadata 404 card-id))))))))))

(deftest card-query-metadata-no-tables-test
  (testing "Don't throw an error if users doesn't have access to any tables #44043"
    (let [original-can-read? mi/can-read?]
      (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
        (with-redefs [mi/can-read? (fn [& args]
                                     (if (= :model/Table (apply mi/dispatch-on-model args))
                                       false
                                       (apply original-can-read? args)))]
          (is (map? (mt/user-http-request :crowberto :get 200 (format "card/%d/query_metadata" (:id card))))))))))

(deftest pivot-tables-with-model-sources-show-row-totals
  (testing "Pivot Tables with a model source will return row totals (#46575)"
    (mt/with-temp [:model/Card {model-id :id} {:type :model
                                               :dataset_query
                                               (mt/mbql-query orders
                                                 {:joins
                                                  [{:fields       :all
                                                    :strategy     :left-join
                                                    :alias        "People - User"
                                                    :condition
                                                    [:=
                                                     [:field (mt/id :orders :user_id) {:base-type :type/Integer}]
                                                     [:field (mt/id :people :id) {:base-type :type/BigInteger :join-alias "People - User"}]]
                                                    :source-table (mt/id :people)}]})}
                   :model/Card {pivot-id :id} {:display :pivot
                                               :dataset_query
                                               (mt/mbql-query nil
                                                 {:aggregation  [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
                                                  :breakout
                                                  [[:field "CREATED_AT" {:base-type :type/DateTime, :temporal-unit :month}]
                                                   [:field "NAME" {:base-type :type/Text}]
                                                   [:field (mt/id :products :category) {:base-type    :type/Text
                                                                                        :source-field (mt/id :orders :product_id)}]]
                                                  :source-table (format "card__%s" model-id)})
                                               :visualization_settings
                                               {:pivot_table.column_split
                                                {:rows    ["NAME" "CREATED_AT"]
                                                 :columns ["CATEGORY"]
                                                 :values  ["sum"]}}}]
      ;; pivot row totals have a pivot-grouping of 1 (the second-last column in these results)
      ;; before fixing issue #46575, these rows would not be returned given the model + card setup
      (is (= [nil "Abbey Satterfield" "Doohickey" 1 347.91]
             (let [result (mt/user-http-request :rasta :post 202 (format "card/pivot/%d/query" pivot-id))
                   totals (filter (fn [row]
                                    (< 0 (second (reverse row))))
                                  (get-in result [:data :rows]))]
               (first totals)))))))

(deftest dashboard-internal-card-creation
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Collection {other-coll-id :id} {}
                 :model/Dashboard {dash-id :id} {:collection_id coll-id}
                 :model/DashboardTab {dt1-id :id} {:dashboard_id dash-id}
                 :model/DashboardTab {dt2-id :id} {:dashboard_id dash-id}]
    (testing "We can create a dashboard internal card"
      (let [card-id (:id (mt/user-http-request :crowberto :post 200 "card" (assoc (card-with-name-and-query)
                                                                                  :dashboard_id dash-id)))]
        (testing "We autoplace a dashboard card for the new question"
          (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-id)))))
    (testing "We can create a dashboard internal card on a particular tab"
      (let [card-on-1st-tab-id (:id (mt/user-http-request :crowberto :post 200 "card" (assoc (card-with-name-and-query)
                                                                                             :dashboard_id dash-id
                                                                                             :dashboard_tab_id dt1-id)))
            card-on-2nd-tab-id (:id (mt/user-http-request :crowberto :post 200 "card" (assoc (card-with-name-and-query)
                                                                                             :dashboard_id dash-id
                                                                                             :dashboard_tab_id dt2-id)))]
        (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-on-1st-tab-id :dashboard_tab_id dt1-id))
        (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-on-2nd-tab-id :dashboard_tab_id dt2-id))))
    (testing "We can't specify a tab ID without specifying a dashboard"
      (mt/user-http-request :crowberto :post 400 "card" (assoc (card-with-name-and-query)
                                                               :dashboard_tab_id dt1-id)))
    (testing "We can't create a dashboard internal card with a collection_id different that its dashboard's"
      (mt/user-http-request :crowberto :post 400 "card" (assoc (card-with-name-and-query)
                                                               :dashboard_id dash-id
                                                               :collection_id other-coll-id)))
    (testing "... including `null` (the root collection id)"
      (mt/user-http-request :crowberto :post 400 "card" (assoc (card-with-name-and-query)
                                                               :dashboard_id dash-id
                                                               :collection_id nil)))
    (testing "We can't create a dashboard internal card with a non-question `type`"
      (mt/user-http-request :crowberto :post 400 "card" (assoc (card-with-name-and-query)
                                                               :dashboard_id dash-id
                                                               :type "model")))
    (testing "We can't create a dashboard internal card with a non-null :collection_position"
      (mt/user-http-request :crowberto :post 400 "card" (assoc (card-with-name-and-query)
                                                               :dashboard_id dash-id
                                                               :collection_position 5)))))

(deftest dashboard-internal-card-updates
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Collection {other-coll-id :id} {}
                 :model/Dashboard {dash-id :id} {:collection_id coll-id}
                 :model/Dashboard {other-dash-id :id} {}
                 :model/Card {card-id :id} {:dashboard_id dash-id}
                 :model/Card {other-card-id :id} {}]
    (testing "We can update with `archived=true` or `archived=false`"
      (is (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived true}))
      (is (t2/select-one-fn :archived :model/Card card-id))
      (is (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived false}))
      (is (not (t2/select-one-fn :archived :model/Card card-id))))
    (testing "we can update the name"
      (is (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:name "foo"}))
      (is (= "foo" (t2/select-one-fn :name :model/Card card-id))))
    (testing "We can update with `dashboard_id` for a normal card."
      (is (mt/user-http-request :crowberto :put 200 (str "card/" other-card-id) {:dashboard_id dash-id}))
      (is (= dash-id (t2/select-one-fn :dashboard_id :model/Card :id other-card-id))))
    (testing "We can update a DQ with a `dashboard_id`"
      (is (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:dashboard_id other-dash-id}))
      (is (nil? (t2/select-one-fn :collection_id :model/Card :id card-id))))
    (testing "We can't update the `collection_id`"
      (is (mt/user-http-request :crowberto :put 400 (str "card/" card-id) {:collection_id other-coll-id})))
    (testing "We can't set the `type`"
      (is (mt/user-http-request :crowberto :put 400 (str "card/" card-id) {:type "model"})))))

(deftest dashboard-questions-get-autoplaced-on-unarchive-or-placement
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Dashboard {dash-id :id} {:collection_id coll-id}
                 :model/Card {card-id :id} {}]
    (let [dashcard-exists? #(t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-id)]
      ;; move it to the dashboard - now it has a dashcard (autoplacement)
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:dashboard_id dash-id})
      (is (dashcard-exists?))
      ;; archive it and remove it from the dashboard
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived true})
      (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id dash-id)
      ;; unarchive it, it gets autoplaced
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived false})
      (is (dashcard-exists?))))
  (testing "it works when the dashboard has an empty tab"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardTab {dt-id :id} {:dashboard_id dash-id}
                   :model/Card {card-id :id} {}]
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:dashboard_id dash-id})
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :dashboard_tab_id dt-id :card_id card-id))
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived true})
      (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id dash-id)

      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived false})
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :dashboard_tab_id dt-id :card_id card-id))))
  (testing "even when the card was on a tab before, it gets autoplaced to the first tab"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardTab {first-tab-id :id} {:dashboard_id dash-id}
                   :model/DashboardTab {dt-id :id} {:dashboard_id dash-id}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id dt-id :card_id card-id}]
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:dashboard_id dash-id})
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :dashboard_tab_id dt-id :card_id card-id))
      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived true})
      (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id dash-id)

      (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived false})
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :dashboard_tab_id first-tab-id :card_id card-id)))))

(deftest move-question-to-collection-test
  (testing "We can move a dashboard question to a collection"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:dashboard_id dash-id}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id      card-id}]
      (is (=? {:collection_id coll-id
               :dashboard_id  nil}
              (mt/user-http-request :rasta :put 200 (str "card/" card-id) {:collection_id coll-id
                                                                           :dashboard_id  nil})))
      (is (= coll-id (t2/select-one-fn :collection_id :model/Card card-id)))
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-id)))))

(deftest move-question-to-dashboard-can-choose-tab-test
  (testing "We can move a question to a dashboard, choosing a particular tab"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardTab {dt1-id :id} {:dashboard_id dash-id}
                   :model/DashboardTab {dt2-id :id} {:dashboard_id dash-id}
                   :model/Card {card-1-id :id} {:collection_id coll-id}
                   :model/Card {card-2-id :id} {:collection_id coll-id}]
      (mt/user-http-request :rasta :put 200 (str "card/" card-1-id) {:dashboard_id dash-id
                                                                     :dashboard_tab_id dt1-id})
      (mt/user-http-request :rasta :put 200 (str "card/" card-2-id) {:dashboard_id dash-id
                                                                     :dashboard_tab_id dt2-id})
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-1-id :dashboard_tab_id dt1-id))
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-2-id :dashboard_tab_id dt2-id)))))

(deftest moving-archived-question-to-dashboard-can-specify-tab-test
  (testing "We can unarchive a question and move it to a specific dashboard tab"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardTab {dt1-id :id} {:dashboard_id dash-id}
                   :model/DashboardTab {dt2-id :id} {:dashboard_id dash-id}
                   :model/Card {card-1-id :id} {:collection_id coll-id :archived true}
                   :model/Card {card-2-id :id} {:collection_id coll-id :archived true}]
      (mt/user-http-request :rasta :put 200 (str "card/" card-1-id)
                            {:dashboard_id dash-id
                             :dashboard_tab_id dt1-id})
      (mt/user-http-request :rasta :put 200 (str "card/" card-2-id)
                            {:dashboard_id dash-id
                             :dashboard_tab_id dt2-id})
      (is (false? (:archived (t2/select-one :model/Card :id card-1-id))))
      (is (false? (:archived (t2/select-one :model/Card :id card-2-id))))
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-1-id :dashboard_tab_id dt1-id))
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-2-id :dashboard_tab_id dt2-id)))))

(deftest moving-archived-dqs-can-specify-tab-test
  (testing "We can specify a dashboard_tab_id when unarchiving a question that's already a DQ"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardTab {dt1-id :id} {:dashboard_id dash-id}
                   :model/DashboardTab {dt2-id :id} {:dashboard_id dash-id}
                   :model/Card {card-1-id :id} {:collection_id coll-id
                                                :archived true
                                                :dashboard_id dash-id}
                   :model/Card {card-2-id :id} {:collection_id coll-id
                                                :archived true
                                                :dashboard_id dash-id}]
      ;; Unarchive DQs and specify their tabs
      (mt/user-http-request :rasta :put 200 (str "card/" card-1-id)
                            {:dashboard_tab_id dt1-id
                             :archived false})
      (mt/user-http-request :rasta :put 200 (str "card/" card-2-id)
                            {:dashboard_tab_id dt2-id
                             :archived false})
      ;; Verify cards are unarchived and associated with correct tabs
      (is (false? (:archived (t2/select-one :model/Card :id card-1-id))))
      (is (false? (:archived (t2/select-one :model/Card :id card-2-id))))
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-1-id :dashboard_tab_id dt1-id))
      (is (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-2-id :dashboard_tab_id dt2-id)))))

(deftest move-question-to-collection-remove-reference-test
  (testing "We can move a dashboard question to a collection and remove the old reference to it"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:dashboard_id dash-id}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id      card-id}]
      (is (=? {:collection_id coll-id
               :dashboard_id  nil}
              (mt/user-http-request :rasta :put 200 (str "card/" card-id "?delete_old_dashcards=true")
                                    {:collection_id coll-id
                                     :dashboard_id  nil})))
      (is (= coll-id (t2/select-one-fn :collection_id :model/Card card-id)))
      (is (not (t2/exists? :model/DashboardCard :dashboard_id dash-id :card_id card-id))))))

(deftest move-question-to-existing-dashboard-test
  (testing "We can move a question from a collection to a dashboard it is already in"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id      card-id}]
      (is (=? {:collection_id coll-id
               :dashboard_id  dash-id}
              (mt/user-http-request :rasta :put 200 (str "card/" card-id) {:dashboard_id dash-id}))))))

(deftest move-question-to-new-dashboard-test
  (testing "We can move a question from a collection to a dashboard it is NOT already in"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardCard _ {:dashboard_id dash-id}
                   :model/Card {card-id :id} {}]
      (is (=? {:collection_id coll-id
               :dashboard_id  dash-id}
              (mt/user-http-request :rasta :put 200 (str "card/" card-id) {:dashboard_id dash-id})))
      (is (=? {:dashboard_id dash-id :card_id card-id}
              (t2/select-one :model/DashboardCard :dashboard_id dash-id :card_id card-id))))))

(deftest move-question-to-dashboard-with-tabs
  (testing "We can move a question from a collection to a dashboard with tabs"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardTab {dash-tab-id :id} {:dashboard_id dash-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :dashboard_tab_id dash-tab-id}
                   :model/Card {card-id :id} {}]
      (is (=? {:collection_id coll-id
               :dashboard_id  dash-id}
              (mt/user-http-request :rasta :put 200 (str "card/" card-id) {:dashboard_id dash-id})))
      (is (=? {:dashboard_id dash-id :card_id card-id :dashboard_tab_id dash-tab-id}
              (t2/select-one :model/DashboardCard :dashboard_id dash-id :card_id card-id))))))

(deftest move-question-between-dashboards-test
  (testing "We can move a question from one dashboard to another"
    (mt/with-temp [:model/Collection {source-coll-id :id} {}
                   :model/Collection {dest-coll-id :id} {}
                   :model/Dashboard {source-dash-id :id} {:collection_id source-coll-id}
                   :model/Dashboard {dest-dash-id :id} {:collection_id dest-coll-id}
                   :model/Card {card-id :id} {:dashboard_id source-dash-id}
                   :model/DashboardCard _ {:dashboard_id source-dash-id :card_id card-id}]
      (is (=? {:collection_id dest-coll-id
               :dashboard_id  dest-dash-id}
              (mt/user-http-request :rasta :put 200 (str "card/" card-id) {:dashboard_id dest-dash-id})))
      (testing "old dashcards are deleted, a new one is created"
        (is (=? #{dest-dash-id}
                (set (map :dashboard_id (t2/select :model/DashboardCard :card_id card-id)))))))))

(deftest cant-move-question-to-dashboard-if-in-another-test
  (testing "We can't move a question from a collection to a dashboard if it's in another dashboard"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Dashboard {other-dash-id :id} {}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id other-dash-id
                                           :card_id      card-id}]
      (mt/user-http-request :rasta :put 400 (str "card/" card-id) {:dashboard_id dash-id}))))

(deftest can-move-with-delete-old-dashcards-test
  (testing "... unless we pass `delete_old_dashcards=true`"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Dashboard {other-dash-id :id} {}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id other-dash-id
                                           :card_id      card-id}]
      (mt/user-http-request :rasta :put 200 (str "card/" card-id "?delete_old_dashcards=true") {:dashboard_id dash-id})
      (is (= #{dash-id} (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id card-id))))))

(deftest cant-move-question-if-in-dashboard-as-series-test
  (testing "We can't move a question from a collection to a dashboard if it's in another dashboard AS A SERIES"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Dashboard {other-dash-id :id} {}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard {dc-id :id} {:dashboard_id other-dash-id}
                   :model/DashboardCardSeries _ {:dashboardcard_id dc-id :card_id card-id}]
      (mt/user-http-request :rasta :put 400 (str "card/" card-id) {:dashboard_id dash-id})
      (testing "... again, unless we pass `delete_old_dashcards=true`"
        (mt/user-http-request :rasta :put 200 (str "card/" card-id "?delete_old_dashcards=true") {:dashboard_id dash-id})))))

(deftest move-fails-without-permissions-test
  (testing "And, if we don't have permissions on the other dashboard, it fails even when we pass `delete_old_dashcards`"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Collection {forbidden-coll-id :id} {}
                     :model/Collection {_coll-id :id} {}
                     :model/Dashboard {other-dash-id :id} {:collection_id forbidden-coll-id}
                     :model/Dashboard {dash-id :id} {}
                     :model/Card {card-id :id} {}
                     :model/DashboardCard _ {:dashboard_id other-dash-id :card_id card-id}]
        (perms/revoke-collection-permissions! (perms-group/all-users) forbidden-coll-id)
        (testing "We get a 403 back, because we don't have permissions"
          (is (= "You don't have permissions to do that."
                ;; regardless of the `delete_old_dashcards` value, same response
                 (mt/user-http-request :rasta :put 403 (str "card/" card-id "?delete_old_dashcards=true") {:dashboard_id dash-id})
                 (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:dashboard_id dash-id}))))
        (testing "The card is still in the old dashboard and not the new one"
          (is (= #{other-dash-id} (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id card-id))))))))

(deftest move-fails-without-permissions-series-test
  (testing "The above includes when a card is 'in' a dashboard in a series"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/Collection {forbidden-coll-id :id} {}
                     :model/Collection {_coll-id :id} {}
                     :model/Dashboard {other-dash-id :id other-dash-name :name} {:collection_id forbidden-coll-id}
                     :model/Dashboard {dash-id :id} {}
                     :model/Card {card-id :id} {}
                     :model/DashboardCard {dc-id :id} {:dashboard_id other-dash-id}
                     :model/DashboardCardSeries _ {:dashboardcard_id dc-id :card_id card-id}]
        (perms/revoke-collection-permissions! (perms-group/all-users) forbidden-coll-id)
        (testing "We get a 403 back, because we don't have permissions"
          (is (= "You don't have permissions to do that."
                ;; regardless of the `delete_old_dashcards` value, same response
                 (mt/user-http-request :rasta :put 403 (str "card/" card-id "?delete_old_dashcards=true") {:dashboard_id dash-id})
                 (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:dashboard_id dash-id}))))
        (testing "The card is still in the old dashboard and not the new one"
          (is (= [{:name other-dash-name
                   :collection_id forbidden-coll-id
                   :id other-dash-id
                   :description nil
                   :archived false}]
                 (:in_dashboards (t2/hydrate (t2/select-one :model/Card :id card-id) :in_dashboards))))
          (is (nil? (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id card-id))))))))

(deftest moving-archived-card-test
  (testing "Moving an archived card to a Dashboard unarchives and autoplaces it"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {:archived true}]
      ;; move it to a dashboard
      (mt/user-http-request :rasta :put 200 (str "card/" card-id) {:dashboard_id dash-id})
      (testing "we actually did the change (i.e. it's a DQ now)"
        (is (= dash-id (:dashboard_id (t2/select-one :model/Card :id card-id)))))
      (testing "it got unarchived"
        (is (not (:archived (t2/select-one :model/Card :id card-id)))))
      (testing "it got autoplaced"
        (is (= dash-id (t2/select-one-fn :dashboard_id [:model/DashboardCard :dashboard_id] :card_id card-id)))))))

(deftest cant-archive-and-move-test
  (testing "You can't mark a card as archived *and* move it to a dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}
                   :model/Card {card-id :id} {}]
      (mt/user-http-request :rasta :put 400 (str "card/" card-id) {:dashboard_id dash-id :archived true}))))

(deftest we-can-get-a-list-of-dashboards-a-card-appears-in
  (testing "a card in one dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "My Dashboard"}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (is (= [{:id dash-id
               :name "My Dashboard"}]
             (mt/user-http-request :rasta :get 200 (str "card/" card-id "/dashboards"))))))

  (testing "card in no dashboards"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (is (= []
             (mt/user-http-request :rasta :get 200 (str "card/" card-id "/dashboards"))))))

  (testing "card in multiple dashboards"
    (mt/with-temp [:model/Dashboard {dash-id1 :id} {:name "Dashboard One"}
                   :model/Dashboard {dash-id2 :id} {:name "Dashboard Two"}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id1 :card_id card-id}
                   :model/DashboardCard _ {:dashboard_id dash-id2 :card_id card-id}]
      (is (= [{:id dash-id1 :name "Dashboard One"}
              {:id dash-id2 :name "Dashboard Two"}]
             (mt/user-http-request :rasta :get 200 (str "card/" card-id "/dashboards"))))))

  (testing "card in the same dashboard twice"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "My Dashboard"}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (is (= [{:id dash-id :name "My Dashboard"}]
             (mt/user-http-request :rasta :get 200 (str "card/" card-id "/dashboards"))))))

  (testing "If it's in the dashboard in a series, it's counted as 'in' the dashboard"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "My Dashboard"}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard {dc-id :id} {:dashboard_id dash-id}
                   :model/DashboardCardSeries _ {:dashboardcard_id dc-id :card_id card-id}]
      (is (= [{:id dash-id :name "My Dashboard"}]
             (mt/user-http-request :rasta :get 200 (str "card/" card-id "/dashboards"))))))

  (testing "nonexistent card"
    (mt/user-http-request :rasta :get 404 "card/invalid-id/dashboards"))

  (testing "Don't have permissions on all the dashboards involved"
    (mt/with-temp [:model/Collection {allowed-coll-id :id} {:name "The allowed collection"}
                   :model/Collection {forbidden-coll-id :id} {:name "The forbidden collection"}
                   :model/Dashboard {allowed-dash-id :id} {:name "The allowed dashboard" :collection_id allowed-coll-id}
                   :model/Dashboard {forbidden-dash-id :id} {:name "The forbidden dashboard" :collection_id forbidden-coll-id}
                   :model/Card {card-id :id} {}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id allowed-dash-id}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id forbidden-dash-id}]
      (perms/revoke-collection-permissions! (perms-group/all-users) forbidden-coll-id)
      (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :get 403 (str "card/" card-id "/dashboards")))))))

(deftest dashboard-questions-have-hydrated-dashboard-details
  (mt/with-temp [:model/Dashboard {dash-id :id} {:name "My Dashboard"}
                 :model/Card {card-id :id} {:dashboard_id dash-id}
                 :model/ModerationReview {mr-id :id} {:moderated_item_id   dash-id
                                                      :moderated_item_type "dashboard"
                                                      :moderator_id        (mt/user->id :rasta)
                                                      :most_recent         true
                                                      :status              "verified"
                                                      :text                "lookin good"}]
    (is (= {:name "My Dashboard"
            :id dash-id
            :moderation_status "verified"}
           (-> (mt/user-http-request :rasta :get 200 (str "card/" card-id))
               :dashboard)))
    (t2/delete! :model/ModerationReview mr-id)
    (is (= {:name "My Dashboard"
            :id dash-id
            :moderation_status nil}
           (-> (mt/user-http-request :rasta :get 200 (str "card/" card-id))
               :dashboard)))))

(deftest dashboard-questions-can-be-created-without-specifying-a-collection-id
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:name "My Dashboard"
                                                   :collection_id coll-id}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
      (testing "Specifying only `collection_id` works"
        (mt/user-http-request :rasta :post 200 "card/"
                              (assoc (card-with-name-and-query)
                                     :collection_id coll-id)))
      (testing "Specifying only `dashboard_id` works"
        (mt/user-http-request :rasta :post 200 "card/"
                              (assoc (card-with-name-and-query)
                                     :dashboard_id dash-id)))
      (testing "Specifying both works"
        (mt/user-http-request :rasta :post 200 "card/"
                              (assoc (card-with-name-and-query)
                                     :collection_id coll-id
                                     :dashboard_id dash-id)))
      (testing "Specifying both fails if they're different"
        (is (= (tru "Mismatch detected between Dashboard''s `collection_id` ({0}) and `collection_id` ({1})"
                    coll-id
                    nil)
               (mt/user-http-request :rasta :post 400 "card/"
                                     (assoc (card-with-name-and-query)
                                            :collection_id nil
                                            :dashboard_id dash-id))))))))

(deftest cannot-move-question-to-dashboard-without-permissions
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {coll-id-1 :id} {}
                   :model/Collection {coll-id-2 :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id-2}
                   :model/Card {card-id :id} {:collection_id coll-id-1}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id-1)
      (testing "with read-only permissions on the destination collection"
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-id-2)
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id-2)
        (testing "just to be sure, we can't directly move it to the read-only collection"
          (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:collection_id coll-id-2}))
        (testing "we can't move it to the dashboard in the read-only collection"
          (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:dashboard_id dash-id})
          (is (not= dash-id (t2/select-one-fn :dashboard_id :model/Card :id card-id)))))
      (testing "with no permissions on the destination collection"
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-id-2)
        (testing "just to be sure, we can't directly move it to the no-perms collection"
          (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:collection_id coll-id-2}))
        (testing "we can't move it to the dashboard in the no-perms collection"
          (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:dashboard_id dash-id})
          (is (not= dash-id (t2/select-one-fn :dashboard_id :model/Card :id card-id))))))
    (testing "the root collection works the same way"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id nil}
                     :model/Card {card-id :id} {:collection_id coll-id}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
        (testing "can't move to the root collection"
          (mt/user-http-request :rasta :put 403 (str "card/" card-id) {:dashboard_id dash-id}))))))

(deftest cannot-join-question-with-itself
  (testing "Cannot join card with itself."
    (let [mp (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count))
                    (as-> $q (lib/breakout $q (m/find-first (comp #{"Created At"} :display-name)
                                                            (lib/breakoutable-columns $q)))))]
      (doseq [card-type-a [:question :metric :model]]
        (mt/with-temp [:model/Card {:keys [id]} {:dataset_query (lib/->legacy-MBQL query) :type card-type-a}]
          (let [card (lib.metadata/card mp id)
                columns (lib/returned-columns (lib/query mp card))
                right-column (m/find-first (comp #{"ID"} :display-name) columns)
                query-with-self-join (lib/join query
                                               (lib/join-clause card
                                                                [(lib/=
                                                                  (lib.metadata/field mp (mt/id :orders :id))
                                                                  right-column)]))]
            (doseq [card-type-b [:question :metric :model]]
              (mt/user-http-request :crowberto :put 400 (str "card/" id)
                                    {:dataset_query (lib/->legacy-MBQL query-with-self-join)
                                     :type card-type-b}))))))))

(deftest cannot-use-self-as-source
  (testing "Cannot use self as source for card."
    (let [mp (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (doseq [card-type-a [:question :model]]
        (mt/with-temp [:model/Card {:keys [id]} {:dataset_query (lib/->legacy-MBQL query) :type card-type-a}]
          (let [query-with-self-source (lib/with-different-table query (str "card__" id))]
            (doseq [card-type-b [:question :model]]
              (mt/user-http-request :crowberto :put 400 (str "card/" id)
                                    {:dataset_query (lib/->legacy-MBQL query-with-self-source)
                                     :type card-type-b}))))))))

(deftest cannot-save-metric-with-formula-cycle
  (testing "Cannot aggregate a metric with itself."
    (let [mp (mt/metadata-provider)
          query-a (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/aggregate (lib/count))
                      (as-> $q (lib/breakout $q (m/find-first (comp #{"Created At"} :display-name)
                                                              (lib/breakoutable-columns $q)))))]
      (mt/with-temp [:model/Card {id-a :id} {:dataset_query (lib/->legacy-MBQL query-a) :type :metric}]
        (let [query-b (lib/aggregate query-a (lib.metadata/metric mp id-a))]
          (mt/with-temp [:model/Card {id-b :id} {:dataset_query (lib/->legacy-MBQL query-b) :type :metric}]
            (let [query-with-cycle (lib/aggregate query-a (lib.metadata/metric mp id-b))]
              (mt/user-http-request :crowberto :put 400 (str "card/" id-a)
                                    {:dataset_query (lib/->legacy-MBQL query-with-cycle)
                                     :type :metric}))))))))

(deftest cannot-join-question-with-other-question-joining-original
  (testing "Cannot join in a chain of cards to make cycle."
    (let [mp (mt/metadata-provider)
          query-a (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/aggregate (lib/count))
                      (as-> $q (lib/breakout $q (m/find-first (comp #{"Created At"} :display-name)
                                                              (lib/breakoutable-columns $q)))))]
      (doseq [card-type-a [:question :metric :model]]
        (mt/with-temp [:model/Card {id-a :id} {:dataset_query (lib/->legacy-MBQL query-a) :type card-type-a}]
          (let [card-a (lib.metadata/card mp id-a)
                columns (lib/returned-columns (lib/query mp card-a))
                right-column-a (m/find-first (comp #{"ID"} :display-name) columns)
                query-b (lib/join query-a
                                  (lib/join-clause card-a
                                                   [(lib/=
                                                     (lib.metadata/field mp (mt/id :orders :id))
                                                     right-column-a)]))]
            (doseq [card-type-b [:question :metric :model]]
              (mt/with-temp [:model/Card {id-b :id} {:dataset_query (lib/->legacy-MBQL query-b) :type card-type-b}]
                (let [card-b (lib.metadata/card mp id-b)
                      columns (lib/returned-columns (lib/query mp card-b))
                      left-column-b (m/find-first (comp #{"ID"} :display-name) columns)
                      query-cycle (lib/join query-a
                                            (lib/join-clause card-b
                                                             [(lib/=
                                                               left-column-b
                                                               right-column-a)]))]
                  (doseq [card-type-c [:question :metric :model]]
                    (mt/user-http-request :crowberto :put 400 (str "card/" id-a)
                                          {:dataset_query (lib/->legacy-MBQL query-cycle)
                                           :type card-type-c})))))))))))

(deftest cannot-make-query-cycles-with-native-queries-test
  (testing "Cannot make query cycles that include native queries"
    (let [mp (mt/metadata-provider)
          query-a (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Card {id-a :id} {:dataset_query (lib/->legacy-MBQL query-a) :type :question}]
        (let [query-b (mt/native-query {:query "select * from {{#100-base-query}}"
                                        :template-tags
                                        {:#100-base-query
                                         {:type :card
                                          :name "#100-base-query"
                                          :id (random-uuid)
                                          :card-id id-a
                                          :display-name "#100 Base Query"}}})]
          (mt/with-temp [:model/Card {id-b :id} {:dataset_query query-b :type :question}]
            (let [query-cycle (lib/query mp (lib.metadata/card mp id-b))]
              (mt/user-http-request :crowberto :put 400 (str "card/" id-a)
                                    {:dataset_query (lib/->legacy-MBQL query-cycle)
                                     :type :question}))))))))

(deftest e2e-card-update-invalidates-cache-test
  (testing "Card update invalidates card's cache (#55955)"
    (let [existing-config (t2/select-one :model/CacheConfig :model_id 0 :model "root")]
      (try
        ;; First delete the existing root config because if that exists (shouldn't, but you know..)
        ;; with-temp will fail. This is imho simpler then checking whether that exists and based on the result of
        ;; the query either doing update or insert.
        (when existing-config
          (t2/delete! :model/CacheConfig :model_id 0 :model "root"))
        (mt/with-temp
          [:model/CacheConfig
           _
           {:model_id 0
            :model "root"
            :strategy "ttl"
            :config {:multiplier 99999, :min_duration_ms 1}}

           :model/Card
           model
           {:type :model
            :dataset_query (let [mp (mt/metadata-provider)]
                             (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                 (lib/limit 10)
                                 lib.convert/->legacy-MBQL))}]
          (letfn [;; Query results should get cached on following request.
                  (card-query-post-request
                    []
                    (mt/user-http-request :rasta :post 202 (str "card/" (:id model) "/query")
                                          {:collection_preview false
                                           :ignore_cache       false
                                           :parameters         []}))
                  ;; Query cache should get invalidated on following request.
                  (card-put-request [result_metadata]
                    (mt/user-http-request :rasta :put 200
                                          (str "card/" (:id model))
                                          {:result_metadata result_metadata}))]
            (let [post-response (do (card-query-post-request)
                                    (card-query-post-request))
                  raw-results-metadata (get-in post-response [:data :results_metadata :columns])]
              (testing "Base: Initial query is cached (2nd post request's response)"
                (is (some? (:cached post-response))))
              (let [put-resonse (card-put-request (cons (assoc (first raw-results-metadata) :display_name "This is ID")
                                                        (rest raw-results-metadata)))]
                (testing "Base: Put changes results_metadata successfully"
                  (is (= "This is ID"
                         (-> put-resonse :result_metadata first :display_name))))))
            (testing "Card request not cached. Preceding post successfully invalidated the cache."
              (let [post-response (card-query-post-request)
                    id-display-name (-> post-response :data :results_metadata :columns first :display_name)]
                (testing "Cache is NOT being used, cache was invalidated"
                  (is (nil? (:cached post-response))))
                (testing "Metadata edit persists"
                  (is (= "This is ID" id-display-name)))))
            (testing "Last post request cached the query successfully"
              (let [post-response (card-query-post-request)
                    id-display-name (-> post-response :data :results_metadata :columns first :display_name)]
                (testing "Cache is being used."
                  (is (some? (:cached post-response))))
                (testing "Metadata edit persists"
                  (is (= "This is ID" id-display-name)))))))
        (finally
          (when existing-config
            (t2/insert! :model/CacheConfig existing-config)))))))
