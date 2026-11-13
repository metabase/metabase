(ns ^:mb/driver-tests metabase-enterprise.database-routing.embedding-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.test-util :as routing.tu]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(defn- message-paths
  "The `/api/embed` paths that raise instead of failing as a query."
  [urls]
  [[:card-param-remap   (:card-param-remap urls)]
   [:card-source-values (:card-source-values urls)]
   [:dash-source-values (:dash-source-values urls)]
   [:dash-param-values  (:dash-param-values urls)]
   [:dash-param-search  (:dash-param-search urls)]
   [:dash-param-remap   (:dash-param-remap urls)]
   [:card-tile          (:card-tile urls) :latField (:lat-field urls) :lonField (:lon-field urls)]
   [:dash-tile          (:dash-tile urls) :latField (:lat-field urls) :lonField (:lon-field urls)]])

(def ^:private query-failure-keys
  [:status :error :error_type])

(deftest guest-embed-card-uses-router-database-test
  (routing.tu/do-with-embed-routing-setup!
   true
   (fn [urls]
     (testing "GET /api/embed/card/:token/query"
       (is (= [["router-data"]] (mt/rows (client/client :get 202 (:card-query urls))))))
     (testing "GET /api/embed/card/:token/query/:export-format"
       (is (routing.tu/router-data-only? (client/client :get 200 (:card-csv urls)))))
     (testing "GET /api/embed/pivot/card/:token/query"
       (is (= #{"router-data"} (routing.tu/strings-in-rows (client/client :get 202 (:card-pivot urls))))))
     (testing "GET /api/embed/card/:token/params/:param-key/values"
       (is (=? {:values [["router-data"]], :has_more_values false}
               (client/client :get 200 (:card-param-values urls)))))
     (testing "GET /api/embed/card/:token/params/:param-key/search/:prefix"
       (is (=? {:values [["router-data"]]}
               (client/client :get 200 (:card-param-search urls)))))
     (testing "GET /api/embed/card/:token/params/:param-key/remapping"
       (is (= ["router-data"] (client/client :get 200 (:card-param-remap urls)))))
     (testing "GET /api/embed/tiles/card/:token/:zoom/:x/:y"
       (is (routing.tu/png? (client/client :get 200 (:card-tile urls)
                                           :latField (:lat-field urls)
                                           :lonField (:lon-field urls))))))))

(deftest guest-embed-dashboard-uses-router-database-test
  (routing.tu/do-with-embed-routing-setup!
   true
   (fn [urls]
     (testing "GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
       (is (= [["router-data"]] (mt/rows (client/client :get 202 (:dashcard-query urls))))))
     (testing "GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:export-format"
       (is (routing.tu/router-data-only? (client/client :get 200 (:dashcard-csv urls)))))
     (testing "GET /api/embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
       (is (= #{"router-data"} (routing.tu/strings-in-rows (client/client :get 202 (:dashcard-pivot urls))))))
     (testing "GET /api/embed/dashboard/:token/params/:param-key/values"
       (is (= {:values [["router-data"]], :has_more_values false}
              (client/client :get 200 (:dash-param-values urls)))))
     (testing "GET /api/embed/dashboard/:token/params/:param-key/search/:prefix"
       (is (=? {:values [["router-data"]]}
               (client/client :get 200 (:dash-param-search urls)))))
     (testing "GET /api/embed/dashboard/:token/params/:param-key/remapping"
       (is (= ["router-data"] (client/client :get 200 (:dash-param-remap urls)))))
     (testing "GET /api/embed/tiles/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
       (is (routing.tu/png? (client/client :get 200 (:dash-tile urls)
                                           :latField (:lat-field urls)
                                           :lonField (:lon-field urls))))))))

(deftest guest-embed-series-and-filter-value-lists-use-router-database-test
  (routing.tu/do-with-embed-routing-setup!
   true
   (fn [urls]
     (testing "GET /api/embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id, for a series card"
       (is (= [["router-data"]] (mt/rows (client/client :get 202 (:dashcard-series urls))))))
     (testing "GET /api/embed/dashboard/:token/params/:param-key/values, drawn from a question"
       (is (=? {:values [["router-data"]], :has_more_values false}
               (client/client :get 200 (:dash-source-values urls)))))
     (testing "GET /api/embed/card/:token/params/:param-key/values, drawn from a question"
       (is (=? {:values [["router-data"]], :has_more_values false}
               (client/client :get 200 (:card-source-values urls))))))))

(deftest preview-embed-uses-router-database-test
  (testing "a preview shows router data, not the previewing admin's own destination"
    (routing.tu/do-with-embed-routing-setup!
     true
     (fn [urls]
       (testing "GET /api/preview_embed/card/:token/query"
         (is (= [["router-data"]]
                (mt/rows (mt/user-http-request :crowberto :get 202 (:preview-card-query urls))))))
       (testing "GET /api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
         (is (= [["router-data"]]
                (mt/rows (mt/user-http-request :crowberto :get 202 (:preview-dash-query urls))))))))))

(deftest guest-embed-ignores-the-viewer-test
  (routing.tu/do-with-embed-routing-setup!
   true
   (fn [urls]
     (is (= [["router-data"]] (mt/rows (client/client :get 202 (:card-query urls))))
         "visited with no Metabase account")
     (is (= [["router-data"]] (mt/rows (mt/user-http-request :rasta :get 202 (:card-query urls))))
         "visited by a signed-in non-admin routed to a destination"))))

(deftest guest-embeds-refused-without-the-grant-test
  (routing.tu/do-with-embed-routing-setup!
   false
   (fn [urls]
     (testing "queries, exports and pivots fail"
       (doseq [[endpoint url & args] [[:card-query      (:card-query urls)]
                                      [:card-csv        (:card-csv urls)]
                                      [:card-pivot      (:card-pivot urls)]
                                      [:dashcard-query  (:dashcard-query urls)]
                                      [:dashcard-series (:dashcard-series urls)]
                                      [:dashcard-csv    (:dashcard-csv urls)]
                                      [:dashcard-pivot  (:dashcard-pivot urls)]]]
         (testing endpoint
           (let [{:keys [response refused]} (routing.tu/call-recording-grant-refusals
                                             #(apply client/client :get url args))]
             (is (= routing.tu/generic-query-failure
                    (select-keys response query-failure-keys)))
             (is (= #{(:db-id urls)} refused))))))
     (testing "the endpoints that raise refuse with a 400"
       (doseq [[endpoint url & args] (message-paths urls)]
         (testing endpoint
           (is (= #{(:db-id urls)}
                  (:refused (routing.tu/call-recording-grant-refusals
                             #(apply client/client :get 400 url args))))))))
     ;; `search-values` swallows the error and returns `[]`
     (testing "the card parameter-value endpoints return no values"
       (doseq [[endpoint url] [[:card-param-values (:card-param-values urls)]
                               [:card-param-search (:card-param-search urls)]]]
         (testing endpoint
           (let [{:keys [response refused]} (routing.tu/call-recording-grant-refusals
                                             #(client/client :get 200 url))]
             (is (=? {:values empty?} response))
             (is (= #{(:db-id urls)} refused))))))
     (testing "a signed-in non-admin is refused in the same way"
       (let [{:keys [response refused]} (routing.tu/call-recording-grant-refusals
                                         #(mt/user-http-request :rasta :get (:card-query urls)))]
         (is (= routing.tu/generic-query-failure
                (select-keys response query-failure-keys)))
         (is (= #{(:db-id urls)} refused)))))))

(deftest preview-embed-refused-without-the-grant-test
  (routing.tu/do-with-embed-routing-setup!
   false
   (fn [urls]
     (testing "queries fail"
       (doseq [[endpoint url] [[:preview-card-query (:preview-card-query urls)]
                               [:preview-dash-query (:preview-dash-query urls)]]]
         (testing endpoint
           (let [{:keys [response refused]} (routing.tu/call-recording-grant-refusals
                                             #(mt/user-http-request :crowberto :get url))]
             (is (= routing.tu/generic-query-failure
                    (select-keys response query-failure-keys)))
             (is (= #{(:db-id urls)} refused))))))
     ;; unlike /api/embed, this mount does not turn an uncaught exception into a 400
     (testing "the endpoints that raise"
       (doseq [[endpoint status url & args] [[:preview-dash-param-values 500 (:preview-dash-param-values urls)]
                                             [:preview-card-tile 400 (:preview-card-tile urls)
                                              :latField (:lat-field urls) :lonField (:lon-field urls)]]]
         (testing endpoint
           (is (= #{(:db-id urls)}
                  (:refused (routing.tu/call-recording-grant-refusals
                             #(apply mt/user-http-request :crowberto :get status url args)))))))))))

(deftest metadata-answers-without-the-grant-test
  (routing.tu/do-with-embed-routing-setup!
   false
   (fn [urls]
     (doseq [k [:card-metadata :dash-metadata]]
       (testing k
         (is (map? (client/client :get 200 (k urls))))))
     (doseq [k [:preview-card-metadata :preview-dash-metadata]]
       (testing k
         (is (map? (mt/user-http-request :crowberto :get 200 (k urls)))))))))
