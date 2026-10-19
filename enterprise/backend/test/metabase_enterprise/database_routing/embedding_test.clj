(ns ^:mb/driver-tests metabase-enterprise.database-routing.embedding-test
  "Guest embeds and embed previews on a database with routing enabled answer from the router database when an admin has
  granted that database anonymous access, and refuse when they have not."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.test-util :as routing.tu]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]))

(defn- body-mentions?
  "True when an /api/embed response body contains `message`, whatever prefix the layer that caught the refusal added."
  [body message]
  (str/includes? (str body) message))

(defn- message-paths
  "The refused `/api/embed` paths that raise instead of failing as a query, as `[endpoint & request-args]`."
  [urls]
  [[:card-param-remap  (:card-param-remap urls)]
   [:card-source-values (:card-source-values urls)]
   [:dash-source-values (:dash-source-values urls)]
   [:dash-param-values (:dash-param-values urls)]
   [:dash-param-search (:dash-param-search urls)]
   [:dash-param-remap  (:dash-param-remap urls)]
   [:card-tile         (:card-tile urls) :latField (:lat-field urls) :lonField (:lon-field urls)]
   [:dash-tile         (:dash-tile urls) :latField (:lat-field urls) :lonField (:lon-field urls)]])

(def ^:private query-failure-keys
  [:status :error :error_type])

;;; --------------------------------------------- Grant in place ----------------------------------------------------

(deftest guest-embed-card-uses-router-database-test
  (testing "a guest-embedded question on a granted routed database answers from the router database, on every endpoint"
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
                                             :lonField (:lon-field urls)))))))))

(deftest guest-embed-dashboard-uses-router-database-test
  (testing "a guest-embedded dashboard on a granted routed database answers from the router database, on every endpoint"
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
                                             :lonField (:lon-field urls)))))))))

(deftest guest-embed-series-and-filter-value-lists-use-router-database-test
  (testing "the ways into the router database that are not a question on the page itself -- a question added to a
           dashboard card as a series, and a filter whose value list is drawn from a question -- answer from the
           router database too"
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
                 (client/client :get 200 (:card-source-values urls)))))))))

(deftest preview-embed-uses-router-database-test
  (testing "an embed preview on a granted routed database shows what the published embed shows: router-database data,
           not the previewing admin's own destination"
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
  (testing "one guest-embed URL serves the same data whether or not whoever opens it happens to be signed in: the
           decision is the database's grant, not the visitor"
    (routing.tu/do-with-embed-routing-setup!
     true
     (fn [urls]
       (is (= [["router-data"]] (mt/rows (client/client :get 202 (:card-query urls))))
           "visited with no Metabase account")
       (is (= [["router-data"]] (mt/rows (mt/user-http-request :rasta :get 202 (:card-query urls))))
           "visited by a signed-in non-admin whose routing attribute points at a destination database")))))

;;; --------------------------------------------- Grant withheld ----------------------------------------------------

(deftest guest-embeds-refused-without-the-grant-test
  (testing "without the grant, the same guest-embed paths refuse rather than answering from any database"
    (routing.tu/do-with-embed-routing-setup!
     false
     (fn [urls]
       (testing "queries, exports and pivots fail"
         (doseq [[endpoint url & args] [[:card-query     (:card-query urls)]
                                        [:card-csv       (:card-csv urls)]
                                        [:card-pivot     (:card-pivot urls)]
                                        [:dashcard-query (:dashcard-query urls)]
                                        [:dashcard-series (:dashcard-series urls)]
                                        [:dashcard-csv   (:dashcard-csv urls)]
                                        [:dashcard-pivot (:dashcard-pivot urls)]]]
           (testing endpoint
             (let [{:keys [response refused]} (routing.tu/call-recording-grant-refusals
                                               #(apply client/client :get url args))]
               (is (= routing.tu/generic-query-failure
                      (select-keys response query-failure-keys)))
               (is (= #{(:db-id urls)} refused))))))
       (testing "the remapping and map-tile endpoints refuse with a 400"
         (doseq [[endpoint url & args] (message-paths urls)]
           (testing endpoint
             (doseq [[requester request] [[:anonymous           (fn [& args] (apply client/client args))]
                                          [:signed-in-non-admin (fn [& args] (apply mt/user-http-request :rasta args))]]]
               (testing requester
                 (let [{body :response, :keys [refused]} (routing.tu/call-recording-grant-refusals
                                                          #(apply request :get 400 url args))]
                   (is (= #{(:db-id urls)} refused))
                   (is (body-mentions? body routing.tu/plain-refusal-message) (pr-str body))
                   (doseq [disclosure (routing.tu/configuration-disclosures (:db-name urls))]
                     (is (not (body-mentions? body disclosure))
                         (str (pr-str disclosure) " leaked in " (pr-str body))))))))))
       ;; `metabase.parameters.field/search-values-from-field-id` logs and returns `[]` when the fetch throws, so these
       ;; come back empty instead of raising.
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
           (is (= #{(:db-id urls)} refused))))))))

(deftest preview-embed-refused-without-the-grant-test
  (testing "an embed preview refuses too, so an admin previewing an ungranted routed database sees what the published
           embed will do rather than a preview that works and an embed that does not"
    (routing.tu/do-with-embed-routing-setup!
     false
     (fn [urls]
       ;; the preview endpoints share the public-sharing execution helpers, which replace the text of any error type
       ;; not marked safe for embeds, so the refusal arrives as a plain query failure here too.
       (doseq [[endpoint url] [[:preview-card-query (:preview-card-query urls)]
                               [:preview-dash-query (:preview-dash-query urls)]]]
         (testing endpoint
           (let [{:keys [response refused]} (routing.tu/call-recording-grant-refusals
                                             #(mt/user-http-request :crowberto :get url))]
             (is (= routing.tu/generic-query-failure
                    (select-keys response query-failure-keys)))
             (is (= #{(:db-id urls)} refused)))))))))

;;; ------------------------------------------ Publishing is not refused --------------------------------------------

(deftest publishing-a-guest-embed-is-not-refused-test
  (testing "publishing a guest embed on an ungranted routed database is deliberately allowed: unlike public-link
           creation, embed publishing is not validated against the grant, because the card and dashboard update path
           is heavily trafficked and the embed setup flow already warns about database routing"
    (mt/with-premium-features #{:database-routing}
      (mt/with-temp [:model/DatabaseRouter _ {:database_id              (mt/id)
                                              :user_attribute           "db_name"
                                              :anonymous_access_granted false}
                     :model/Card card {:database_id      (mt/id)
                                       :enable_embedding false}
                     :model/Dashboard dashboard {:enable_embedding false}]
        (mt/with-temporary-setting-values [enable-embedding-modular true]
          (testing "PUT /api/card/:id"
            (is (true? (:enable_embedding
                        (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card))
                                              {:enable_embedding true})))))
          (testing "PUT /api/dashboard/:id"
            (is (true? (:enable_embedding
                        (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dashboard))
                                              {:enable_embedding true}))))))))))
