(ns ^:mb/driver-tests metabase-enterprise.database-routing.public-sharing-test
  "Public questions, public dashboards and public documents on a database with routing enabled answer from the router
  database when an admin has granted that database anonymous access, and refuse when they have not. Every assertion
  runs twice -- once with no account, once as a signed-in non-admin whose routing attribute points at a destination
  database -- and asserts the two agree.

  See [[metabase-enterprise.database-routing.common]] for where that decision is made and why."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.test-util :as routing.tu]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private requesters
  "The two ways one public URL gets visited: with no Metabase account at all, and by a signed-in non-admin whose
  routing attribute points at a destination database. Both must see exactly the same thing."
  [[:anonymous           (fn [& args] (apply client/client args))]
   [:signed-in-non-admin (fn [& args] (apply mt/user-http-request :rasta args))]])

(defn- do-with-public-routing-setup!
  "Publishes public objects on the routed database [[routing.tu/do-with-routed-warehouse!]] stands up, whose
  anonymous-access grant is `granted?`, and calls `f` with a map of the URLs to visit."
  [granted? f]
  (routing.tu/do-with-routed-warehouse!
   granted?
   (fn [{:keys [str-dimension str-query pivot-query param-query tile-query lat-field lon-field]}]
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
             (f {:card-query          (str "public/card/" card-uuid "/query")
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

(defn- from-both
  "Make the same public request as both [[requesters]], apply `extract` to each response, assert the two agree, and
  return the extracted value. The agreement assertion is the regression test for one public URL serving different data
  to different viewers."
  [extract & args]
  (let [extracted (mapv (fn [[requester request]]
                          [requester (extract (apply request args))])
                        requesters)]
    (is (apply = (map second extracted))
        "an anonymous visitor and a signed-in non-admin must see the same thing at one public URL")
    (second (first extracted))))

(def ^:private generic-request-failure
  "What `+public-exceptions` returns for a non-404 error thrown by a public endpoint, i.e. a 400."
  "An error occurred.")

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
  (testing "without the grant, the same paths refuse rather than answering from any database"
    (do-with-public-routing-setup!
     false
     (fn [urls]
       (testing "queries, exports and pivots fail"
         (doseq [[endpoint method url & args] [[:card-query          :get  (:card-query urls)]
                                               [:card-csv            :get  (:card-csv urls)]
                                               [:card-pivot          :get  (:card-pivot urls)]
                                               [:dashcard-query      :get  (:dashcard-query urls)]
                                               [:dashcard-csv        :post (:dashcard-csv urls) {}]
                                               [:dashcard-pivot      :get  (:dashcard-pivot urls)]
                                               [:document-card-query :get  (:document-card-query urls)]
                                               [:document-card-csv   :post (:document-card-csv urls) {}]]]
           (testing endpoint
             (is (= routing.tu/generic-query-failure
                    (apply from-both #(select-keys % [:status :error :error_type]) method url args))))))
       (testing "the parameter, remapping and map-tile endpoints refuse with a 400"
         (doseq [[endpoint method url & args] [[:card-param-remap  :get (:card-param-remap urls)]
                                               [:dash-param-values :get (:dash-param-values urls)]
                                               [:dash-param-search :get (:dash-param-search urls)]
                                               [:dash-param-remap  :get (:dash-param-remap urls)]
                                               [:card-tile         :get (:card-tile urls)
                                                :latField (:lat-field urls) :lonField (:lon-field urls)]
                                               [:dash-tile         :get (:dash-tile urls)
                                                :latField (:lat-field urls) :lonField (:lon-field urls)]]]
           (testing endpoint
             (is (= generic-request-failure
                    (apply from-both identity method 400 url args))))))
       ;; `metabase.parameters.field/search-values-from-field-id` logs and returns `[]` when the underlying fetch
       ;; throws -- long-standing behaviour it shares with sandbox errors and warehouse timeouts -- so these two come
       ;; back empty instead of raising. No destination data reaches the visitor either way.
       (testing "the card parameter-value endpoints return no values"
         (doseq [[endpoint url] [[:card-param-values (:card-param-values urls)]
                                 [:card-param-search (:card-param-search urls)]]]
           (testing endpoint
             (is (=? {:values empty?} (from-both identity :get 200 url))))))))))
