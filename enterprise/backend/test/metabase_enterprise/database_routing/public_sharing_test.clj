(ns ^:mb/driver-tests metabase-enterprise.database-routing.public-sharing-test
  "Public questions, public dashboards and public documents on a database with routing enabled answer from the router
  database when an admin has granted that database anonymous access, and refuse when they have not.

  The grant is read off the database, never off whoever is visiting, so one public URL serves the same data to an
  anonymous visitor and to a signed-in non-admin whose routing attribute points at a destination database."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.e2e-test :refer [execute-statement! with-routing-setup!]]
   [metabase-enterprise.test :as met]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.driver.settings :as driver.settings]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(def ^:private requesters
  "The two ways one public URL gets visited: with no Metabase account at all, and by a signed-in non-admin whose
  routing attribute points at a destination database. Both must see exactly the same thing."
  [[:anonymous           (fn [& args] (apply client/client args))]
   [:signed-in-non-admin (fn [& args] (apply mt/user-http-request :rasta args))]])

(defn- do-with-public-routing-setup!
  "Stands up a routed database whose anonymous-access grant is `granted?`, with public objects on it, and calls `f`
  with a map of the URLs to visit.

  The router database's single row reads `router-data` and the destination's reads `destination-data`, so every
  assertion can tell which database answered. The latitude and longitude columns exist on the router database only: a
  map tile renders a PNG whether or not it found any points, so a tile query that reached the destination has to fail
  to be distinguishable from one that did not."
  [granted? f]
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes! :rasta {"db_name" "destination-db"}
        (with-routing-setup! [router-db [[destination-db "destination-db"]]]
          (execute-statement! router-db "ALTER TABLE \"my_database_name\" ADD COLUMN latitude DOUBLE")
          (execute-statement! router-db "ALTER TABLE \"my_database_name\" ADD COLUMN longitude DOUBLE")
          (sync/sync-database! router-db)
          (execute-statement! router-db "INSERT INTO \"my_database_name\" (str, latitude, longitude) VALUES ('router-data', -10, 10)")
          (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination-data')")
          (let [db-id        (u/the-id router-db)
                table-id     (t2/select-one-pk :model/Table :db_id db-id)
                field-id     (t2/select-one-pk :model/Field :table_id table-id :name "STR")
                lat-field-id (t2/select-one-pk :model/Field :table_id table-id :name "LATITUDE")
                lon-field-id (t2/select-one-pk :model/Field :table_id table-id :name "LONGITUDE")
                str-query    {:database db-id
                              :type     :query
                              :query    {:source-table table-id
                                         :fields       [[:field field-id nil]]}}
                public-uuids (zipmap [:card :pivot-card :param-card :tile-card :dashboard :document]
                                     (repeatedly #(str (random-uuid))))
                shared       (fn [k] {:public_uuid (public-uuids k), :made_public_by_id (mt/user->id :crowberto)})]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id              db-id
                                                    :user_attribute           "db_name"
                                                    :anonymous_access_granted granted?}
                           :model/Card card (merge (shared :card) {:dataset_query str-query})
                           ;; the pivot endpoints need an aggregation to pivot
                           :model/Card pivot-card (merge (shared :pivot-card)
                                                         {:dataset_query {:database db-id
                                                                          :type     :query
                                                                          :query    {:source-table table-id
                                                                                     :aggregation  [[:count]]
                                                                                     :breakout     [[:field field-id nil]]}}})
                           ;; the parameter-value endpoints need a parameter backed by a Field
                           :model/Card _param-card (merge (shared :param-card)
                                                          {:dataset_query
                                                           {:database db-id
                                                            :type     :native
                                                            :native   {:query         "SELECT count(*) FROM \"my_database_name\" WHERE {{str}}"
                                                                       :template-tags {"str" {:id           "_STR_"
                                                                                              :name         "str"
                                                                                              :display-name "Str"
                                                                                              :type         :dimension
                                                                                              :dimension    [:field field-id nil]
                                                                                              :widget-type  :string/=}}}}})
                           ;; the map-tile endpoints resolve their lat/lon refs against the card's own columns, so
                           ;; this one selects every column rather than just `str`
                           :model/Card tile-card (merge (shared :tile-card)
                                                        {:dataset_query {:database db-id
                                                                         :type     :query
                                                                         :query    {:source-table table-id}}})
                           :model/Dashboard dashboard (merge (shared :dashboard)
                                                             {:parameters [{:id   "_STR_"
                                                                            :name "Str"
                                                                            :slug "str"
                                                                            :type "string/="}]})
                           :model/DashboardCard dashcard {:dashboard_id       (u/the-id dashboard)
                                                          :card_id            (u/the-id card)
                                                          :parameter_mappings [{:parameter_id "_STR_"
                                                                                :card_id      (u/the-id card)
                                                                                :target       [:dimension [:field field-id nil]]}]}
                           :model/DashboardCard pivot-dashcard {:dashboard_id (u/the-id dashboard)
                                                                :card_id      (u/the-id pivot-card)}
                           :model/DashboardCard tile-dashcard {:dashboard_id (u/the-id dashboard)
                                                               :card_id      (u/the-id tile-card)}
                           :model/Document document (merge (shared :document)
                                                           {:name     "Routed Document"
                                                            :document (documents.test-util/text->prose-mirror-ast "placeholder")})
                           :model/Card document-card {:name          "Routed document card"
                                                      :document_id   (u/the-id document)
                                                      :dataset_query str-query}]
              (t2/update! :model/Document (u/the-id document)
                          {:document (documents.test-util/cards->prose-mirror-ast [(u/the-id document-card)])})
              (mt/with-temporary-setting-values [enable-public-sharing true]
                (f {:card-query          (str "public/card/" (public-uuids :card) "/query")
                    :card-csv            (str "public/card/" (public-uuids :card) "/query/csv")
                    :card-pivot          (str "public/pivot/card/" (public-uuids :pivot-card) "/query")
                    :card-param-values   (str "public/card/" (public-uuids :param-card) "/params/_STR_/values")
                    :card-param-search   (str "public/card/" (public-uuids :param-card) "/params/_STR_/search/router")
                    :card-param-remap    (str "public/card/" (public-uuids :param-card) "/params/_STR_/remapping?value=router-data")
                    :card-tile           (str "public/tiles/card/" (public-uuids :tile-card) "/1/1/1")
                    :dashcard-query      (format "public/dashboard/%s/dashcard/%d/card/%d"
                                                 (public-uuids :dashboard) (u/the-id dashcard) (u/the-id card))
                    :dashcard-csv        (format "public/dashboard/%s/dashcard/%d/card/%d/csv"
                                                 (public-uuids :dashboard) (u/the-id dashcard) (u/the-id card))
                    :dashcard-pivot      (format "public/pivot/dashboard/%s/dashcard/%d/card/%d"
                                                 (public-uuids :dashboard) (u/the-id pivot-dashcard) (u/the-id pivot-card))
                    :dash-param-values   (str "public/dashboard/" (public-uuids :dashboard) "/params/_STR_/values")
                    :dash-param-search   (str "public/dashboard/" (public-uuids :dashboard) "/params/_STR_/search/router")
                    :dash-param-remap    (str "public/dashboard/" (public-uuids :dashboard) "/params/_STR_/remapping?value=router-data")
                    :dash-tile           (format "public/tiles/dashboard/%s/dashcard/%d/card/%d/1/1/1"
                                                 (public-uuids :dashboard) (u/the-id tile-dashcard) (u/the-id tile-card))
                    :document-card-query (format "public/document/%s/card/%d" (public-uuids :document) (u/the-id document-card))
                    :document-card-csv   (format "public/document/%s/card/%d/csv" (public-uuids :document) (u/the-id document-card))
                    :lat-field           (json/encode [:field lat-field-id nil])
                    :lon-field           (json/encode [:field lon-field-id nil])})))))))))

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

(defn- png? [s]
  (= [\P \N \G] (drop 1 (take 4 s))))

(defn- router-data-only?
  "True when an export mentions the router database's row and not the destination's."
  [export]
  (and (str/includes? export "router-data")
       (not (str/includes? export "destination-data"))))

(defn- strings-in-rows
  "Every string cell in `response`'s rows. The pivot endpoints put the pivot-grouping column in different positions
  for cards and for dashcards, so these assertions read the `str` column out by type rather than by index."
  [response]
  (into #{} (comp (mapcat identity) (filter string?)) (mt/rows response)))

(def ^:private generic-query-failure
  "What the public-sharing layer returns in place of a query error: it replaces the text of any error type not marked
  safe for embeds, so a refusal is reported as a plain query failure."
  {:status "failed", :error "An error occurred while running the query.", :error_type "qp"})

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
         (is (router-data-only? (from-both identity :get 200 (:card-csv urls)))))
       (testing "GET /api/public/pivot/card/:uuid/query"
         (is (= #{"router-data"} (from-both strings-in-rows :get 202 (:card-pivot urls)))))
       (testing "GET /api/public/card/:uuid/params/:param-key/values"
         (is (=? {:values [["router-data"]], :has_more_values false}
                 (from-both identity :get 200 (:card-param-values urls)))))
       (testing "GET /api/public/card/:uuid/params/:param-key/search/:query"
         (is (=? {:values [["router-data"]]}
                 (from-both identity :get 200 (:card-param-search urls)))))
       (testing "GET /api/public/card/:uuid/params/:param-key/remapping"
         (is (= ["router-data"] (from-both identity :get 200 (:card-param-remap urls)))))
       (testing "GET /api/public/tiles/card/:uuid/:zoom/:x/:y"
         (is (true? (from-both png? :get 200 (:card-tile urls)
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
         (is (router-data-only? (from-both identity :post 200 (:dashcard-csv urls) {}))))
       (testing "GET /api/public/pivot/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id"
         (is (= #{"router-data"} (from-both strings-in-rows :get 202 (:dashcard-pivot urls)))))
       (testing "GET /api/public/dashboard/:uuid/params/:param-key/values"
         (is (=? {:values [["router-data"]], :has_more_values false}
                 (from-both identity :get 200 (:dash-param-values urls)))))
       (testing "GET /api/public/dashboard/:uuid/params/:param-key/search/:query"
         (is (=? {:values [["router-data"]]}
                 (from-both identity :get 200 (:dash-param-search urls)))))
       (testing "GET /api/public/dashboard/:uuid/params/:param-key/remapping"
         (is (= ["router-data"] (from-both identity :get 200 (:dash-param-remap urls)))))
       (testing "GET /api/public/tiles/dashboard/:uuid/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
         (is (true? (from-both png? :get 200 (:dash-tile urls)
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
         (is (router-data-only? (from-both identity :post 200 (:document-card-csv urls) {}))))))))

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
             (is (= generic-query-failure
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
