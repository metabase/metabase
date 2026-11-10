(ns metabase.embedding-rest.api.embed-goals-test
  "Dynamic goals on static embeds. Goal sources run without the token's parameter values, so a token that signs one
  gets its goals withheld."
  {:clj-kondo/config '{:linters {:discouraged-var {metabase.test/with-temp {:level :off}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.embedding-rest.api.embed-test :as embed-test]
   [metabase.query-processor.template-tags :as qp.template-tags]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(def ^:private by-tenant-and-price
  (str "SELECT COUNT(*) AS \"count\" FROM venues WHERE 1 = 1"
       " [[AND category_id = {{tenant}}]] [[AND price = {{price}}]]"))

(defn- variable [tag-name]
  {:id tag-name :name tag-name :display-name tag-name :type :number})

(defn- goal [id]
  {:id id :type "card" :column "count"})

(defn- main-card
  "With-temp attributes of an embedded scalar counting venues by `tenant` and `price`, with a goal on card `goal-id`."
  [goal-id embedding-params]
  {:enable_embedding       true
   :embedding_params       embedding-params
   :display                :scalar
   :dataset_query          (mt/native-query {:query         by-tenant-and-price
                                             :template-tags {"tenant" (variable "tenant")
                                                             "price"  (variable "price")}})
   :visualization_settings {:scalar.segments [{:min (goal goal-id) :max nil :color "red"}]}})

(defn- do-with-goal-runs
  "Call `(f runs)`; `runs` is an atom counting the goal sources that started running. Every run first checks its
  source for parameters, and these sources have none."
  [f]
  (let [runs (atom 0)]
    (mt/with-dynamic-fn-redefs [qp.template-tags/reads-parameters? (fn [_]
                                                                     (swap! runs inc)
                                                                     false)]
      (f runs))))

(defn- goal-result [response goal-id]
  (get-in response [:data :referenced_entities :card goal-id]))

(defn- card-response
  "GET the embedded card `card` with a token signing `params`, plus `url-params` from the viewer."
  [card params & [url-params]]
  (client/client :get 202 (str (embed-test/card-query-url card "" {:params params}) url-params)))

(deftest static-embed-card-withholds-goals-for-signed-values-test
  (embed-test/with-embedding-enabled-and-new-secret-key!
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query
                                                              {:query "SELECT COUNT(*) AS \"count\" FROM venues"})}]
      (doseq [{:keys [label embedding-params params url-params withheld? rows]}
              [{:label "locked value", :embedding-params {:tenant "locked"}, :params {:tenant 7}
                :withheld? true, :rows [[10]]}
               {:label "other tenant", :embedding-params {:tenant "locked"}, :params {:tenant 11}
                :withheld? true, :rows [[4]]}
               {:label "signed enabled value", :embedding-params {:tenant "enabled"}, :params {:tenant 7}
                :withheld? true, :rows [[10]]}
               {:label "locked filter turned off", :embedding-params {:tenant "locked"}, :params {:tenant []}
                :withheld? false, :rows [[100]]}
               {:label "signed enabled empty", :embedding-params {:tenant "enabled"}, :params {:tenant []}
                :withheld? false, :rows [[100]]}
               {:label "one off, one set", :embedding-params {:tenant "locked" :price "locked"}
                :params {:tenant [] :price 4}, :withheld? true, :rows [[6]]}
               {:label "no signed params", :embedding-params {:tenant "enabled"}, :params {}
                :withheld? false, :rows [[100]]}
               {:label "viewer sets an enabled value", :embedding-params {:tenant "enabled"}, :params {}
                :url-params "?tenant=7", :withheld? false, :rows [[10]]}]]
        (testing label
          (mt/with-temp [:model/Card card (main-card goal-id embedding-params)]
            (do-with-goal-runs
             (fn [runs]
               (let [response (card-response card params url-params)]
                 (testing "the main query applies the parameters"
                   (is (= rows (mt/rows response))))
                 (if withheld?
                   (testing "the goal is withheld and its source never runs"
                     (is (= {:status "failed" :error_type "withheld"} (goal-result response goal-id)))
                     (is (zero? @runs)))
                   (testing "the goal resolves"
                     (is (= "completed" (:status (goal-result response goal-id))))
                     (is (= [[100]] (get-in (goal-result response goal-id) [:data :rows])))
                     (is (= 1 @runs)))))))))))))

(deftest static-embed-dashcard-withholds-goals-for-signed-values-test
  (embed-test/with-embedding-enabled-and-new-secret-key!
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query
                                                              {:query "SELECT COUNT(*) AS \"count\" FROM venues"})}
                   :model/Card {card-id :id} (main-card goal-id {})
                   :model/Dashboard {dash-id :id} {:enable_embedding true
                                                   :embedding_params {:tenant "locked"}
                                                   :parameters       [{:id "_T_" :name "Tenant" :slug "tenant"
                                                                       :type "number/="}]}
                   :model/DashboardCard plain {:dashboard_id       dash-id
                                               :card_id            card-id
                                               :parameter_mappings [{:parameter_id "_T_"
                                                                     :card_id      card-id
                                                                     :target       [:variable
                                                                                    [:template-tag "tenant"]]}]}
                   :model/DashboardCard visualizer
                   {:dashboard_id           dash-id
                    :card_id                card-id
                    :parameter_mappings     [{:parameter_id "_T_"
                                              :card_id      card-id
                                              :target       [:variable [:template-tag "tenant"]]}]
                    :visualization_settings {:visualization
                                             {:display             "line"
                                              :columnValuesMapping {:COLUMN_1 [{:sourceId     (str "card:" card-id)
                                                                                :originalName "count"
                                                                                :name         "COLUMN_1"}]}
                                              :settings            {:graph.show_goal  true
                                                                    :graph.goal_value (goal goal-id)}}}}]
      (doseq [[label dashcard] {"dashcard" plain, "visualizer dashcard" visualizer}]
        (testing label
          (do-with-goal-runs
           (fn [runs]
             (let [response (client/client :get 202 (embed-test/dashcard-url dashcard {:params {:tenant [7]}}))]
               (is (= [[10]] (mt/rows response)))
               (is (= {:status "failed" :error_type "withheld"} (goal-result response goal-id)))
               (is (zero? @runs))))))
        (testing (str label ", locked filter turned off")
          (let [response (client/client :get 202 (embed-test/dashcard-url dashcard {:params {:tenant []}}))]
            (is (= [[100]] (mt/rows response)))
            (is (= "completed" (:status (goal-result response goal-id))))))))))

(deftest preview-embed-withholds-goals-for-signed-values-test
  (testing "the embed preview shows the author what the embed will show"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query
                                                                {:query "SELECT COUNT(*) AS \"count\" FROM venues"})}
                     :model/Card card (main-card goal-id {:tenant "locked"})]
        (let [response (mt/user-http-request :crowberto :get 202
                                             (str "preview_embed/card/"
                                                  (embed-test/card-token card {:_embedding_params {:tenant "locked"}
                                                                               :params            {:tenant 7}})
                                                  "/query"))]
          (is (= [[10]] (mt/rows response)))
          (is (= {:status "failed" :error_type "withheld"} (goal-result response goal-id))))))))

(deftest failing-goal-source-error-is-scrubbed-test
  (testing "embed and public viewers get the generic error for a failing goal source, not the driver's message"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (embed-test/with-embedding-enabled-and-new-secret-key!
        (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query
                                                                  {:query "SELECT * FROM no_such_table"})}
                       :model/Card card (assoc (main-card goal-id {:tenant "enabled"})
                                               :public_uuid (str (random-uuid)))]
          (doseq [[label response] {"static embed" (card-response card {})
                                    "public"       (client/client :get 202 (str "public/card/" (:public_uuid card)
                                                                                "/query"))}]
            (testing label
              (is (= [[100]] (mt/rows response)))
              (is (=? {:status "failed" :error "An error occurred while running the query."}
                      (goal-result response goal-id)))
              (is (not (re-find #"(?i)no_such_table" (pr-str response)))))))))))
