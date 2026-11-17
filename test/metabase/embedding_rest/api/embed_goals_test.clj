(ns metabase.embedding-rest.api.embed-goals-test
  "Dynamic goals on static embeds and embed previews, served by the `/goal-values` routes. Goal sources run without
  the token's parameter values, so a token that signs one gets its goals withheld."
  {:clj-kondo/config '{:linters {:discouraged-var {metabase.test/with-temp {:level :off}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.embedding-rest.api.embed-test :as embed-test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(def ^:private by-tenant-and-price
  (str "SELECT COUNT(*) AS \"count\" FROM venues WHERE 1 = 1"
       " [[AND category_id = {{tenant}}]] [[AND price = {{price}}]]"))

(defn- variable [tag-name]
  {:id tag-name :name tag-name :display-name tag-name :type :number})

(defn- goal
  ([id] (goal "card" id))
  ([source-type id] {:id id :type source-type :column "count"}))

(defn- main-card
  "With-temp attributes of an embedded scalar counting venues by `tenant` and `price`, with a goal on card `goal-id`
  (and on measure `measure-id`, when given)."
  [goal-id embedding-params & [measure-id]]
  {:enable_embedding       true
   :embedding_params       embedding-params
   :display                :scalar
   :dataset_query          (mt/native-query {:query         by-tenant-and-price
                                             :template-tags {"tenant" (variable "tenant")
                                                             "price"  (variable "price")}})
   :visualization_settings {:scalar.segments [{:min   (goal goal-id)
                                               :max   (when measure-id (goal "measure" measure-id))
                                               :color "red"}]}})

(defn- venue-count-measure []
  {:name       "Venue count"
   :table_id   (mt/id :venues)
   :definition (let [mp (mt/metadata-provider)]
                 (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                     (lib/aggregate (lib/count))))})

(def ^:private count-venues-query
  (delay (mt/native-query {:query "SELECT COUNT(*) AS \"count\" FROM venues"})))

(defn- do-with-goal-runs
  "Call `(f runs)`; `runs` is an atom counting the goal sources that started running. Every run first checks its
  source for parameters, and these sources have none."
  [f]
  (let [runs (atom 0)]
    (mt/with-dynamic-fn-redefs [queries/card-reads-parameters? (fn [_]
                                                                     (swap! runs inc)
                                                                     false)]
      (f runs))))

(def ^:private withheld {:status "failed" :error_type "withheld"})

(defn- card-response
  "GET the embedded card `card` with a token signing `params`, plus `url-params` from the viewer."
  [card params & [url-params]]
  (client/client :get 202 (str (embed-test/card-query-url card "" {:params params}) url-params)))

(defn- card-goal-url [card token-keys]
  (str (embed-test/card-url card token-keys) "/goal-values"))

(defn- dashcard-goal-url [dashcard token-keys]
  (str (embed-test/dashcard-url dashcard token-keys) "/goal-values"))

(defn- preview-card-goal-url [card token-keys]
  (str "preview_embed/card/" (embed-test/card-token card token-keys) "/goal-values"))

(defn- preview-dashcard-goal-url [dashcard token-keys]
  (str "preview_embed/dashboard/" (embed-test/dash-token (:dashboard_id dashcard) token-keys)
       "/dashcard/" (:id dashcard) "/card/" (:card_id dashcard) "/goal-values"))

(deftest card-and-dashcard-goal-values-test
  (testing "card and measure goal sources resolve on the embed and preview goal routes"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (mt/with-temp [:model/Card      {goal-id :id}    {:dataset_query @count-venues-query}
                     :model/Measure   {measure-id :id} (venue-count-measure)
                     :model/Card      {card-id :id :as card} (main-card goal-id {} measure-id)
                     :model/Dashboard {dash-id :id}    {:enable_embedding true}
                     :model/DashboardCard dashcard     {:dashboard_id dash-id :card_id card-id}]
        (doseq [[label url] {"embed card"       (card-goal-url card {})
                             "embed dashcard"   (dashcard-goal-url dashcard {})
                             "preview card"     (preview-card-goal-url card {:_embedding_params {}})
                             "preview dashcard" (preview-dashcard-goal-url dashcard {:_embedding_params {}})}]
          (testing label
            (is (=? {:card    {goal-id {:status "completed" :data {:rows [[100]]}}}
                     :measure {measure-id {:status "completed" :data {:rows [[100]]}}}}
                    (mt/user-http-request :crowberto :get 202 url)))))))))

(deftest static-embed-card-withholds-goals-for-signed-values-test
  (embed-test/with-embedding-enabled-and-new-secret-key!
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query @count-venues-query}]
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
               ;; the goal request carries no viewer params, and a viewer value doesn't withhold anything
               {:label "viewer sets an enabled value", :embedding-params {:tenant "enabled"}, :params {}
                :url-params "?tenant=7", :withheld? false, :rows [[10]]}]]
        (testing label
          (mt/with-temp [:model/Card card (main-card goal-id embedding-params)]
            (testing "the main query applies the parameters, and carries no goals"
              (let [response (card-response card params url-params)]
                (is (= rows (mt/rows response)))
                (is (not (contains? (:data response) :referenced_entities)))))
            (do-with-goal-runs
             (fn [runs]
               (let [result (get-in (client/client :get 202 (card-goal-url card {:params params})) [:card goal-id])]
                 (if withheld?
                   (testing "the goal is withheld and its source never runs"
                     (is (= withheld result))
                     (is (zero? @runs)))
                   (testing "the goal resolves"
                     (is (=? {:status "completed" :data {:rows [[100]]}} result))
                     (is (= 1 @runs)))))))))))))

(defn- tenant-mapping [card-id]
  {:parameter_id "_T_" :card_id card-id :target [:variable [:template-tag "tenant"]]})

(defn- visualizer-settings
  "A visualizer line chart drawing `count` from cards `card-ids`, with a goal on card `goal-id`."
  [goal-id & card-ids]
  {:visualization
   {:display             "line"
    :columnValuesMapping (into {}
                               (map-indexed (fn [i card-id]
                                              (let [column (str "COLUMN_" (inc i))]
                                                [(keyword column) [{:sourceId     (str "card:" card-id)
                                                                    :originalName "count"
                                                                    :name         column}]])))
                               card-ids)
    :settings            {:graph.show_goal true :graph.goal_value (goal goal-id)}}})

(deftest static-embed-dashcard-withholds-goals-for-signed-values-test
  (embed-test/with-embedding-enabled-and-new-secret-key!
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query @count-venues-query}
                   :model/Card {card-id :id} (main-card goal-id {})
                   :model/Card {secondary-id :id} (main-card goal-id {})
                   :model/Dashboard {dash-id :id} {:enable_embedding true
                                                   :embedding_params {:tenant "locked"}
                                                   :parameters       [{:id "_T_" :name "Tenant" :slug "tenant"
                                                                       :type "number/="}]}
                   :model/DashboardCard plain {:dashboard_id       dash-id
                                               :card_id            card-id
                                               :parameter_mappings [(tenant-mapping card-id)]}
                   :model/DashboardCard unwired {:dashboard_id dash-id
                                                 :card_id      card-id}
                   :model/DashboardCard visualizer {:dashboard_id           dash-id
                                                    :card_id                card-id
                                                    :parameter_mappings     [(tenant-mapping card-id)]
                                                    :visualization_settings (visualizer-settings goal-id card-id)}
                   :model/DashboardCard {secondary-only-id :id :as secondary-only}
                   {:dashboard_id           dash-id
                    :card_id                card-id
                    :parameter_mappings     [(tenant-mapping secondary-id)]
                    :visualization_settings (visualizer-settings goal-id card-id secondary-id)}
                   :model/DashboardCardSeries _ {:dashboardcard_id secondary-only-id :card_id secondary-id}]
      (doseq [{:keys [label dashcard rows]}
              [{:label "dashcard", :dashcard plain, :rows [[10]]}
               {:label "visualizer dashcard", :dashcard visualizer, :rows [[10]]}
               ;; the signed value doesn't filter the card's query, but the goal source can still read tenant data
               {:label "dashcard not wired to the signed filter", :dashcard unwired, :rows [[100]]}
               ;; the goal rides on the primary card, which the signed filter doesn't reach
               {:label "visualizer dashcard filtered through a secondary source only", :dashcard secondary-only
                :rows [[100]]}]]
        (testing label
          (is (= rows (mt/rows (client/client :get 202 (embed-test/dashcard-url dashcard {:params {:tenant [7]}})))))
          (do-with-goal-runs
           (fn [runs]
             (is (= withheld
                    (get-in (client/client :get 202 (dashcard-goal-url dashcard {:params {:tenant [7]}}))
                            [:card goal-id])))
             (is (zero? @runs)))))
        (testing (str label ", locked filter turned off")
          (is (= [[100]] (mt/rows (client/client :get 202 (embed-test/dashcard-url dashcard {:params {:tenant []}})))))
          (is (= "completed"
                 (get-in (client/client :get 202 (dashcard-goal-url dashcard {:params {:tenant []}}))
                         [:card goal-id :status]))))))))

(deftest preview-embed-withholds-goals-for-signed-values-test
  (testing "the embed preview shows the author what the embed will show"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query @count-venues-query}
                     :model/Card card (main-card goal-id {:tenant "locked"})]
        (let [token-keys {:_embedding_params {:tenant "locked"} :params {:tenant 7}}]
          (is (= [[10]] (mt/rows (mt/user-http-request :crowberto :get 202
                                                       (str "preview_embed/card/" (embed-test/card-token card token-keys)
                                                            "/query")))))
          (is (= withheld
                 (get-in (mt/user-http-request :crowberto :get 202 (preview-card-goal-url card token-keys))
                         [:card goal-id]))))))))

(deftest tenant-signed-token-withholds-every-source-test
  (testing "a token that signs a tenant value withholds every goal source, card and measure, on every goal route"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (mt/with-temp [:model/Card      {goal-id :id}    {:dataset_query @count-venues-query}
                     :model/Measure   {measure-id :id} (venue-count-measure)
                     :model/Card      {card-id :id :as card} (main-card goal-id {:tenant "locked"} measure-id)
                     :model/Dashboard {dash-id :id}    {:enable_embedding true
                                                        :embedding_params {:tenant "locked"}
                                                        :parameters       [{:id "_T_" :name "Tenant" :slug "tenant"
                                                                            :type "number/="}]}
                     :model/DashboardCard wired   {:dashboard_id       dash-id
                                                   :card_id            card-id
                                                   :parameter_mappings [(tenant-mapping card-id)]}
                     :model/DashboardCard unwired {:dashboard_id dash-id :card_id card-id}]
        (let [token-keys         {:params {:tenant 7}}
              preview-token-keys (assoc token-keys :_embedding_params {:tenant "locked"})]
          (doseq [[label url] {"embed card"                (card-goal-url card token-keys)
                               "embed dashcard"            (dashcard-goal-url wired token-keys)
                               "embed unwired dashcard"    (dashcard-goal-url unwired token-keys)
                               "preview card"              (preview-card-goal-url card preview-token-keys)
                               "preview dashcard"          (preview-dashcard-goal-url wired preview-token-keys)
                               "preview unwired dashcard"  (preview-dashcard-goal-url unwired preview-token-keys)}]
            (testing label
              (do-with-goal-runs
               (fn [runs]
                 (is (= {:card {goal-id withheld} :measure {measure-id withheld}}
                        (mt/user-http-request :crowberto :get 202 url)))
                 (is (zero? @runs)))))))))))

(deftest goal-routes-validate-token-params-test
  (testing "the goal routes validate the token against `embedding_params` exactly like their chart routes"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (mt/with-temp [:model/Card      {goal-id :id} {:dataset_query @count-venues-query}
                     :model/Card      {card-id :id :as card} (main-card goal-id {:tenant "locked" :price "disabled"})
                     :model/Dashboard {dash-id :id} {:enable_embedding true
                                                     :embedding_params {:tenant "locked" :price "disabled"}
                                                     :parameters       [{:id "_T_" :name "Tenant" :slug "tenant"
                                                                         :type "number/="}
                                                                        {:id "_P_" :name "Price" :slug "price"
                                                                         :type "number/="}]}
                     :model/DashboardCard dashcard {:dashboard_id       dash-id
                                                    :card_id            card-id
                                                    :parameter_mappings [(tenant-mapping card-id)]}]
        (doseq [[label params message] [["locked param missing from the token" {}
                                          "You must specify a value for :tenant in the JWT."]
                                         ["disabled param in the token" {:tenant 7 :price 4}
                                          "You're not allowed to specify a value for price."]
                                         ["unknown param in the token" {:tenant 7 :nope 1}
                                          "Unknown parameter nope."]]
                [route chart-url goal-url] [["card"
                                             (embed-test/card-query-url card "" {:params params})
                                             (card-goal-url card {:params params})]
                                            ["dashcard"
                                             (embed-test/dashcard-url dashcard {:params params})
                                             (dashcard-goal-url dashcard {:params params})]]]
          (testing (str label ", " route)
            (do-with-goal-runs
             (fn [runs]
               (is (= message (client/client :get 400 chart-url)))
               (is (= message (client/client :get 400 goal-url)))
               (is (zero? @runs))))))))))

(deftest failing-goal-source-error-is-scrubbed-test
  (testing "embed and preview viewers get the generic error for a failing goal source, not the driver's message"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/native-query
                                                                {:query "SELECT * FROM no_such_table"})}
                     :model/Card {card-id :id :as card} (main-card goal-id {:tenant "enabled"})
                     :model/Dashboard {dash-id :id} {:enable_embedding true}
                     :model/DashboardCard dashcard {:dashboard_id dash-id :card_id card-id}]
        (doseq [[label url] {"static embed card"     (card-goal-url card {})
                             "static embed dashcard" (dashcard-goal-url dashcard {})
                             "preview card"          (preview-card-goal-url card {:_embedding_params {}})
                             "preview dashcard"      (preview-dashcard-goal-url dashcard {:_embedding_params {}})}]
          (testing label
            (let [response (mt/user-http-request :crowberto :get 202 url)]
              (is (=? {:status "failed" :error "An error occurred while running the query."}
                      (get-in response [:card goal-id])))
              (is (not (re-find #"(?i)no_such_table" (pr-str response)))))))))))
