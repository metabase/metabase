(ns metabase.dynamic-goals.core-test
  "Tests for running dynamic goal sources: `POST /api/dynamic-goal/values`, the values of a saved chart's goals, and the
  public endpoints wrapping them."
  {:clj-kondo/config '{:linters
                       ;; allowing `with-temp` here since this tests the REST API which doesn't use
                       ;; metadata providers. Same exception as [[metabase.query-processor.card-test]].
                       {:discouraged-var {metabase.test/with-temp           {:level :off}
                                          toucan2.tools.with-temp/with-temp {:level :off}}
                        :deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.dynamic-goals.core-test]}}}}}}
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.cache.models.cache-config :as cache-config]
   [metabase.dynamic-goals.core :as dynamic-goals]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.db :as qp.db]
   [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- goal-values
  "`POST /api/dynamic-goal/values` for `sources` as `user` (default crowberto), with `body` merged into the request."
  ([sources]
   (goal-values :crowberto sources))
  ([user sources & {:as body}]
   (mt/user-http-request user :post 202 "dynamic-goal/values" (merge {:sources sources} body))))

(defn- source-result
  "The result of the source with `source-type` and `id` in a goal values `response`, whether it came over HTTP (the
  test client keywordizes the type key and parses numeric keys back to ints) or straight from the core."
  [response source-type id]
  (or (get-in response [(keyword source-type) id])
      (get-in response [(name source-type) (str id)])))

(defn- chart-goal-values
  "The values of the goals saved card `card-id` draws on dashcard `dashcard-id` (none for a card on its own), as
  `user` (default crowberto)."
  [card-id & {:keys [dashcard-id user] :or {user :crowberto}}]
  (mt/with-current-user (mt/user->id user)
    (dynamic-goals/chart-goal-values (t2/select-one :model/Card :id card-id)
                                     (some->> dashcard-id (t2/select-one :model/DashboardCard :id)))))

(defn- venues-count-measure
  "A measure definition counting venues; its query returns a single row."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- goal-ref [card-id]
  {:id card-id :type "card" :column "count"})

(defn- count-query [table]
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id table) :aggregation [[:count]]}})

(defn- chart-card
  "With-temp attributes of a card counting venues, drawn as `display` with `viz-settings`."
  [display viz-settings]
  {:dataset_query          (count-query :venues)
   :display                display
   :visualization_settings viz-settings})

(defn- goal-chart
  "A line chart whose goal line points at `source-type` `goal-id`'s `count` column."
  [source-type goal-id]
  {:dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
   :display                :line
   :visualization_settings {:graph.show_goal  true
                            :graph.goal_value {:id goal-id :type source-type :column "count"}}})

;;; ---------------------------------------------- POST /api/dynamic-goal/values ----------------------------------------------

(deftest values-endpoint-test
  (testing "POST /api/dynamic-goal/values runs the given cards and returns their single-row values"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [goal (source-result (goal-values [{:type "card" :id goal-id :columns ["count"]}]) :card goal-id)]
        (is (nil? (:error goal)))
        (is (= "completed" (:status goal)))
        (is (= [[1000]] (get-in goal [:data :rows])))
        (is (= ["count"] (map :name (get-in goal [:data :cols]))))))))

(deftest values-endpoint-measure-test
  (testing "a measure runs its definition, same as a card's dataset_query"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (let [goal (source-result (goal-values [{:type "measure" :id measure-id}]) :measure measure-id)]
        (is (= "completed" (:status goal)))
        (is (= [[100]] (get-in goal [:data :rows])))))))

(deftest values-endpoint-cards-and-measures-keyed-separately-test
  (testing "a card and a measure sharing an id don't collide in the response"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}
                   :model/Card    {card-id :id}    {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [response (goal-values [{:type "card" :id card-id} {:type "measure" :id measure-id}])]
        (is (= [[1000]] (get-in (source-result response :card card-id) [:data :rows])))
        (is (= [[100]] (get-in (source-result response :measure measure-id) [:data :rows])))))))

(deftest values-endpoint-column-projection-test
  (testing "only the requested columns are returned"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:limit 1})}]
      (let [goal (source-result (goal-values [{:type "card" :id goal-id :columns ["NAME" "PRICE"]}]) :card goal-id)]
        (is (= "completed" (:status goal)))
        (is (= ["NAME" "PRICE"] (map :name (get-in goal [:data :cols]))))
        (is (= 1 (count (get-in goal [:data :rows])))))))
  (testing "a requested column that isn't in the result is dropped rather than erroring"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:limit 1})}]
      (let [goal (source-result (goal-values [{:type "card" :id goal-id :columns ["NAME" "NOPE"]}]) :card goal-id)]
        (is (= "completed" (:status goal)))
        (is (= ["NAME"] (map :name (get-in goal [:data :cols]))))))))

(deftest values-endpoint-multi-row-source-test
  (testing "a source returning more than one row fails softly instead of being truncated"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [goal (source-result (goal-values [{:type "card" :id goal-id :columns ["NAME"]}]) :card goal-id)]
        (is (= "failed" (:status goal)))
        (is (= "too-many-rows" (:error_type goal)))
        (is (re-find #"more rows than the maximum" (:error goal)))))))

(deftest values-endpoint-error-handling-test
  (testing "a source that can't be resolved fails softly, and the others still run"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [response (goal-values [{:type "card" :id Integer/MAX_VALUE :columns ["count"]}
                                   {:type "measure" :id Integer/MAX_VALUE}
                                   {:type "card" :id goal-id}])]
        (testing "the error type lets the FE explain that the source is gone"
          (is (=? {:status "failed" :error string? :error_type "not-found"}
                  (source-result response :card Integer/MAX_VALUE)))
          (is (=? {:status "failed" :error_type "not-found"}
                  (source-result response :measure Integer/MAX_VALUE))))
        (testing "another source in the same call still resolves"
          (is (= "completed" (:status (source-result response :card goal-id)))))))))

(deftest values-endpoint-source-of-source-missing-test
  (testing "a source whose own query reads a deleted card still exists, so this is a query failure"
    (mt/with-temp [:model/Card {inner-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card {goal-id :id}  {:dataset_query {:database (mt/id)
                                                               :type     :query
                                                               :query    {:source-table (str "card__" inner-id)}}}]
      (t2/delete! :model/Card :id inner-id)
      (let [goal (source-result (goal-values [{:type "card" :id goal-id}]) :card goal-id)]
        (is (= "failed" (:status goal)))
        (is (nil? (:error_type goal)))))))

(deftest values-endpoint-archived-source-test
  (testing "archiving a goal's source doesn't break the goal: unlike a deleted source, it still resolves"
    (mt/with-temp [:model/Card    {card-id :id}    {:archived      true
                                                    :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Measure {measure-id :id} {:archived   true
                                                    :name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (let [response (goal-values [{:type "card" :id card-id} {:type "measure" :id measure-id}])]
        (is (= [[100]] (get-in (source-result response :card card-id) [:data :rows])))
        (is (= [[100]] (get-in (source-result response :measure measure-id) [:data :rows])))))))

(deftest values-endpoint-unreadable-sources-test
  (testing "a card the caller can't read fails softly"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card       {goal-id :id} {:collection_id coll-id
                                                      :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
        (is (=? {:status "failed" :error string?}
                (source-result (goal-values :rasta [{:type "card" :id goal-id :columns ["count"]}]) :card goal-id))))))
  (testing "a measure whose table the caller can't read fails softly"
    ;; measure perms delegate to its table, a different route from the collection perms a card goes through
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues) :perms/view-data :blocked
        (is (=? {:status "failed" :error string?}
                (source-result (goal-values :rasta [{:type "measure" :id measure-id}]) :measure measure-id)))))))

(deftest values-endpoint-request-validation-test
  (testing "an unrecognized source type is a 400"
    (mt/user-http-request :crowberto :post 400 "dynamic-goal/values" {:sources [{:type "dashboard" :id 1}]}))
  (testing "a request caps how many sources it can fan out to"
    (let [sources (fn [n] (mapv (fn [id] {:type "card" :id id}) (range 1 (inc n))))]
      (testing "20 is allowed"
        (is (map? (goal-values (sources 20)))))
      (testing "21 is refused"
        (mt/user-http-request :crowberto :post 400 "dynamic-goal/values" {:sources (sources 21)})))))

(deftest values-endpoint-duplicate-sources-test
  (testing "sources naming the same entity run it once"
    (let [ran (atom [])]
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:fields   [$name $price]
                                                                                      :order-by [[:asc $id]]
                                                                                      :limit    1})}]
        (letfn [(goal [sources]
                  (reset! ran [])
                  (mt/with-dynamic-fn-redefs [dynamic-goals/run-source
                                              (let [run-source (mt/original-fn #'dynamic-goals/run-source)]
                                                (fn [source opts]
                                                  (swap! ran conj (:id source))
                                                  (run-source source opts)))]
                    (source-result (goal-values (mapv #(assoc % :type "card" :id goal-id) sources)) :card goal-id)))]
          (testing "and answer the columns all of them asked for"
            (is (= ["NAME" "PRICE"]
                   (map :name (get-in (goal [{:columns ["NAME"]} {:columns ["PRICE"]}]) [:data :cols]))))
            (is (= [goal-id] @ran)))
          (testing "a source asking for every column wins over one that narrows them"
            (is (= 2 (count (get-in (goal [{:columns ["NAME"]} {}]) [:data :cols]))))))))))

;;; ------------------------------------------------- Metric sources --------------------------------------------------

(defn- metric-card
  "A `:type :metric` card summing Orders.Total, optionally grouped by month.
  With `breakout?` this is the shape of the shipped \"Revenue\" example metric: an aggregation and a
  temporal breakout both saved in `:dataset_query`."
  [breakout?]
  (let [mp (mt/metadata-provider)]
    {:name          (if breakout? "Revenue by month" "Revenue")
     :type          :metric
     :dataset_query (cond-> (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))
                      breakout? (lib/breakout (lib/with-temporal-bucket
                                                (lib.metadata/field mp (mt/id :orders :created_at))
                                                :month)))}))

(defn- card-value
  "Run card `id` as a goal source, asking for `columns`, and return its result."
  [id columns]
  (source-result (goal-values [{:type "card" :id id :columns columns}]) :card id))

(deftest metric-source-test
  (testing "a metric whose definition is just an aggregation resolves to its single value"
    (mt/with-temp [:model/Card {metric-id :id} (metric-card false)]
      (let [result (card-value metric-id ["sum"])]
        (is (= "completed" (:status result)))
        (is (= 1 (count (get-in result [:data :rows])))))))
  (testing "a metric grouped for display still resolves to one value, the aggregation over everything"
    ;; The shipped "Revenue" example metric saves a quarterly breakout in its :dataset_query, so running it
    ;; verbatim returned a row per quarter and failed the reference.
    (mt/with-temp [:model/Card {metric-id :id} (metric-card true)
                   :model/Card {plain-id :id}  (metric-card false)]
      (let [grouped (card-value metric-id ["sum"])]
        (is (= "completed" (:status grouped)))
        (is (= 1 (count (get-in grouped [:data :rows]))))
        (testing "and it matches what the same metric without the breakout returns"
          (is (= (get-in (card-value plain-id ["sum"]) [:data :rows])
                 (get-in grouped [:data :rows])))))))
  (testing "a plain question with a breakout still fails: only a metric's grouping is presentation"
    (mt/with-temp [:model/Card {card-id :id} (assoc (metric-card true) :type :question)]
      (is (=? {:status "failed" :error_type "too-many-rows" :error #".*more rows than the maximum.*"}
              (card-value card-id ["sum"]))))))

;;; -------------------------------------------- Sources with parameters ---------------------------------------------

(defn- native-card
  "With-temp attributes of a native card running `sql`; `tag` is merged into a `tenant` variable when given."
  ([sql]
   {:dataset_query (mt/native-query {:query sql})})
  ([sql tag]
   {:dataset_query (mt/native-query {:query         sql
                                     :template-tags {"tenant" (merge {:id "_TENANT_" :name "tenant"
                                                                      :display-name "Tenant" :type :number}
                                                                     tag)}})}))

(def ^:private venues-by-tenant "SELECT COUNT(*) AS \"count\" FROM venues WHERE category_id = {{tenant}}")

(defn- card-on
  "With-temp attributes of an MBQL card counting the rows of card `card-id`."
  [card-id]
  {:dataset_query {:database (mt/id) :type :query :query {:source-table (str "card__" card-id)
                                                          :aggregation  [[:count]]}}})

(defn- card-referencing
  "With-temp attributes of a native card counting the rows of card `card-id` through a `{{#id}}` tag."
  [card-id]
  (let [tag (str "#" card-id "-source")]
    {:dataset_query (mt/native-query {:query         (str "SELECT COUNT(*) AS \"count\" FROM {{" tag "}} source")
                                      :template-tags {tag {:id (str "source-" card-id) :name tag
                                                           :display-name "Source" :type :card :card-id card-id}}})}))

(defn- card-values
  "The goal values of each of `card-ids`, asking for its `count`, by id."
  [card-ids]
  (let [response (goal-values (for [id card-ids] {:type "card" :id id :columns ["count"]}))]
    (into {} (for [id card-ids] [id (source-result response :card id)]))))

(deftest source-with-parameters-is-refused-test
  (testing "a card whose query reads parameters, directly or through a card it reads, fails that goal only"
    (mt/with-temp [:model/Card {required :id}   (native-card venues-by-tenant {:required true})
                   :model/Card {defaulted :id}  (native-card venues-by-tenant {:default 2})
                   :model/Card {optional :id}   (native-card (str "SELECT COUNT(*) AS \"count\" FROM venues"
                                                                  " [[WHERE category_id = {{tenant}}]]")
                                                             {})
                   :model/Card {field-filter :id}
                   (native-card "SELECT COUNT(*) AS \"count\" FROM venues WHERE {{tenant}}"
                                {:type        :dimension
                                 :dimension   [:field (mt/id :venues :category_id) nil]
                                 :widget-type :number/=})
                   :model/Card {with-params :id} (assoc (card-on required)
                                                        :parameters [{:id "p" :slug "p" :name "P" :type :category}])
                   :model/Card {on-defaulted :id}          (card-on defaulted)
                   :model/Card {on-on-defaulted :id}       (card-on on-defaulted)
                   :model/Card {referencing-required :id}  (card-referencing required)
                   :model/Card {referencing-optional :id}  (card-referencing optional)]
      (let [refused {"required variable"              required
                     "defaulted variable"             defaulted
                     "optional clause"                optional
                     "field filter"                   field-filter
                     "card parameters"                with-params
                     "built on a defaulted card"      on-defaulted
                     "two levels down"                on-on-defaulted
                     "{{#}} to a required card"       referencing-required
                     "{{#}} to an optional card"      referencing-optional}
            goals   (card-values (vals refused))]
        (doseq [[label id] refused]
          (testing label
            (is (=? {:status "failed" :error_type "has-parameters" :error string?}
                    (get goals id)))))))))

(deftest source-without-parameters-runs-test
  (testing "snippets and `{{#id}}` tags splice content in, so they don't count as parameters"
    (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "all venues" :content "venues"}
                   :model/Card {plain :id}       (native-card "SELECT COUNT(*) AS \"count\" FROM venues")
                   :model/Card {referencing :id} (card-referencing plain)
                   :model/Card {snippet :id}
                   {:dataset_query (mt/native-query
                                    {:query         "SELECT COUNT(*) AS \"count\" FROM {{snippet: all venues}}"
                                     :template-tags {"snippet: all venues" {:name         "snippet: all venues"
                                                                            :display-name "All venues"
                                                                            :type         :snippet
                                                                            :snippet-name "all venues"
                                                                            :snippet-id   snippet-id}}})}]
      (let [goals (card-values [referencing snippet])]
        ;; the `{{#id}}` card counts the plain card's single row
        (doseq [[id rows] {referencing [[1]], snippet [[100]]}]
          (is (=? {:status "completed" :data {:rows rows}}
                  (get goals id))))))))

(deftest source-reference-cycle-test
  (testing "a reference cycle between saved cards, which only writes that skip the API can make, still returns"
    (mt/with-temp [:model/Card {a :id} (native-card "SELECT 1 AS \"count\"")
                   :model/Card {b :id} (card-on a)
                   :model/Card {c :id} (card-referencing b)
                   :model/Card {self :id} (native-card "SELECT 1 AS \"count\"")
                   :model/Card {variable :id} (native-card venues-by-tenant {:default 2})
                   :model/Card {with-variable :id} (card-on variable)]
      ;; a -> c -> b -> a, self -> self, and with-variable -> a cycle through a card with a variable
      (t2/update! :model/Card :id a {:dataset_query (:dataset_query (card-on c))})
      (t2/update! :model/Card :id self {:dataset_query (:dataset_query (card-referencing self))})
      (let [tag (str "#" with-variable "-x")]
        (t2/update! :model/Card :id variable
                    {:dataset_query
                     (mt/native-query
                      {:query         (str "SELECT COUNT(*) AS \"count\" FROM {{" tag "}} x WHERE {{tenant}} = 2")
                       :template-tags {"tenant" {:id "_TENANT_" :name "tenant" :display-name "Tenant"
                                                 :type :number :default 2}
                                       tag      {:id (str "x" with-variable) :name tag :display-name "X"
                                                 :type :card :card-id with-variable}}})}))
      (let [goals (deref (future (card-values [a self with-variable])) 60000 ::timed-out)]
        (is (not= ::timed-out goals))
        (when (map? goals)
          (testing "without a variable, the cycle fails that goal"
            (doseq [id [a self]]
              (is (= "failed" (get-in goals [id :status])))
              (is (not= "has-parameters" (get-in goals [id :error_type])))))
          (testing "with a variable in the cycle, the goal is refused for it"
            (is (=? {:status "failed" :error_type "has-parameters"}
                    (get goals with-variable)))))))))

;;; ---------------------------------------------------- Running ----------------------------------------------------

(deftest ^:parallel source-query-info-test
  (let [mp    (mt/metadata-provider)
        query #(#'dynamic-goals/source-query (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                             %1 %2 {:dashboard-id 3})]
    (testing "a card source is recorded under its own context, with its id and the chart's dashboard"
      (is (=? {:info       {:context :dynamic-goal, :card-id 7, :dashboard-id 3}
               :middleware {:userland-query? true}}
              (query "card" 7))))
    (testing "a measure has no card id to stamp, so it must not borrow the key"
      (is (not (contains? (:info (query "measure" 7)) :card-id))))))

(deftest cross-database-source-test
  (testing "a source on a different database than the chart still runs"
    (let [main-query (mt/mbql-query venues {:aggregation [[:count]]})]
      (mt/dataset places-cam-likes
        (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query places {:aggregation [[:count]]})}]
          (is (=? {:status "completed" :data {:rows [[3]]}}
                  (source-result (goal-values [{:type "card" :id goal-id}]) :card goal-id)))
          (mt/with-temporary-setting-values [enable-public-sharing true]
            (mt/with-temp [:model/Card      {chart-id :id, card-uuid :public_uuid} {:dataset_query main-query
                                                                                    :display       :scalar
                                                                                    :public_uuid   (str (random-uuid))}
                           :model/Dashboard {dash-id :id, dash-uuid :public_uuid}  {:public_uuid (str (random-uuid))}
                           :model/DashboardCard {dashcard-id :id} {:dashboard_id           dash-id
                                                                   :card_id                chart-id
                                                                   :visualization_settings {:scalar.segments
                                                                                            [{:min   (goal-ref goal-id)
                                                                                              :max   nil
                                                                                              :color "red"}]}}]
              (testing "a dashcard reads the reference from its viz settings"
                (is (= [[3]] (get-in (source-result (chart-goal-values chart-id :dashcard-id dashcard-id)
                                                    :card goal-id)
                                     [:data :rows]))))
              (testing "a public dashcard reads it too"
                (is (= [[3]] (-> (client/client :get 202 (format "public/dashboard/%s/dashcard/%d/goal-values"
                                                                 dash-uuid dashcard-id))
                                 (source-result :card goal-id)
                                 (get-in [:data :rows])))))
              (testing "a public card reads it from its own viz settings"
                (t2/update! :model/Card :id chart-id {:visualization_settings {:scalar.segments
                                                                               [{:min   (goal-ref goal-id)
                                                                                 :max   nil
                                                                                 :color "red"}]}})
                (is (= [[3]] (-> (client/client :get 202 (str "public/card/" card-uuid "/goal-values"))
                                 (source-result :card goal-id)
                                 (get-in [:data :rows]))))))))))))

(deftest sources-run-in-parallel-test
  (testing "the sources of one call run at the same time"
    (mt/with-temp [:model/Card {card-1 :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card {card-2 :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [both-started (java.util.concurrent.CountDownLatch. 2)]
        (mt/with-dynamic-fn-redefs [qp/process-query (fn [& _]
                                                       (.countDown both-started)
                                                       ;; a sequential run would wait here forever for the other one
                                                       (.await both-started 10 java.util.concurrent.TimeUnit/SECONDS)
                                                       {:status :completed :data {:rows [[1]] :cols []}})]
          (is (= #{"completed"}
                 (set (map :status (vals (get (mt/with-current-user (mt/user->id :crowberto)
                                                (dynamic-goals/goal-values [{:type "card" :id card-1}
                                                                            {:type "card" :id card-2}]))
                                              "card"))))))
          (is (zero? (.getCount both-started))))))))

(deftest each-source-run-stays-cancelable-test
  (testing "a cancel reaches a source run after another source of the same call finished"
    (mt/with-temp [:model/Card {card-1 :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card {card-2 :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (let [outer-chan     (a/promise-chan)
            runs           (atom 0)
            first-finished (promise)
            seen           (atom nil)]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-dynamic-fn-redefs [qp/process-query
                                      (fn [& _]
                                        (if (= 1 (swap! runs inc))
                                          ;; a finished query closes its cancel chan, as the pipeline does
                                          (do (a/close! qp.pipeline/*canceled-chan*)
                                              (deliver first-finished true))
                                          (do (deref first-finished 5000 nil)
                                              (a/>!! outer-chan ::cancel)
                                              (reset! seen (first (a/alts!! [qp.pipeline/*canceled-chan*
                                                                             (a/timeout 5000)])))))
                                        {:status :completed :data {:rows [[1]] :cols []}})]
            (binding [qp.pipeline/*canceled-chan* outer-chan]
              (dynamic-goals/goal-values [{:type "card" :id card-1} {:type "card" :id card-2}]))))
        (is (= 2 @runs))
        (is (= ::cancel @seen))))))

(deftest canceled-call-runs-no-sources-test
  (testing "once the client hung up, no more sources run"
    (let [ran (atom [])]
      (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (fn [source _opts]
                                                             (swap! ran conj (:id source))
                                                             {:status "completed"})]
        (binding [qp.pipeline/*canceled-chan* (doto (a/promise-chan) (a/>!! ::cancel))]
          (is (empty? (dynamic-goals/goal-values [{:type "card" :id 1} {:type "card" :id 2}])))
          (is (= [] @ran)))))))

(deftest refused-sources-test
  (testing "`:check-sources` refuses sources before they run"
    (mt/with-temp [:model/Card {allowed :id} {:dataset_query (count-query :venues)}
                   :model/Card {refused :id} {:dataset_query (count-query :venues)}]
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (dynamic-goals/goal-values [{:type "card" :id allowed} {:type "card" :id refused}]
                                                :check-sources (constantly {["card" refused] "No."})))]
        (is (= "completed" (:status (source-result result :card allowed))))
        (is (= {:status "failed" :error "No."} (source-result result :card refused))))))
  (testing "a check that throws refuses every source rather than running unchecked ones"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (count-query :venues)}]
      (is (=? {:status "failed" :error string?}
              (source-result (mt/with-current-user (mt/user->id :crowberto)
                               (dynamic-goals/goal-values [{:type "card" :id card-id}]
                                                          :check-sources (fn [_] (throw (ex-info "boom" {})))))
                             :card card-id))))))

(deftest source-needs-only-read-perms-test
  (testing "a card source resolves for a user who can read it but has no ad-hoc query perms on its table"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no
        (is (=? {:status "completed" :data {:rows [[100]]}}
                (source-result (goal-values :rasta [{:type "card" :id goal-id}]) :card goal-id)))))))

(deftest measure-source-needs-query-permissions-test
  (testing "a viewer who can run saved questions, but not build queries, gets no measure goal value"
    ;; a source card runs as a saved question, so only a measure, which has no such check, needs query perms
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-perm-for-group! (perms/all-users-group) :perms/view-data :unrestricted
          (is (= {:status "failed"
                  :error  "You don't have permissions to do that."}
                 (source-result (goal-values :rasta [{:type "measure" :id measure-id}]) :measure measure-id))))))))

(deftest goal-runs-keep-source-result-metadata-test
  (mt/with-temp [:model/Card    {card-id :id}    {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Card    {metric-id :id}  {:type          :metric
                                                  :dataset_query (mt/mbql-query venues {:aggregation [[:count]]
                                                                                        :breakout    [$price]})}
                 :model/Measure {measure-id :id} {:name       "Venue count"
                                                  :table_id   (mt/id :venues)
                                                  :definition (venues-count-measure)}]
    (testing "resolving a goal doesn't write result_metadata to the card, metric or measure it points at"
      (doseq [[source-type goal-id] [["card" card-id] ["card" metric-id] ["measure" measure-id]]]
        (testing (str source-type " " goal-id)
          (let [written (atom #{})]
            (mt/with-dynamic-fn-redefs [qp.db/set-card-result-metadata! (fn [id _] (swap! written conj id))]
              (is (= "completed" (:status (source-result (goal-values [{:type source-type :id goal-id}])
                                                         source-type goal-id)))))
            (is (empty? @written))))))
    (testing "a metric goal keeps the metric's breakout column"
      (mt/user-http-request :crowberto :post 202 (format "card/%d/query" metric-id))
      (goal-values [{:type "card" :id metric-id}])
      (is (= ["PRICE" "count"]
             (mapv :name (t2/select-one-fn :result_metadata :model/Card :id metric-id)))))))

(deftest measure-goal-keeps-same-id-card-metadata-test
  ;; above every existing card and measure, with enough headroom that no auto id lands on it
  (let [shared-id (+ 100000 (max (or (t2/select-one-fn :id :model/Card {:order-by [[:id :desc]]}) 0)
                                 (or (t2/select-one-fn :id :model/Measure {:order-by [[:id :desc]]}) 0)))]
    (mt/with-temp [:model/Measure _             {:id         shared-id
                                                 :name       "Venue count"
                                                 :table_id   (mt/id :venues)
                                                 :definition (venues-count-measure)}
                   :model/Card    {twin-id :id} {:id            shared-id
                                                 :dataset_query (mt/mbql-query venues {:limit 1})}]
      (testing "a measure goal leaves the result_metadata of a card with the same id unchanged"
        (let [before (t2/select-one-fn :result_metadata :model/Card :id twin-id)]
          (goal-values [{:type "measure" :id shared-id}])
          (is (= before (t2/select-one-fn :result_metadata :model/Card :id twin-id))))))))

;;; ------------------------------------------------- Chart sources -------------------------------------------------

(deftest chart-goal-sources-test
  (letfn [(sources [display viz] (dynamic-goals/chart-goal-sources {:display display :visualization_settings viz} nil))]
    (testing "goal sources are read from the dynamic-goal viz settings and grouped by entity"
      (testing "a :graph.goal_value source"
        (is (= [{:type "card" :id 1 :columns ["total"]}]
               (sources :line {:graph.show_goal true, :graph.goal_value {:id 1 :type "card" :column "total"}}))))
      (testing "a :graph.goal_value source the chart doesn't show is skipped"
        (are [viz] (empty? (sources :line viz))
          {:graph.goal_value {:id 1 :type "card" :column "total"}}
          {:graph.show_goal false, :graph.goal_value {:id 1 :type "card" :column "total"}}))
      (testing ":gauge.segments min/max, grouped + de-duped by entity"
        (is (= {["card" 1]    ["sum" "avg"]
                ["measure" 2] ["total"]}
               (into {} (map (juxt (juxt :type :id) :columns))
                     (sources :gauge
                              {:gauge.segments [{:min 0 :max {:id 1 :type "card" :column "sum"}}
                                                {:min {:id 1 :type "card" :column "avg"}
                                                 :max {:id 1 :type "card" :column "sum"}}
                                                {:min {:id 2 :type "measure" :column "total"} :max nil :color "red"}]})))))
      (testing "a card and a measure with the same id stay separate"
        (is (= 2 (count (sources :gauge {:gauge.segments [{:min {:id 1 :type "card" :column "a"}
                                                           :max {:id 1 :type "measure" :column "b"}}]})))))
      (testing "static numbers and bare-string self-column references are ignored"
        (is (empty? (sources :gauge {:gauge.segments [{:min 0 :max 50} {:min "self_col" :max 100}]}))))
      (testing "a source whose type names no runnable entity is dropped"
        (is (= [{:type "card" :id 1 :columns ["total"]}]
               (sources :gauge {:gauge.segments [{:min {:id 2 :type "segment" :column "total"}
                                                  :max {:id 1 :type "card" :column "total"}}]})))))
    (testing "only the goal settings the display draws run"
      (let [viz {:graph.show_goal  true
                 :graph.goal_value {:id 1 :type "card" :column "a"}
                 :progress.goal    {:id 2 :type "card" :column "b"}
                 :gauge.segments   [{:max {:id 3 :type "card" :column "c"}}]
                 :scalar.segments  [{:max {:id 4 :type "card" :column "d"}}]}]
        (are [display ids] (= ids (set (map :id (sources display viz))))
          :line         #{1}
          :progress     #{2}
          :gauge        #{3}
          :scalar       #{4}
          :table        #{}
          "custom:foo"  #{})))
    (testing "no goal settings at all"
      (is (empty? (sources :line {}))))))

(deftest chart-goal-values-test
  (testing "a saved chart's goals run from its viz settings, its dashcard's included"
    (mt/with-temp [:model/Card      {goal-id :id}    {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                   :model/Measure   {measure-id :id} {:name       "Venue count"
                                                      :table_id   (mt/id :venues)
                                                      :definition (venues-count-measure)}
                   :model/Card      {line-id :id}    (goal-chart "card" goal-id)
                   :model/Card      {gauge-id :id}   (chart-card :gauge {})
                   :model/Dashboard {dash-id :id}    {}
                   ;; the dynamic goal lives on the DASHCARD's viz settings
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id           dash-id
                                                           :card_id                gauge-id
                                                           :visualization_settings
                                                           {:gauge.segments [{:min {:id measure-id :type "measure" :column "count"}
                                                                              :max (goal-ref goal-id)}]}}]
      (is (=? {:status "completed" :data {:rows [[1000]]}}
              (source-result (chart-goal-values line-id) :card goal-id)))
      (let [values (chart-goal-values gauge-id :dashcard-id dashcard-id)]
        (is (=? {:status "completed" :data {:rows [[1000]]}} (source-result values :card goal-id)))
        (is (=? {:status "completed" :data {:rows [[100]]}} (source-result values :measure measure-id))))))
  (testing "a chart with only a static goal value runs nothing"
    (mt/with-temp [:model/Card {chart-id :id} (chart-card :line {:graph.show_goal true :graph.goal_value 100})]
      (is (empty? (chart-goal-values chart-id))))))

(defn- visualizer-viz-settings
  "Viz settings of a visualizer dashcard charting `card-id`'s `count`, with `settings` for the chart."
  [card-id settings]
  {:visualization {:display             "line"
                   :columnValuesMapping {:COLUMN_1 [{:sourceId     (str "card:" card-id)
                                                     :originalName "count"
                                                     :name         "COLUMN_1"}]}
                   :settings            settings}})

(deftest visualizer-dashcard-goal-values-test
  (testing "a visualizer dashcard's goal lives in its nested chart settings"
    (mt/with-temp [:model/Card      {goal-id :id}  {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                   :model/Card      {chart-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Dashboard {dash-id :id}  {}
                   :model/DashboardCard {shown-id :id}
                   {:dashboard_id           dash-id
                    :card_id                chart-id
                    :visualization_settings (visualizer-viz-settings chart-id {:graph.show_goal  true
                                                                               :graph.goal_value (goal-ref goal-id)})}
                   :model/DashboardCard {hidden-id :id}
                   {:dashboard_id           dash-id
                    :card_id                chart-id
                    :visualization_settings (visualizer-viz-settings chart-id {:graph.show_goal  false
                                                                               :graph.goal_value (goal-ref goal-id)})}]
      (is (=? {:status "completed" :data {:rows [[1000]]}}
              (source-result (chart-goal-values chart-id :dashcard-id shown-id) :card goal-id)))
      (testing "the nested settings toggle their own goal"
        (is (empty? (chart-goal-values chart-id :dashcard-id hidden-id)))))))

(deftest chart-display-goal-guard-test
  (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :checkins)}]
    (let [shown-goal {:graph.show_goal true :graph.goal_value (goal-ref goal-id)}
          all-goals  (assoc shown-goal
                            :progress.goal   (goal-ref goal-id)
                            :gauge.segments  [{:min 0 :max (goal-ref goal-id)}]
                            :scalar.segments [{:min (goal-ref goal-id) :max nil}])
          segments   {:gauge.segments [{:min 0 :max (goal-ref goal-id)}]}]
      (testing "a custom visualization's bare goal settings, written by its plugin before namespacing, never run"
        (mt/with-temp [:model/Card {chart-id :id} (chart-card "custom:my-viz" all-goals)]
          (is (empty? (chart-goal-values chart-id)))))
      (testing "a built-in display runs only the goal settings it draws"
        (doseq [display [:line :progress :gauge :scalar]]
          (mt/with-temp [:model/Card {chart-id :id} (chart-card display segments)]
            (testing display
              (is (= (= display :gauge)
                     (some? (source-result (chart-goal-values chart-id) :card goal-id))))))))
      (testing "a dashcard's goal follows its card's display"
        (mt/with-temp [:model/Card      {bar-id :id}    (chart-card :bar {})
                       :model/Card      {custom-id :id} (chart-card "custom:my-viz" {})
                       :model/Dashboard {dash-id :id}   {}
                       :model/DashboardCard {bar-dashcard-id :id}    {:dashboard_id           dash-id
                                                                      :card_id                bar-id
                                                                      :visualization_settings shown-goal}
                       :model/DashboardCard {custom-dashcard-id :id} {:dashboard_id           dash-id
                                                                      :card_id                custom-id
                                                                      :visualization_settings shown-goal}]
          (is (= "completed" (:status (source-result (chart-goal-values bar-id :dashcard-id bar-dashcard-id)
                                                     :card goal-id))))
          (is (empty? (chart-goal-values custom-id :dashcard-id custom-dashcard-id))))))))

(deftest visualizer-display-goal-guard-test
  (mt/with-temp [:model/Card      {goal-id :id}  {:dataset_query (count-query :checkins)}
                 ;; a visualizer draws its own chart, so the card's goal never shows
                 :model/Card      {chart-id :id} (chart-card :bar {:graph.show_goal  true
                                                                   :graph.goal_value (goal-ref goal-id)})
                 :model/Dashboard {dash-id :id}  {}]
    (let [run   (fn [dash-viz]
                  (mt/with-temp [:model/DashboardCard {dashcard-id :id} {:dashboard_id           dash-id
                                                                         :card_id                chart-id
                                                                         :visualization_settings dash-viz}]
                    (some? (source-result (chart-goal-values chart-id :dashcard-id dashcard-id) :card goal-id))))
          chart (fn [display settings]
                  {:visualization {:display display :settings settings}})]
      (testing "the nested chart's display decides which nested goals run"
        (is (true? (run (chart "progress" {:progress.goal (goal-ref goal-id)}))))
        (is (false? (run (chart "bar" {:progress.goal (goal-ref goal-id)}))))
        (is (true? (run (chart "gauge" {:gauge.segments [{:max (goal-ref goal-id)}]})))))
      (testing "the primary card's own goal doesn't run"
        (is (false? (run (chart "bar" {})))))
      (testing "the dashcard's own goal runs when the nested chart draws it, with toggles from both"
        (is (true? (run (merge (chart "line" {:graph.show_goal true})
                               {:graph.goal_value (goal-ref goal-id)}))))
        (is (false? (run (merge (chart "line" {})
                                {:graph.goal_value (goal-ref goal-id)}))))))))

(deftest multi-series-goal-guard-test
  (testing "only the main card of a multi-series dashcard has goals; its series cards only feed it data"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :checkins)}]
      (let [shown-goal {:graph.show_goal true :graph.goal_value (goal-ref goal-id)}]
        (mt/with-temp [:model/Card      {chart-id :id}  (chart-card :bar {})
                       :model/Card      {series-id :id} (chart-card :line shown-goal)
                       :model/Dashboard {dash-id :id}   {}
                       :model/DashboardCard {dashcard-id :id} {:dashboard_id           dash-id
                                                               :card_id                chart-id
                                                               :visualization_settings shown-goal}
                       :model/DashboardCardSeries _ {:dashboardcard_id dashcard-id :card_id series-id}]
          (is (= "completed" (:status (source-result (chart-goal-values chart-id :dashcard-id dashcard-id)
                                                     :card goal-id))))
          (is (empty? (chart-goal-values series-id :dashcard-id dashcard-id))))))))

(deftest hidden-goal-line-does-not-run-test
  (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :checkins)}]
    (testing "a saved line chart that hides its goal line doesn't run the goal's source"
      (mt/with-temp [:model/Card {chart-id :id} (chart-card :line {:graph.show_goal  false
                                                                   :graph.goal_value (goal-ref goal-id)})]
        (is (empty? (chart-goal-values chart-id)))))
    (testing "a dashcard that hides the goal line its card shows doesn't run the goal's source"
      (mt/with-temp [:model/Card      {chart-id :id} (chart-card :line {:graph.show_goal  true
                                                                        :graph.goal_value (goal-ref goal-id)})
                     :model/Dashboard {dash-id :id}  {}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id           dash-id
                                                             :card_id                chart-id
                                                             :visualization_settings {:graph.show_goal false}}]
        (is (= "completed" (:status (source-result (chart-goal-values chart-id) :card goal-id))))
        (is (empty? (chart-goal-values chart-id :dashcard-id dashcard-id)))))))

(deftest sources-are-one-level-deep-test
  (testing "a source's own dynamic goals don't run"
    (let [ran (atom [])]
      (mt/with-temp [:model/Card {deep-id :id}   {:dataset_query (count-query :checkins)}
                     :model/Card {source-id :id} (chart-card :scalar {:scalar.segments [{:min   (goal-ref deep-id)
                                                                                         :max   nil
                                                                                         :color "red"}]})
                     :model/Card {chart-id :id}  (chart-card :scalar {:scalar.segments [{:min   (goal-ref source-id)
                                                                                         :max   nil
                                                                                         :color "red"}]})]
        (mt/with-dynamic-fn-redefs [dynamic-goals/run-source
                                    (let [run-source (mt/original-fn #'dynamic-goals/run-source)]
                                      (fn [source opts]
                                        (swap! ran conj (:id source))
                                        (run-source source opts)))]
          (is (= "completed" (:status (source-result (chart-goal-values chart-id) :card source-id))))
          (is (= [source-id] @ran))))))
  (testing "a card whose goal is its own value runs its query once more, without looping"
    (mt/with-temp [:model/Card {chart-id :id} (chart-card :scalar {})]
      (t2/update! :model/Card :id chart-id {:visualization_settings {:scalar.segments [{:min   (goal-ref chart-id)
                                                                                        :max   nil
                                                                                        :color "red"}]}})
      (is (= [[100]] (get-in (source-result (chart-goal-values chart-id) :card chart-id) [:data :rows]))))))

(deftest chart-source-limit-test
  (testing "a saved chart runs at most 20 sources, and every other one fails softly"
    (mt/with-temp [:model/Card {chart-id :id} (chart-card :gauge {})]
      (let [ids (range 1 23)]
        (t2/update! :model/Card :id chart-id
                    {:visualization_settings {:gauge.segments (for [id ids] {:min 0 :max (goal-ref id)})}})
        (let [ran (atom 0)]
          (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (fn [_source _opts]
                                                                 (swap! ran inc)
                                                                 {:status "completed"})]
            (let [values  (chart-goal-values chart-id)
                  results (vals (get values "card"))]
              (is (= 20 @ran))
              (is (= 22 (count results)))
              (is (= 2 (count (filter #(= "too-many-sources" (:error_type %)) results)))))))))))

(deftest query-endpoints-run-no-goals-test
  (testing "the chart's own query runs no goal sources and returns no goal values"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :checkins)}
                   :model/Card {chart-id :id} (goal-chart "card" goal-id)]
      (let [ran (atom 0)]
        (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (fn [& _] (swap! ran inc) {:status "completed"})]
          (let [response (mt/user-http-request :crowberto :post 202 (format "card/%d/query" chart-id))]
            (is (= [[100]] (get-in response [:data :rows])))
            (is (not (contains? (:data response) :referenced_entities))))
          (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv" chart-id)))
        (is (zero? @ran))))))

;;; ------------------------------------------------ Public endpoints -------------------------------------------------

(deftest public-card-goal-values-test
  (testing "GET /api/public/card/:uuid/goal-values runs the goals of a public card"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                     :model/Card {uuid :public_uuid} {:dataset_query           (mt/mbql-query venues {:aggregation [[:count]]})
                                                      :display                 :scalar
                                                      :public_uuid             (str (random-uuid))
                                                      :visualization_settings  {:scalar.segments
                                                                                [{:min   (goal-ref goal-id)
                                                                                  :max   nil
                                                                                  :color "red"}]}}]
        (is (=? {:status "completed" :data {:rows [[1000]]}}
                (source-result (client/client :get 202 (str "public/card/" uuid "/goal-values")) :card goal-id))))))
  (testing "a public custom visualization doesn't run its bare goal settings"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :checkins)}
                     :model/Card {uuid :public_uuid} (assoc (chart-card "custom:my-viz" {:progress.goal (goal-ref goal-id)})
                                                            :public_uuid (str (random-uuid)))]
        (is (empty? (client/client :get 202 (str "public/card/" uuid "/goal-values")))))))
  (testing "public sharing must be enabled"
    (mt/with-temporary-setting-values [enable-public-sharing false]
      (mt/with-temp [:model/Card {uuid :public_uuid} {:public_uuid (str (random-uuid))}]
        (client/client :get 400 (str "public/card/" uuid "/goal-values"))))))

(deftest public-endpoints-measure-goal-test
  (testing "public card and dashcard endpoints resolve a measure goal source"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Measure       {measure-id :id}                     {:name       "Venue count"
                                                                                :table_id   (mt/id :venues)
                                                                                :definition (venues-count-measure)}
                     :model/Card          {chart-id :id, card-uuid :public_uuid} {:dataset_query (count-query :checkins)
                                                                                  :display       :scalar
                                                                                  :public_uuid   (str (random-uuid))
                                                                                  :visualization_settings
                                                                                  {:scalar.segments
                                                                                   [{:min   {:id measure-id :type "measure" :column "count"}
                                                                                     :max   nil
                                                                                     :color "red"}]}}
                     :model/Dashboard     {dash-id :id, dash-uuid :public_uuid}  {:public_uuid (str (random-uuid))}
                     :model/DashboardCard {dashcard-id :id}                    {:dashboard_id dash-id
                                                                                :card_id      chart-id}]
        (testing "on the public card endpoint"
          (is (=? {:status "completed" :data {:rows [[100]]}}
                  (source-result (client/client :get 202 (str "public/card/" card-uuid "/goal-values"))
                                 :measure measure-id))))
        (testing "on the public dashcard endpoint"
          (is (=? {:status "completed" :data {:rows [[100]]}}
                  (source-result (client/client :get 202 (format "public/dashboard/%s/dashcard/%d/goal-values"
                                                                 dash-uuid dashcard-id))
                                 :measure measure-id))))))))

(deftest public-dashcard-must-belong-to-dashboard-test
  (testing "a public dashboard can't run the goals of another dashboard's dashcard"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card          {goal-id :id}  {:dataset_query (count-query :checkins)}
                     :model/Card          {chart-id :id} (goal-chart "card" goal-id)
                     :model/Dashboard     {dash-uuid :public_uuid} {:public_uuid (str (random-uuid))}
                     :model/Dashboard     {other-id :id} {}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id other-id :card_id chart-id}]
        (client/client :get 404 (format "public/dashboard/%s/dashcard/%d/goal-values" dash-uuid dashcard-id))))))

(deftest public-goal-values-keep-error-type-test
  (testing "public goal values keep the error type of a source that doesn't exist, and scrub raw error messages"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card {deleted-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                     :model/Card {failing-id :id} {:dataset_query (mt/native-query {:query "SELECT * FROM no_such_table"})}
                     :model/Card {uuid :public_uuid} {:dataset_query           (mt/mbql-query venues {:aggregation [[:count]]})
                                                      :display                 :scalar
                                                      :public_uuid             (str (random-uuid))
                                                      :visualization_settings  {:scalar.segments
                                                                                [{:min (goal-ref deleted-id) :max nil}
                                                                                 {:min (goal-ref failing-id) :max nil}]}}]
        (t2/delete! :model/Card :id deleted-id)
        (let [response (client/client :get 202 (str "public/card/" uuid "/goal-values"))]
          (is (=? {:status "failed" :error_type "not-found"} (source-result response :card deleted-id)))
          (is (= {:status "failed" :error "An error occurred while running the query."}
                 (source-result response :card failing-id))))))))

(deftest source-with-parameters-is-refused-on-chart-endpoints-test
  (testing "a saved goal on a card with variables fails that goal only, signed in and public"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card {source-id :id} (native-card venues-by-tenant {:default 2})
                     :model/Card {chart-id :id uuid :public_uuid}
                     (assoc (goal-chart "card" source-id) :public_uuid (str (random-uuid)))]
        (doseq [[label response] {"signed in" (chart-goal-values chart-id)
                                  "public"    (client/client :get 202 (str "public/card/" uuid "/goal-values"))}]
          (testing label
            (is (=? {:status "failed" :error_type "has-parameters"}
                    (source-result response :card source-id)))))))))

;;; ------------------------------------------ Goal runs are QueryExecutions ------------------------------------------

(defn- goal-executions!
  "Flush pending QueryExecution writes, then return the ones a dynamic goal recorded, matching `where`."
  [& where]
  (process-userland-query/flush-execution-metadata!)
  (apply t2/select [:model/QueryExecution :card_id :context :executor_id :dashboard_id :cache_hit :error]
         :context :dynamic-goal where))

(deftest goal-run-records-query-execution-test
  (testing "a goal source card's run is recorded as a QueryExecution, as the viewer, on the chart's dashboard"
    (mt/with-temp [:model/Card      {goal-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Dashboard {dash-id :id} {}]
      (is (= "completed" (:status (source-result (goal-values :rasta [{:type "card" :id goal-id}] :dashboard_id dash-id)
                                                 :card goal-id))))
      (is (=? [{:card_id      goal-id
                :executor_id  (mt/user->id :rasta)
                :dashboard_id dash-id
                :cache_hit    false
                :error        nil}]
              (goal-executions! :card_id goal-id))))))

(deftest goal-run-is-not-a-view-test
  (testing "a goal run doesn't put the goal source card in the viewer's recent views"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (goal-values :rasta [{:type "card" :id goal-id}])
      (is (false? (t2/exists? :model/RecentViews :user_id (mt/user->id :rasta) :model "card" :model_id goal-id))))))

(deftest measure-goal-run-records-no-card-test
  (testing "a measure goal's QueryExecution has no card_id, since a measure isn't a card"
    (mt/with-temp [:model/Measure   {measure-id :id} {:name       "Venue count"
                                                      :table_id   (mt/id :venues)
                                                      :definition (venues-count-measure)}
                   :model/Dashboard {dash-id :id}    {}]
      (goal-values :crowberto [{:type "measure" :id measure-id}] :dashboard_id dash-id)
      (is (=? [{:card_id nil :executor_id (mt/user->id :crowberto)}]
              (goal-executions! :dashboard_id dash-id))))))

(deftest public-goal-run-has-no-executor-test
  (testing "a goal run behind a public link is recorded with no executor, like the chart's own run"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                     :model/Card {uuid :public_uuid} (assoc (goal-chart "card" goal-id)
                                                            :public_uuid (str (random-uuid)))]
        (client/client :get 202 (str "public/card/" uuid "/goal-values"))
        (is (=? [{:card_id goal-id :executor_id nil}]
                (goal-executions! :card_id goal-id)))))))

(deftest failed-goal-run-records-error-test
  (testing "a goal source that fails is recorded with its error, and fails the goal"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query {:query "SELECT * FROM no_such_table"})}]
      (is (=? {:status "failed" :error #"(?is).*no_such_table.*"}
              (source-result (goal-values [{:type "card" :id goal-id}]) :card goal-id)))
      (is (=? [{:card_id goal-id :error #"(?is).*no_such_table.*"}]
              (goal-executions! :card_id goal-id))))))

(deftest goal-runs-use-the-card-cache-test
  (testing "a goal source card runs under its cache strategy, so a repeat view is served from the cache"
    (mt/with-model-cleanup [:model/CacheConfig]
      (cache-config/store! (mt/user->id :crowberto)
                           {:model    "root"
                            :model_id 0
                            :strategy {:type :ttl :multiplier 99999 :min_duration_ms 0}})
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (let [view! #(goal-values :crowberto [{:type "card" :id goal-id}] :ignore_cache %)]
          (view! false)
          ;; the strategy's average execution time is read from the first run's record
          (process-userland-query/flush-execution-metadata!)
          (view! false)
          (testing "the repeat view's goal run is a cache hit"
            (is (=? [{:cache_hit false} {:cache_hit true}]
                    (sort-by :cache_hit (goal-executions! :card_id goal-id)))))
          (testing "refreshing the chart refreshes its goal too"
            (view! true)
            (is (= 2 (count (filter (comp false? :cache_hit) (goal-executions! :card_id goal-id)))))))))))
