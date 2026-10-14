(ns ^:mb/driver-tests metabase-enterprise.database-routing.public-sharing-test
  "Public questions, public dashboards and public documents on a database with routing enabled answer from the router
  database when an admin has granted that database anonymous access, and refuse when they have not. Every assertion
  runs twice -- once with no account, once as a signed-in non-admin whose routing attribute points at a destination
  database -- and asserts the two agree, refusal included. A viewer who may manage the routed database is the
  exception, covered separately below.

  See [[metabase-enterprise.database-routing.common]] for where that decision is made and why."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.test-util :as routing.tu]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private requesters
  "The two ways one public URL gets visited by someone who could not act on an explanation: with no Metabase account
  at all, and by a signed-in non-admin whose routing attribute points at a destination database. Both must see
  exactly the same thing."
  [[:anonymous           (fn [& args] (apply client/client args))]
   [:signed-in-non-admin (fn [& args] (apply mt/user-http-request :rasta args))]])

(defn- do-with-public-routing-setup!
  "Publishes public objects on the routed database [[routing.tu/do-with-routed-warehouse!]] stands up, whose
  anonymous-access grant is `granted?`, and calls `f` with a map of the URLs to visit plus the router database's
  `:db-id` and `:db-name`."
  [granted? f]
  (routing.tu/do-with-routed-warehouse!
   granted?
   (fn [{:keys [db-id db-name str-dimension str-query pivot-query param-query tile-query lat-field lon-field]}]
     (let [card-uuid  (str (random-uuid))
           pivot-uuid (str (random-uuid))
           param-uuid (str (random-uuid))
           tile-uuid  (str (random-uuid))
           dash-uuid  (str (random-uuid))
           doc-uuid   (str (random-uuid))
           shared     (fn [uuid]
                        {:public_uuid uuid, :made_public_by_id (mt/user->id :crowberto)})]
       (mt/with-temp [:model/Card card
                      (merge (shared card-uuid) {:dataset_query str-query})
                      :model/Card pivot-card
                      (merge (shared pivot-uuid) {:dataset_query pivot-query})
                      :model/Card _param-card
                      (merge (shared param-uuid) {:dataset_query param-query})
                      :model/Card tile-card
                      (merge (shared tile-uuid) {:dataset_query tile-query})
                      :model/Dashboard dashboard
                      (merge (shared dash-uuid) {:parameters [{:id   "_STR_"
                                                               :name "Str"
                                                               :slug "str"
                                                               :type "string/="}]})
                      :model/DashboardCard dashcard
                      {:dashboard_id       (u/the-id dashboard)
                       :card_id            (u/the-id card)
                       :parameter_mappings [{:parameter_id "_STR_"
                                             :card_id      (u/the-id card)
                                             :target       str-dimension}]}
                      :model/DashboardCard pivot-dashcard
                      {:dashboard_id (u/the-id dashboard), :card_id (u/the-id pivot-card)}
                      :model/DashboardCard tile-dashcard
                      {:dashboard_id (u/the-id dashboard), :card_id (u/the-id tile-card)}
                      :model/Document document
                      (merge (shared doc-uuid)
                             {:name     "Routed Document"
                              :document (documents.test-util/text->prose-mirror-ast "placeholder")})
                      :model/Card document-card
                      {:name          "Routed document card"
                       :document_id   (u/the-id document)
                       :dataset_query str-query}]
         (t2/update! :model/Document (u/the-id document)
                     {:document (documents.test-util/cards->prose-mirror-ast
                                 [(u/the-id document-card)])})
         (let [card-id     (u/the-id card)
               dc-id       (u/the-id dashcard)
               pivot-dc    [(u/the-id pivot-dashcard) (u/the-id pivot-card)]
               tile-dc     [(u/the-id tile-dashcard) (u/the-id tile-card)]
               doc-card-id (u/the-id document-card)]
           (mt/with-temporary-setting-values [enable-public-sharing true]
             (f {:db-id               db-id
                 :db-name             db-name
                 :card-query          (str "public/card/" card-uuid "/query")
                 :card-csv            (str "public/card/" card-uuid "/query/csv")
                 :card-pivot          (str "public/pivot/card/" pivot-uuid "/query")
                 :card-param-values   (str "public/card/" param-uuid "/params/_STR_/values")
                 :card-param-search   (str "public/card/" param-uuid "/params/_STR_/search/router")
                 :card-param-remap    (str "public/card/" param-uuid
                                           "/params/_STR_/remapping?value=router-data")
                 :card-tile           (str "public/tiles/card/" tile-uuid "/1/1/1")
                 :dashcard-query      (format "public/dashboard/%s/dashcard/%d/card/%d"
                                              dash-uuid dc-id card-id)
                 :dashcard-csv        (format "public/dashboard/%s/dashcard/%d/card/%d/csv"
                                              dash-uuid dc-id card-id)
                 :dashcard-pivot      (apply format "public/pivot/dashboard/%s/dashcard/%d/card/%d"
                                             dash-uuid pivot-dc)
                 :dash-param-values   (str "public/dashboard/" dash-uuid "/params/_STR_/values")
                 :dash-param-search   (str "public/dashboard/" dash-uuid "/params/_STR_/search/router")
                 :dash-param-remap    (str "public/dashboard/" dash-uuid
                                           "/params/_STR_/remapping?value=router-data")
                 :dash-tile           (apply format
                                             "public/tiles/dashboard/%s/dashcard/%d/card/%d/1/1/1"
                                             dash-uuid tile-dc)
                 :document-card-query (format "public/document/%s/card/%d" doc-uuid doc-card-id)
                 :document-card-csv   (format "public/document/%s/card/%d/csv" doc-uuid doc-card-id)
                 :lat-field           lat-field
                 :lon-field           lon-field}))))))))

(defn- both
  "Make the same public request as both [[requesters]], apply `extract` to each response, and return the two extracted
  values keyed by requester."
  [extract & args]
  (into {}
        (map (fn [[requester request]]
               [requester (extract (apply request args))]))
        requesters))

(defn- from-both
  "Like [[both]], but asserts the two requesters saw the same thing and returns it. The agreement assertion is the
  regression test for one public URL serving different data to different viewers."
  [extract & args]
  (let [{:keys [anonymous signed-in-non-admin]} (apply both extract args)]
    (is (= anonymous signed-in-non-admin)
        "an anonymous visitor and a signed-in non-admin must see the same thing at one public URL")
    anonymous))

(def ^:private generic-request-failure
  "What `+public-exceptions` returns for a non-404 error thrown by a public endpoint, i.e. a 400, when nothing wrote a
  message for the viewer."
  "An error occurred.")

(defn- query-paths
  "The refused paths whose failure the query processor formats, as `[endpoint & request-args]`."
  [urls]
  [[:card-query          :get  (:card-query urls)]
   [:card-csv            :get  (:card-csv urls)]
   [:card-pivot          :get  (:card-pivot urls)]
   [:dashcard-query      :get  (:dashcard-query urls)]
   [:dashcard-csv        :post (:dashcard-csv urls) {}]
   [:dashcard-pivot      :get  (:dashcard-pivot urls)]
   [:document-card-query :get  (:document-card-query urls)]
   [:document-card-csv   :post (:document-card-csv urls) {}]])

(defn- message-paths
  "The refused paths that raise instead, where `+public-exceptions` decides the body, as `[endpoint & request-args]`."
  [urls]
  [[:card-param-remap  :get 400 (:card-param-remap urls)]
   [:dash-param-values :get 400 (:dash-param-values urls)]
   [:dash-param-search :get 400 (:dash-param-search urls)]
   [:dash-param-remap  :get 400 (:dash-param-remap urls)]
   [:card-tile         :get 400 (:card-tile urls)
    :latField (:lat-field urls) :lonField (:lon-field urls)]
   [:dash-tile         :get 400 (:dash-tile urls)
    :latField (:lat-field urls) :lonField (:lon-field urls)]])

(def ^:private query-failure-keys
  [:status :error :error_type :error_is_curated])

(defn- refused-as
  "Visit every `[endpoint & request-args]` in `paths` as each of [[requesters]], assert `extract` of every response is
  `expected`, and return every whole body shown, for the caller to check for disclosures."
  [paths extract expected]
  (into []
        (mapcat (fn [[endpoint & request-args]]
                  (testing endpoint
                    (let [shown (apply both identity request-args)]
                      (doseq [[requester body] shown]
                        (is (= expected (extract body))
                            (str (name requester) " may not manage the database, so learns only that something went"
                                 " wrong")))
                      (vals shown)))))
        paths))

;;; --------------------------------------------- Grant in place ----------------------------------------------------
(deftest public-question-uses-router-database-test
  (testing "a public question on a granted routed database answers from the router database, on every endpoint"
    (do-with-public-routing-setup!
     true
     (fn [urls]
       (testing "GET /api/public/card/:uuid/query"
         (is (= [["router-data"]] (from-both mt/rows :get 202 (:card-query urls)))))
       (testing "GET /api/public/card/:uuid/query/:export-format"
         (is (routing.tu/router-data-only? (from-both identity :get 200 (:card-csv urls)))))
       (testing "GET /api/public/pivot/card/:uuid/query"
         (is (= #{"router-data"} (from-both routing.tu/strings-in-rows :get 202 (:card-pivot urls)))))
       (testing "GET /api/public/card/:uuid/params/:param-key/values"
         (is (=? {:values [["router-data"]], :has_more_values false}
                 (from-both identity :get 200 (:card-param-values urls)))))
       (testing "GET /api/public/card/:uuid/params/:param-key/search/:query"
         (is (=? {:values [["router-data"]]}
                 (from-both identity :get 200 (:card-param-search urls)))))
       (testing "GET /api/public/card/:uuid/params/:param-key/remapping"
         (is (= ["router-data"] (from-both identity :get 200 (:card-param-remap urls)))))
       (testing "GET /api/public/tiles/card/:uuid/:zoom/:x/:y"
         (is (true? (from-both routing.tu/png? :get 200 (:card-tile urls)
                               :latField (:lat-field urls)
                               :lonField (:lon-field urls)))))))))

(deftest public-dashboard-uses-router-database-test
  (testing "a public dashboard on a granted routed database answers from the router database, on every endpoint"
    (do-with-public-routing-setup!
     true
     (fn [urls]
       (testing "GET /api/public/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
         (is (= [["router-data"]] (from-both mt/rows :get 202 (:dashcard-query urls)))))
       (testing "POST /api/public/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/:export-format"
         (is (routing.tu/router-data-only? (from-both identity :post 200 (:dashcard-csv urls) {}))))
       (testing "GET /api/public/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
         (is (= #{"router-data"} (from-both routing.tu/strings-in-rows :get 202 (:dashcard-pivot urls)))))
       (testing "GET /api/public/dashboard/:uuid/params/:param-key/values"
         (is (=? {:values [["router-data"]], :has_more_values false}
                 (from-both identity :get 200 (:dash-param-values urls)))))
       (testing "GET /api/public/dashboard/:uuid/params/:param-key/search/:query"
         (is (=? {:values [["router-data"]]}
                 (from-both identity :get 200 (:dash-param-search urls)))))
       (testing "GET /api/public/dashboard/:uuid/params/:param-key/remapping"
         (is (= ["router-data"] (from-both identity :get 200 (:dash-param-remap urls)))))
       (testing "GET /api/public/tiles/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
         (is (true? (from-both routing.tu/png? :get 200 (:dash-tile urls)
                               :latField (:lat-field urls)
                               :lonField (:lon-field urls)))))))))

(deftest public-document-uses-router-database-test
  (testing "a card in a public document on a granted routed database answers from the router database"
    (do-with-public-routing-setup!
     true
     (fn [urls]
       (testing "GET /api/public/document/:uuid/card/:card-id"
         (is (= [["router-data"]] (from-both mt/rows :get 202 (:document-card-query urls)))))
       (testing "POST /api/public/document/:uuid/card/:card-id/:export-format"
         (is (routing.tu/router-data-only? (from-both identity :post 200 (:document-card-csv urls) {}))))))))

;;; --------------------------------------------- Grant withheld ----------------------------------------------------

(deftest public-links-refused-without-the-grant-test
  (testing "without the grant, the same paths refuse rather than answering from any database, and tell a viewer who
           could not act on an explanation nothing about the configuration"
    (do-with-public-routing-setup!
     false
     (fn [{:keys [db-name] :as urls}]
       (let [query-failures   (testing "queries, exports and pivots fail"
                                (refused-as (query-paths urls)
                                            #(select-keys % query-failure-keys)
                                            routing.tu/generic-query-failure))
             message-failures (testing "the parameter, remapping and map-tile endpoints refuse with a 400"
                                (refused-as (message-paths urls) identity generic-request-failure))]
         ;; `metabase.parameters.field/search-values-from-field-id` logs and returns `[]` when the underlying fetch
         ;; throws -- long-standing behaviour it shares with sandbox errors and warehouse timeouts -- so these two come
         ;; back empty instead of raising. No destination data reaches the visitor either way.
         (testing "the card parameter-value endpoints return no values"
           (doseq [[endpoint url] [[:card-param-values (:card-param-values urls)]
                                   [:card-param-search (:card-param-search urls)]]]
             (testing endpoint
               (is (=? {:values empty?} (from-both identity :get 200 url))))))
         (testing "nothing they were shown names the database, the feature or the setting"
           (doseq [shown      (concat query-failures message-failures)
                   disclosure (routing.tu/configuration-disclosures db-name)]
             (is (not (str/includes? (str shown) disclosure))
                 (str (pr-str disclosure) " leaked in " (pr-str shown))))))))))

(deftest refusal-explains-itself-to-a-database-manager-test
  (testing "a viewer holding manage-database permission on the routed database -- the one who could go and grant
           anonymous access -- is told which database and which setting, on both refusal contracts"
    (do-with-public-routing-setup!
     false
     (fn [{:keys [db-id db-name] :as urls}]
       (testing "a signed-in viewer who may not manage the database is told nothing, feature or no feature"
         (mt/with-additional-premium-features #{:advanced-permissions}
           (is (= routing.tu/generic-query-failure
                  (-> (mt/user-http-request :rasta :get (:card-query urls))
                      (select-keys query-failure-keys))))))
       (routing.tu/do-as-database-manager!
        db-id
        (fn []
          (testing "queries, exports and pivots"
            (doseq [[endpoint & request-args] (query-paths urls)]
              (testing endpoint
                (is (= (routing.tu/query-failure-for-manager db-name)
                       (-> (apply mt/user-http-request :rasta request-args)
                           (select-keys query-failure-keys)))))))
          (testing "the parameter, remapping and map-tile endpoints"
            (doseq [[endpoint & request-args] (message-paths urls)]
              (testing endpoint
                (is (= (routing.tu/manager-refusal-message db-name)
                       (apply mt/user-http-request :rasta request-args))))))))))))

(deftest refusal-is-warned-about-server-side-test
  (testing "a refused query logs a warning naming the database and the setting, whoever was visiting, so the same
           diagnosis is available from the logs alone"
    (do-with-public-routing-setup!
     false
     (fn [{:keys [db-name] :as urls}]
       (doseq [[requester request] requesters]
         (testing requester
           (mt/with-log-messages-for-level [messages [metabase-enterprise.database-routing.common :warn]]
             (request :get (:card-query urls))
             (let [warnings (->> (messages)
                                 (filter (comp #{:warn} :level))
                                 (map :message))]
               (is (some (fn [message]
                           (and (str/includes? message db-name)
                                (str/includes? message "anonymous_access_granted")))
                         warnings)
                   (pr-str warnings))))))))))
