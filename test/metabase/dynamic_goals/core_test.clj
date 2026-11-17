(ns metabase.dynamic-goals.core-test
  "Tests for running dynamic goal sources: [[dynamic-goals/goal-values]], a saved chart's goals, and the anonymous
  chart-context path."
  {:clj-kondo/config '{:linters
                       ;; saved cards, measures and dashboards are the input here, as in [[metabase.query-processor.card-test]]
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
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.db :as qp.db]
   [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- goal-values
  "[[dynamic-goals/goal-values]] for `sources` as `user`, with `opts`."
  [user sources & {:as opts}]
  (mt/with-current-user (mt/user->id user)
    (dynamic-goals/goal-values sources opts)))

(defn- source-result
  "The result of the source with `source-type` and `id` in goal values `result`."
  [result source-type id]
  (get-in result [(name source-type) (str id)]))

(defn- card [card-id] (t2/select-one :model/Card :id card-id))

(defn- dashcard [dashcard-id] (some->> dashcard-id (t2/select-one :model/DashboardCard :id)))

(defn- chart-goal-values
  "The values of the goals saved card `card-id` draws on dashcard `dashcard-id`, as `user` (default crowberto)."
  [card-id & {:keys [dashcard-id user] :or {user :crowberto} :as opts}]
  (mt/with-current-user (mt/user->id user)
    (dynamic-goals/chart-goal-values (card card-id) (dashcard dashcard-id)
                                     (dissoc opts :dashcard-id :user))))

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
  (chart-card :line {:graph.show_goal  true
                     :graph.goal_value {:id goal-id :type source-type :column "count"}}))

(defn- spy-run-source
  "A redef of `run-source` that records each source id in `ran` before running it for real."
  [ran]
  (let [run-source (mt/original-fn #'dynamic-goals/run-source)]
    (fn [source opts]
      (swap! ran conj (:id source))
      (run-source source opts))))

;;; ------------------------------------------------ Running sources -------------------------------------------------

(deftest goal-values-test
  (testing "cards and measures run and return their single-row values, keyed by type then id"
    (mt/with-temp [:model/Card    {card-id :id}    {:dataset_query (count-query :checkins)}
                   :model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (let [result (goal-values :crowberto [{:type "card" :id card-id :columns ["count"]}
                                            {:type "measure" :id measure-id}])]
        (is (=? {:status "completed" :data {:rows [[1000]] :cols [{:name "count"}]}}
                (source-result result :card card-id)))
        (is (nil? (:error (source-result result :card card-id))))
        (is (=? {:status "completed" :data {:rows [[100]]}}
                (source-result result :measure measure-id))))))
  (testing "a card and a measure sharing an id don't collide"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}
                   :model/Card    {card-id :id}    {:dataset_query (count-query :checkins)}]
      (let [result (goal-values :crowberto [{:type "card" :id card-id} {:type "measure" :id card-id}
                                            {:type "measure" :id measure-id}])]
        (is (= [[1000]] (get-in (source-result result :card card-id) [:data :rows])))
        (is (= [[100]] (get-in (source-result result :measure measure-id) [:data :rows]))))))
  (testing "no sources, no entries"
    (is (= {} (goal-values :crowberto [])))))

(deftest column-projection-test
  (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:limit 1})}]
    (testing "only the requested columns come back"
      (let [goal (source-result (goal-values :crowberto [{:type "card" :id goal-id :columns ["NAME" "PRICE"]}])
                                :card goal-id)]
        (is (= "completed" (:status goal)))
        (is (= ["NAME" "PRICE"] (map :name (get-in goal [:data :cols]))))
        (is (= 1 (count (get-in goal [:data :rows]))))
        (is (= 2 (count (first (get-in goal [:data :rows])))))))
    (testing "a requested column that isn't in the result is dropped rather than erroring"
      (is (= ["NAME"]
             (map :name (get-in (source-result (goal-values :crowberto [{:type "card" :id goal-id :columns ["NAME" "NOPE"]}])
                                               :card goal-id)
                                [:data :cols])))))
    (testing "no columns asked for, all of them come back"
      (is (< 2 (count (get-in (source-result (goal-values :crowberto [{:type "card" :id goal-id}]) :card goal-id)
                              [:data :cols])))))))

(deftest too-many-rows-test
  (testing "a source returning more than one row fails instead of being truncated"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues)}]
      (is (=? {:status "failed" :error_type "too-many-rows" :error #".*more rows than the maximum.*"}
              (source-result (goal-values :crowberto [{:type "card" :id goal-id :columns ["NAME"]}]) :card goal-id))))))

(deftest not-found-test
  (testing "a missing source fails with `not-found`, and the others still run"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :checkins)}]
      (let [result (goal-values :crowberto [{:type "card" :id Integer/MAX_VALUE :columns ["count"]}
                                            {:type "measure" :id Integer/MAX_VALUE}
                                            {:type "card" :id goal-id}])]
        (is (=? {:status "failed" :error string? :error_type "not-found"}
                (source-result result :card Integer/MAX_VALUE)))
        (is (=? {:status "failed" :error_type "not-found"}
                (source-result result :measure Integer/MAX_VALUE)))
        (is (= "completed" (:status (source-result result :card goal-id)))))))
  (testing "a source whose own query reads a deleted card still exists, so it's a query failure"
    (mt/with-temp [:model/Card {inner-id :id} {:dataset_query (count-query :venues)}
                   :model/Card {goal-id :id}  {:dataset_query {:database (mt/id)
                                                               :type     :query
                                                               :query    {:source-table (str "card__" inner-id)}}}]
      (t2/delete! :model/Card :id inner-id)
      (let [goal (source-result (goal-values :crowberto [{:type "card" :id goal-id}]) :card goal-id)]
        (is (= "failed" (:status goal)))
        (is (nil? (:error_type goal)))))))

(deftest archived-source-test
  (testing "an archived source still resolves: unlike a deleted one, it exists"
    (mt/with-temp [:model/Card    {card-id :id}    {:archived true :dataset_query (count-query :venues)}
                   :model/Measure {measure-id :id} {:archived   true
                                                    :name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (let [result (goal-values :crowberto [{:type "card" :id card-id} {:type "measure" :id measure-id}])]
        (is (= [[100]] (get-in (source-result result :card card-id) [:data :rows])))
        (is (= [[100]] (get-in (source-result result :measure measure-id) [:data :rows])))))))

(deftest failed-query-test
  (testing "a source whose query fails fails on its own, with the query's error"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query {:query "SELECT * FROM no_such_table"})}
                   :model/Card {ok-id :id}   {:dataset_query (count-query :venues)}]
      (let [result (goal-values :crowberto [{:type "card" :id goal-id} {:type "card" :id ok-id}])]
        (is (=? {:status "failed" :error #"(?is).*no_such_table.*"} (source-result result :card goal-id)))
        (is (= "completed" (:status (source-result result :card ok-id))))))))

(deftest duplicate-sources-test
  (testing "sources naming the same entity run it once"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:fields   [$name $price]
                                                                                    :order-by [[:asc $id]]
                                                                                    :limit    1})}]
      (let [ran (atom [])]
        (letfn [(goal [sources]
                  (reset! ran [])
                  (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (spy-run-source ran)]
                    (source-result (goal-values :crowberto (mapv #(assoc % :type "card" :id goal-id) sources))
                                   :card goal-id)))]
          (testing "and answer the columns all of them asked for"
            (is (= ["NAME" "PRICE"]
                   (map :name (get-in (goal [{:columns ["NAME"]} {:columns ["PRICE"]}]) [:data :cols]))))
            (is (= [goal-id] @ran)))
          (testing "a source asking for every column wins over one that narrows them"
            (is (= 2 (count (get-in (goal [{:columns ["NAME"]} {}]) [:data :cols]))))))))))

(deftest sources-run-one-after-another-test
  (testing "the sources of one call run sequentially, in the order given"
    (let [in-flight (atom 0)
          peak      (atom 0)
          order     (atom [])]
      (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (fn [source _opts]
                                                             (swap! peak max (swap! in-flight inc))
                                                             (swap! order conj (:id source))
                                                             (Thread/sleep 20)
                                                             (swap! in-flight dec)
                                                             {:status "completed"})]
        (is (= 5 (count (get (goal-values :crowberto (for [id [5 3 1 4 2]] {:type "card" :id id})) "card"))))
        (is (= 1 @peak))
        (is (= [5 3 1 4 2] @order))))))

(deftest too-many-sources-test
  (testing "past 20 sources each further one fails with `too-many-sources` without running"
    (let [ran (atom [])]
      (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (fn [source _opts]
                                                             (swap! ran conj (:id source))
                                                             {:status "completed"})]
        (let [result (goal-values :crowberto (for [id (range 1 23)] {:type "card" :id id}))]
          (testing "the first 20, in order, run"
            (is (= (range 1 21) @ran)))
          (testing "the rest fail"
            (is (= {:status "failed" :error_type "too-many-sources" :error "A chart can read at most 20 goal sources."}
                   (source-result result :card 21)
                   (source-result result :card 22)))))))))

(deftest canceled-call-runs-no-sources-test
  (testing "once the client hung up, no more sources run, and the unrun ones get no entry"
    (let [ran (atom [])]
      (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (fn [source _opts]
                                                             (swap! ran conj (:id source))
                                                             {:status "completed"})]
        (binding [qp.pipeline/*canceled-chan* (doto (a/promise-chan) (a/>!! ::cancel))]
          (is (= {} (dynamic-goals/goal-values [{:type "card" :id 1} {:type "card" :id 2}])))
          (is (= [] @ran)))))))

(deftest each-source-run-stays-cancelable-test
  (testing "a cancel reaches a source run after another source of the same call finished"
    (mt/with-temp [:model/Card {card-1 :id} {:dataset_query (count-query :venues)}
                   :model/Card {card-2 :id} {:dataset_query (count-query :venues)}]
      (let [outer-chan (a/promise-chan)
            runs       (atom 0)
            seen       (atom nil)]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-dynamic-fn-redefs [qp/process-query
                                      (fn [& _]
                                        (if (= 1 (swap! runs inc))
                                          ;; a finished query closes its cancel chan, as the pipeline does
                                          (a/close! qp.pipeline/*canceled-chan*)
                                          (do (a/>!! outer-chan ::cancel)
                                              (reset! seen (first (a/alts!! [qp.pipeline/*canceled-chan*
                                                                             (a/timeout 5000)])))))
                                        {:status :completed :data {:rows [[1]] :cols []}})]
            (binding [qp.pipeline/*canceled-chan* outer-chan]
              (dynamic-goals/goal-values [{:type "card" :id card-1} {:type "card" :id card-2}]))))
        (is (= 2 @runs))
        (is (= ::cancel @seen))))))

(deftest check-sources-test
  (testing "`:check-sources` refuses sources before they run, with no error type"
    (mt/with-temp [:model/Card {allowed :id} {:dataset_query (count-query :venues)}
                   :model/Card {refused :id} {:dataset_query (count-query :venues)}]
      (let [checked (atom nil)
            result  (goal-values :crowberto [{:type "card" :id allowed} {:type "card" :id refused}
                                             {:type "card" :id refused}]
                                 :check-sources (fn [sources]
                                                  (reset! checked sources)
                                                  {["card" refused] "No."}))]
        (testing "the check sees the deduped sources"
          (is (= [allowed refused] (map :id @checked))))
        (is (= "completed" (:status (source-result result :card allowed))))
        (is (= {:status "failed" :error "No."} (source-result result :card refused))))))
  (testing "a check that throws refuses every source rather than running unchecked ones"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (count-query :venues)}]
      (let [ran (atom [])]
        (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (spy-run-source ran)]
          (is (= {:status "failed" :error "Could not check whether this goal source may be used."}
                 (source-result (goal-values :crowberto [{:type "card" :id card-id}]
                                             :check-sources (fn [_] (throw (ex-info "boom" {}))))
                                :card card-id))))
        (is (= [] @ran))))))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(deftest read-check-failure-fails-the-source-test
  (testing "a card the caller can't read fails on its own"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card       {goal-id :id} {:collection_id coll-id :dataset_query (count-query :checkins)}
                     :model/Card       {ok-id :id}   {:dataset_query (count-query :venues)}]
        (let [result (goal-values :rasta [{:type "card" :id goal-id} {:type "card" :id ok-id}])]
          (is (= {:status "failed" :error "You don't have permissions to do that."}
                 (source-result result :card goal-id)))
          (is (= "completed" (:status (source-result result :card ok-id))))))))
  (testing "a measure whose table the caller can't read fails on its own"
    ;; measure perms delegate to its table, a different route from the collection perms a card goes through
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues) :perms/view-data :blocked
        (is (=? {:status "failed" :error string?}
                (source-result (goal-values :rasta [{:type "measure" :id measure-id}]) :measure measure-id)))))))

(deftest card-source-needs-only-read-perms-test
  (testing "a card source runs as a saved question: reading it is enough, without query perms on its table"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :venues)}]
      (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no
        (is (=? {:status "completed" :data {:rows [[100]]}}
                (source-result (goal-values :rasta [{:type "card" :id goal-id}]) :card goal-id)))))))

(deftest measure-source-needs-query-perms-test
  (testing "a measure has no saved-question check, so it needs query perms on its table"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-perm-for-group! (perms/all-users-group) :perms/view-data :unrestricted
          (is (= {:status "failed" :error "You don't have permissions to do that."}
                 (source-result (goal-values :rasta [{:type "measure" :id measure-id}]) :measure measure-id))))))))

;;; ------------------------------------------------- Metric sources -------------------------------------------------

(defn- metric-card
  "A `:type :metric` card summing Orders.Total, optionally grouped by month: the shape of the shipped \"Revenue\" metric."
  [breakout?]
  (let [mp (mt/metadata-provider)]
    {:name          (if breakout? "Revenue by month" "Revenue")
     :type          :metric
     :dataset_query (cond-> (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))
                      breakout? (lib/breakout (lib/with-temporal-bucket
                                                (lib.metadata/field mp (mt/id :orders :created_at))
                                                :month)))}))

(defn- card-value [id]
  (source-result (goal-values :crowberto [{:type "card" :id id :columns ["sum"]}]) :card id))

(deftest metric-source-test
  (mt/with-temp [:model/Card {grouped-id :id} (metric-card true)
                 :model/Card {plain-id :id}   (metric-card false)
                 :model/Card {question-id :id} (assoc (metric-card true) :type :question)]
    (testing "a metric that's just an aggregation resolves to its single value"
      (is (=? {:status "completed" :data {:rows [[number?]]}} (card-value plain-id))))
    (testing "a metric grouped for display loses its breakouts and resolves to the aggregation over everything"
      (is (= (get-in (card-value plain-id) [:data :rows])
             (get-in (card-value grouped-id) [:data :rows]))))
    (testing "a plain question with a breakout still fails: only a metric's grouping is presentation"
      (is (=? {:status "failed" :error_type "too-many-rows"} (card-value question-id))))))

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
  (let [result (goal-values :crowberto (for [id card-ids] {:type "card" :id id :columns ["count"]}))]
    (into {} (for [id card-ids] [id (source-result result :card id)]))))

(deftest source-with-parameters-is-refused-test
  (testing "a card whose query reads parameters, directly or through a card it reads, fails with `has-parameters`"
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
      (let [refused {"required variable"         required
                     "defaulted variable"        defaulted
                     "optional clause"           optional
                     "field filter"              field-filter
                     "card parameters"           with-params
                     "built on a defaulted card" on-defaulted
                     "two levels down"           on-on-defaulted
                     "{{#}} to a required card"  referencing-required
                     "{{#}} to an optional card" referencing-optional}
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

;;; ------------------------------------------------ Query and records -----------------------------------------------

(deftest ^:parallel source-query-test
  (let [mp    (mt/metadata-provider)
        query #(#'dynamic-goals/source-query (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                             %1 %2 {:dashboard-id 3 :ignore-cache? %3})]
    (testing "a card source is recorded under its own context, with its id and the chart's dashboard"
      (is (=? {:info        {:context :dynamic-goal, :card-id 7, :dashboard-id 3}
               :constraints {:max-results 2, :max-results-bare-rows 2}
               :middleware  {:userland-query?         true
                             :skip-results-metadata?  true
                             :ignore-cached-results?  false}}
              (query "card" 7 nil))))
    (testing "a measure has no card id to stamp, so it must not borrow the key"
      (is (not (contains? (:info (query "measure" 7 nil)) :card-id))))
    (testing "ignore-cache skips cached results"
      (is (true? (get-in (query "card" 7 true) [:middleware :ignore-cached-results?]))))))

(deftest goal-runs-keep-source-result-metadata-test
  (mt/with-temp [:model/Card    {card-id :id}    {:dataset_query (count-query :venues)}
                 :model/Card    {metric-id :id}  {:type          :metric
                                                  :dataset_query (mt/mbql-query venues {:aggregation [[:count]]
                                                                                        :breakout    [$price]})}
                 :model/Measure {measure-id :id} {:name       "Venue count"
                                                  :table_id   (mt/id :venues)
                                                  :definition (venues-count-measure)}]
    (testing "running a goal doesn't write result_metadata to the card, metric or measure it points at (GDGT-3454)"
      (doseq [[source-type goal-id] [["card" card-id] ["card" metric-id] ["measure" measure-id]]]
        (testing (str source-type " " goal-id)
          (let [written (atom #{})]
            (mt/with-dynamic-fn-redefs [qp.db/set-card-result-metadata! (fn [id _] (swap! written conj id))]
              (is (= "completed" (:status (source-result (goal-values :crowberto [{:type source-type :id goal-id}])
                                                         source-type goal-id)))))
            (is (empty? @written))))))
    (testing "a metric goal keeps the metric's breakout column"
      (mt/user-http-request :crowberto :post 202 (format "card/%d/query" metric-id))
      (goal-values :crowberto [{:type "card" :id metric-id}])
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
          (goal-values :crowberto [{:type "measure" :id shared-id}])
          (is (= before (t2/select-one-fn :result_metadata :model/Card :id twin-id))))))))

(defn- goal-executions!
  "Flush pending QueryExecution writes, then return the ones a dynamic goal recorded, matching `where`."
  [& where]
  (process-userland-query/flush-execution-metadata!)
  (apply t2/select [:model/QueryExecution :card_id :context :executor_id :dashboard_id :cache_hit :error]
         :context :dynamic-goal where))

(deftest goal-run-records-query-execution-test
  (testing "a card source's run is a QueryExecution, as the current user, on the given dashboard"
    (mt/with-temp [:model/Card      {goal-id :id} {:dataset_query (count-query :venues)}
                   :model/Dashboard {dash-id :id} {}]
      (is (= "completed" (:status (source-result (goal-values :rasta [{:type "card" :id goal-id}] :dashboard-id dash-id)
                                                 :card goal-id))))
      (is (=? [{:card_id      goal-id
                :executor_id  (mt/user->id :rasta)
                :dashboard_id dash-id
                :cache_hit    false
                :error        nil}]
              (goal-executions! :card_id goal-id)))))
  (testing "a measure source's run has no card_id, since a measure isn't a card"
    (mt/with-temp [:model/Measure   {measure-id :id} {:name       "Venue count"
                                                      :table_id   (mt/id :venues)
                                                      :definition (venues-count-measure)}
                   :model/Dashboard {dash-id :id}    {}]
      (goal-values :crowberto [{:type "measure" :id measure-id}] :dashboard-id dash-id)
      (is (=? [{:card_id nil :executor_id (mt/user->id :crowberto)}]
              (goal-executions! :dashboard_id dash-id)))))
  (testing "a failed run is recorded with its error"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query {:query "SELECT * FROM no_such_table"})}]
      (goal-values :crowberto [{:type "card" :id goal-id}])
      (is (=? [{:card_id goal-id :error #"(?is).*no_such_table.*"}]
              (goal-executions! :card_id goal-id))))))

(deftest goal-run-is-not-a-view-test
  (testing "a goal run doesn't put the source card in the viewer's recent views"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :venues)}]
      (goal-values :rasta [{:type "card" :id goal-id}])
      (is (false? (t2/exists? :model/RecentViews :user_id (mt/user->id :rasta) :model "card" :model_id goal-id))))))

(deftest goal-runs-use-the-card-cache-test
  (testing "a card source runs under its cache strategy, so a repeat run is served from the cache"
    (mt/with-model-cleanup [:model/CacheConfig]
      (cache-config/store! (mt/user->id :crowberto)
                           {:model    "root"
                            :model_id 0
                            :strategy {:type :ttl :multiplier 99999 :min_duration_ms 0}})
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :venues)}]
        (let [run! #(goal-values :crowberto [{:type "card" :id goal-id}] :ignore-cache? %)]
          (run! false)
          ;; the strategy's average execution time is read from the first run's record
          (process-userland-query/flush-execution-metadata!)
          (run! false)
          (testing "the repeat run is a cache hit"
            (is (=? [{:cache_hit false} {:cache_hit true}]
                    (sort-by :cache_hit (goal-executions! :card_id goal-id)))))
          (testing "ignore-cache skips the cache"
            (run! true)
            (is (= 2 (count (filter (comp false? :cache_hit) (goal-executions! :card_id goal-id)))))))))))

(deftest cache-strategy-uses-the-dashboard-test
  (testing "a card source's cache strategy is picked for the given dashboard; a measure gets none"
    (mt/with-temp [:model/Card      {goal-id :id} {:dataset_query (count-query :venues)}
                   :model/Measure   {measure-id :id} {:name       "Venue count"
                                                      :table_id   (mt/id :venues)
                                                      :definition (venues-count-measure)}
                   :model/Dashboard {dash-id :id} {}]
      (let [asked (atom [])]
        (mt/with-dynamic-fn-redefs [qp.card/card-cache-strategy
                                    (fn [source dashboard-id _query]
                                      (swap! asked conj [(:id source) dashboard-id])
                                      nil)]
          (goal-values :crowberto [{:type "card" :id goal-id} {:type "measure" :id measure-id}]
                       :dashboard-id dash-id))
        (is (= [[goal-id dash-id]] @asked))))))

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
      (testing ":gauge.segments min/max, grouped + de-duped by entity, in order"
        (is (= [{:type "card" :id 1 :columns ["sum" "avg"]}
                {:type "measure" :id 2 :columns ["total"]}]
               (sources :gauge
                        {:gauge.segments [{:min 0 :max {:id 1 :type "card" :column "sum"}}
                                          {:min {:id 1 :type "card" :column "avg"}
                                           :max {:id 1 :type "card" :column "sum"}}
                                          {:min {:id 2 :type "measure" :column "total"} :max nil :color "red"}]}))))
      (testing "a card and a measure with the same id stay separate"
        (is (= 2 (count (sources :gauge {:gauge.segments [{:min {:id 1 :type "card" :column "a"}
                                                           :max {:id 1 :type "measure" :column "b"}}]})))))
      (testing "static numbers and bare-string self-column references are ignored"
        (is (empty? (sources :gauge {:gauge.segments [{:min 0 :max 50} {:min "self_col" :max 100}]}))))
      (testing "a source whose type names no runnable entity is dropped"
        (is (= [{:type "card" :id 1 :columns ["total"]}]
               (sources :gauge {:gauge.segments [{:min {:id 2 :type "segment" :column "total"}
                                                  :max {:id 1 :type "card" :column "total"}}]})))))
    (testing "only the goal settings the display draws count"
      (let [viz {:graph.show_goal  true
                 :graph.goal_value {:id 1 :type "card" :column "a"}
                 :progress.goal    {:id 2 :type "card" :column "b"}
                 :gauge.segments   [{:max {:id 3 :type "card" :column "c"}}]
                 :scalar.segments  [{:max {:id 4 :type "card" :column "d"}}]}]
        (are [display ids] (= ids (set (map :id (sources display viz))))
          :line        #{1}
          :progress    #{2}
          :gauge       #{3}
          :scalar      #{4}
          :table       #{}
          "custom:foo" #{})))
    (testing "no goal settings at all"
      (is (= [] (sources :line {})))))
  (testing "the dashcard's settings count too, and a series card of the dashcard has none"
    (let [chart    {:id 1 :display :gauge :visualization_settings {}}
          dashcard {:card_id 1 :visualization_settings {:gauge.segments [{:max (goal-ref 9)}]}}]
      (is (= [{:type "card" :id 9 :columns ["count"]}] (dynamic-goals/chart-goal-sources chart dashcard)))
      (is (= [] (dynamic-goals/chart-goal-sources (assoc chart :id 2) dashcard))))))

(deftest chart-goal-values-test
  (testing "a saved chart's goals run from its viz settings, its dashcard's included"
    (mt/with-temp [:model/Card      {goal-id :id}    {:dataset_query (count-query :checkins)}
                   :model/Measure   {measure-id :id} {:name       "Venue count"
                                                      :table_id   (mt/id :venues)
                                                      :definition (venues-count-measure)}
                   :model/Card      {line-id :id}    (goal-chart "card" goal-id)
                   :model/Card      {gauge-id :id}   (chart-card :gauge {})
                   :model/Dashboard {dash-id :id}    {}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id           dash-id
                                                           :card_id                gauge-id
                                                           :visualization_settings
                                                           {:gauge.segments [{:min {:id measure-id :type "measure" :column "count"}
                                                                              :max (goal-ref goal-id)}]}}]
      (is (=? {:status "completed" :data {:rows [[1000]]}}
              (source-result (chart-goal-values line-id) :card goal-id)))
      (let [values (chart-goal-values gauge-id :dashcard-id dashcard-id :dashboard-id dash-id)]
        (is (=? {:status "completed" :data {:rows [[1000]]}} (source-result values :card goal-id)))
        (is (=? {:status "completed" :data {:rows [[100]]}} (source-result values :measure measure-id))))
      (testing "runs are recorded on the dashboard"
        (is (=? [{:dashboard_id dash-id}] (goal-executions! :card_id goal-id :dashboard_id dash-id))))))
  (testing "a chart with only a static goal value runs nothing"
    (mt/with-temp [:model/Card {chart-id :id} (chart-card :line {:graph.show_goal true :graph.goal_value 100})]
      (is (= {} (chart-goal-values chart-id)))))
  (testing "a chart's goal is read-checked as the caller"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card       {goal-id :id}  {:collection_id coll-id :dataset_query (count-query :checkins)}
                     :model/Card       {chart-id :id} (goal-chart "card" goal-id)]
        (is (=? {:status "failed" :error string?}
                (source-result (chart-goal-values chart-id :user :rasta) :card goal-id))))))
  (testing "`:anonymous?` keeps error types and replaces error texts with a generic one"
    (mt/with-temp [:model/Card {failing-id :id} {:dataset_query (mt/native-query {:query "SELECT * FROM no_such_table"})}
                   :model/Card {multi-id :id}   {:dataset_query (mt/mbql-query venues)}
                   :model/Card {chart-id :id}   (chart-card :scalar {:scalar.segments [{:min (goal-ref failing-id)}
                                                                                       {:min (goal-ref multi-id)}]})]
      (let [values (chart-goal-values chart-id :anonymous? true)]
        (is (= {:status "failed" :error "An error occurred while running the query."}
               (source-result values :card failing-id)))
        (is (= {:status "failed" :error_type "too-many-rows" :error "An error occurred while running the query."}
               (source-result values :card multi-id)))))))

(defn- visualizer-viz-settings
  "Viz settings of a visualizer dashcard charting `card-id`'s `count`, with `settings` for the chart."
  [card-id settings]
  {:visualization {:display             "line"
                   :columnValuesMapping {:COLUMN_1 [{:sourceId     (str "card:" card-id)
                                                     :originalName "count"
                                                     :name         "COLUMN_1"}]}
                   :settings            settings}})

(deftest visualizer-dashcard-goal-values-test
  (testing "a visualizer dashcard's goal lives in its nested chart settings, which toggle it"
    (mt/with-temp [:model/Card      {goal-id :id}  {:dataset_query (count-query :checkins)}
                   :model/Card      {chart-id :id} {:dataset_query (count-query :venues)}
                   :model/Card      {series-id :id} {:dataset_query (count-query :users)}
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
                                                                               :graph.goal_value (goal-ref goal-id)})}
                   :model/DashboardCardSeries _ {:dashboardcard_id shown-id :card_id series-id}]
      (is (=? {:status "completed" :data {:rows [[1000]]}}
              (source-result (chart-goal-values chart-id :dashcard-id shown-id) :card goal-id)))
      (testing "the other combined cards have none"
        (is (= {} (chart-goal-values series-id :dashcard-id shown-id))))
      (is (= {} (chart-goal-values chart-id :dashcard-id hidden-id))))))

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
          (is (= {} (chart-goal-values chart-id)))))
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
          (is (= {} (chart-goal-values custom-id :dashcard-id custom-dashcard-id))))))))

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
          (is (= [] (dynamic-goals/chart-goal-sources (card series-id) (dashcard dashcard-id))))
          (is (= {} (chart-goal-values series-id :dashcard-id dashcard-id))))))))

(deftest hidden-goal-line-does-not-run-test
  (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (count-query :checkins)}]
    (testing "a saved line chart that hides its goal line doesn't run the goal's source"
      (mt/with-temp [:model/Card {chart-id :id} (chart-card :line {:graph.show_goal  false
                                                                   :graph.goal_value (goal-ref goal-id)})]
        (is (= {} (chart-goal-values chart-id)))))
    (testing "a dashcard that hides the goal line its card shows doesn't run the goal's source"
      (mt/with-temp [:model/Card      {chart-id :id} (chart-card :line {:graph.show_goal  true
                                                                        :graph.goal_value (goal-ref goal-id)})
                     :model/Dashboard {dash-id :id}  {}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id           dash-id
                                                             :card_id                chart-id
                                                             :visualization_settings {:graph.show_goal false}}]
        (is (= "completed" (:status (source-result (chart-goal-values chart-id) :card goal-id))))
        (is (= {} (chart-goal-values chart-id :dashcard-id dashcard-id)))))))

(deftest sources-are-one-level-deep-test
  (testing "a source's own dynamic goals don't run"
    (let [ran (atom [])]
      (mt/with-temp [:model/Card {deep-id :id}   {:dataset_query (count-query :checkins)}
                     :model/Card {source-id :id} (chart-card :scalar {:scalar.segments [{:min (goal-ref deep-id)}]})
                     :model/Card {chart-id :id}  (chart-card :scalar {:scalar.segments [{:min (goal-ref source-id)}]})]
        (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (spy-run-source ran)]
          (is (= "completed" (:status (source-result (chart-goal-values chart-id) :card source-id))))
          (is (= [source-id] @ran))))))
  (testing "a card whose goal is its own value runs its query once more, without looping"
    (mt/with-temp [:model/Card {chart-id :id} (chart-card :scalar {})]
      (t2/update! :model/Card :id chart-id {:visualization_settings {:scalar.segments [{:min (goal-ref chart-id)}]}})
      (is (= [[100]] (get-in (source-result (chart-goal-values chart-id) :card chart-id) [:data :rows]))))))

(deftest chart-source-limit-test
  (testing "a saved chart runs at most 20 sources; each further one fails with `too-many-sources` (GDGT-3467)"
    (mt/with-temp [:model/Card {chart-id :id} (chart-card :gauge {})]
      (t2/update! :model/Card :id chart-id
                  {:visualization_settings {:gauge.segments (for [id (range 1 23)] {:min 0 :max (goal-ref id)})}})
      (let [ran (atom [])]
        (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (fn [source _opts]
                                                               (swap! ran conj (:id source))
                                                               {:status "completed"})]
          (let [values (chart-goal-values chart-id)]
            (is (= (range 1 21) @ran))
            (is (= 22 (count (get values "card"))))
            (is (= #{21 22}
                   (set (for [[id result] (get values "card")
                              :when (= "too-many-sources" (:error_type result))]
                          (parse-long id)))))))))))

;;; --------------------------------------------- Anonymous chart context ---------------------------------------------

(deftest chart-context-goal-values-test
  (mt/with-temp [:model/Card      {goal-id :id}    {:dataset_query (count-query :checkins)}
                 :model/Card      {deleted-id :id} {:dataset_query (count-query :venues)}
                 :model/Card      {failing-id :id} {:dataset_query (mt/native-query {:query "SELECT * FROM no_such_table"})}
                 :model/Card      {chart-id :id}   (chart-card :scalar {:scalar.segments [{:min (goal-ref goal-id)}
                                                                                          {:min (goal-ref deleted-id)}
                                                                                          {:min (goal-ref failing-id)}]})
                 :model/Dashboard {dash-id :id}    {}]
    (t2/delete! :model/Card :id deleted-id)
    (let [context {:card (card chart-id) :dashcard nil :dashboard-id dash-id :signed-parameter-ids #{}}]
      (testing "with no current user, the goals run with full perms"
        (let [values (dynamic-goals/chart-context-goal-values context)]
          (is (=? {:status "completed" :data {:rows [[1000]]}} (source-result values :card goal-id)))
          (testing "error types stay, error texts are generic"
            (is (= {:status "failed" :error_type "not-found" :error "An error occurred while running the query."}
                   (source-result values :card deleted-id)))
            (is (= {:status "failed" :error "An error occurred while running the query."}
                   (source-result values :card failing-id))))
          (testing "recorded with no executor, on the dashboard"
            (is (=? [{:executor_id nil :dashboard_id dash-id}] (goal-executions! :card_id goal-id))))))
      (testing "a signed parameter withholds every goal and runs nothing"
        (let [ran (atom [])]
          (mt/with-dynamic-fn-redefs [dynamic-goals/run-source (spy-run-source ran)]
            (is (= {"card" {(str goal-id)    {:status "failed" :error_type "withheld"}
                            (str deleted-id) {:status "failed" :error_type "withheld"}
                            (str failing-id) {:status "failed" :error_type "withheld"}}}
                   (dynamic-goals/chart-context-goal-values (assoc context :signed-parameter-ids #{"tenant"})))))
          (is (= [] @ran))))
      (testing "only a resolver's output map is accepted"
        (is (thrown? clojure.lang.ExceptionInfo
                     (dynamic-goals/chart-context-goal-values (dissoc context :signed-parameter-ids))))))))
