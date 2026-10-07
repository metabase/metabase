(ns ^:mb/driver-tests metabase-enterprise.database-routing.embedding-test
  "Guest embeds and embed previews on a database with routing enabled answer from the router database when an admin has
  granted that database anonymous access, and refuse when they have not. Guest embedding and public sharing are the two
  anonymous surfaces, and the same grant gates both -- see
  [[metabase-enterprise.database-routing.public-sharing-test]], whose shape this namespace follows.

  `/api/embed` is wrapped in `+message-only-exceptions` rather than `+public-exceptions`, so the refusal's own message
  reaches the viewer rather than being replaced. That makes this the other half of the contract the refusal has to
  satisfy: the message an anonymous viewer gets names neither the database nor the setting, and only a signed-in one
  gets the diagnosis. `/api/preview_embed` is superuser-only, so its viewer always gets the diagnosis.

  See [[metabase-enterprise.database-routing.common]] for where that decision is made and why."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.test-util :as routing.tu]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.random :as u.random]))

(defn random-embedding-secret-key [] (u.random/secure-hex 32))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defn do-with-new-secret-key! [f]
  (binding [*secret-key* (random-embedding-secret-key)]
    (mt/with-temporary-setting-values [embedding-secret-key *secret-key*]
      (f))))

(defmacro with-new-secret-key! {:style/indent 0} [& body]
  `(do-with-new-secret-key! (fn [] ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key! {:style/indent 0} [& body]
  `(mt/with-temporary-setting-values [~'enable-embedding-static true
                                      ~'enable-embedding-interactive true]
     (with-new-secret-key!
       ~@body)))

(defn card-token [card-or-id & [additional-token-keys]]
  (sign (merge {:resource {:question (u/the-id card-or-id)}
                :params   {}}
               additional-token-keys)))

(defn dash-token [dash-or-id & [additional-token-keys]]
  (sign (merge {:resource {:dashboard (u/the-id dash-or-id)}
                :params   {}}
               additional-token-keys)))

(defn- do-with-embed-routing-setup!
  "Publishes guest embeds on the routed database [[routing.tu/do-with-routed-warehouse!]] stands up, whose
  anonymous-access grant is `granted?`, and calls `f` with a map of the URLs to visit plus the router database's
  `:db-name`, which a refusal names."
  [granted? f]
  (routing.tu/do-with-routed-warehouse!
   granted?
   (fn [{:keys [db-name str-dimension str-query pivot-query param-query tile-query lat-field lon-field]}]
     (let [embedded {:enable_embedding true}]
       (mt/with-temp [:model/Card card
                      (merge embedded {:dataset_query str-query})
                      :model/Card pivot-card
                      (merge embedded {:dataset_query pivot-query})
                      :model/Card param-card
                      (merge embedded {:dataset_query    param-query
                                       :embedding_params {:str "enabled"}})
                      :model/Card tile-card
                      (merge embedded {:dataset_query tile-query})
                      :model/Dashboard dashboard
                      (merge embedded {:embedding_params {:str "enabled"}
                                       :parameters      [{:id   "_STR_"
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
                      {:dashboard_id (u/the-id dashboard), :card_id (u/the-id tile-card)}]
         (with-embedding-enabled-and-new-secret-key!
           (let [card-tok  (card-token card)
                 pivot-tok (card-token pivot-card)
                 param-tok (card-token param-card)
                 tile-tok  (card-token tile-card)
                 dash-tok  (dash-token dashboard)
                 ;; preview tokens carry their own parameter whitelist and ignore `enable_embedding`
                 pv-card   (card-token card {:_embedding_params {}})
                 pv-dash   (dash-token dashboard {:_embedding_params {}})
                 dc-id     (u/the-id dashcard)
                 card-id   (u/the-id card)
                 pivot-dc  [(u/the-id pivot-dashcard) (u/the-id pivot-card)]
                 tile-dc   [(u/the-id tile-dashcard) (u/the-id tile-card)]]
             (f {:db-name            db-name
                 :card-query         (str "embed/card/" card-tok "/query")
                 :card-csv           (str "embed/card/" card-tok "/query/csv")
                 :card-pivot         (str "embed/pivot/card/" pivot-tok "/query")
                 :card-param-values  (str "embed/card/" param-tok "/params/_STR_/values")
                 :card-param-search  (str "embed/card/" param-tok "/params/_STR_/search/router")
                 :card-param-remap   (str "embed/card/" param-tok
                                          "/params/_STR_/remapping?value=router-data")
                 :card-tile          (str "embed/tiles/card/" tile-tok "/1/1/1")
                 :dashcard-query     (format "embed/dashboard/%s/dashcard/%d/card/%d"
                                             dash-tok dc-id card-id)
                 :dashcard-csv       (format "embed/dashboard/%s/dashcard/%d/card/%d/csv"
                                             dash-tok dc-id card-id)
                 :dashcard-pivot     (apply format "embed/pivot/dashboard/%s/dashcard/%d/card/%d"
                                            dash-tok pivot-dc)
                 :dash-param-values  (str "embed/dashboard/" dash-tok "/params/_STR_/values")
                 :dash-param-search  (str "embed/dashboard/" dash-tok "/params/_STR_/search/router")
                 :dash-param-remap   (str "embed/dashboard/" dash-tok
                                          "/params/_STR_/remapping?value=router-data")
                 :dash-tile          (apply format
                                            "embed/tiles/dashboard/%s/dashcard/%d/card/%d/1/1/1"
                                            dash-tok tile-dc)
                 :preview-card-query (str "preview_embed/card/" pv-card "/query")
                 :preview-dash-query (format "preview_embed/dashboard/%s/dashcard/%d/card/%d"
                                             pv-dash dc-id card-id)
                 :lat-field          lat-field
                 :lon-field          lon-field}))))))))

(defn- names?
  "True when an /api/embed response body contains `message`, whatever prefix the layer that caught the refusal added."
  [body message]
  (str/includes? (str body) message))

;;; --------------------------------------------- Grant in place ----------------------------------------------------

(deftest guest-embed-card-uses-router-database-test
  (testing "a guest-embedded question on a granted routed database answers from the router database, on every endpoint"
    (do-with-embed-routing-setup!
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
    (do-with-embed-routing-setup!
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

(deftest preview-embed-uses-router-database-test
  (testing "an embed preview on a granted routed database shows what the published embed shows: router-database data,
           not the previewing admin's own destination"
    (do-with-embed-routing-setup!
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
    (do-with-embed-routing-setup!
     true
     (fn [urls]
       (is (= [["router-data"]] (mt/rows (client/client :get 202 (:card-query urls))))
           "visited with no Metabase account")
       (is (= [["router-data"]] (mt/rows (mt/user-http-request :rasta :get 202 (:card-query urls))))
           "visited by a signed-in non-admin whose routing attribute points at a destination database")))))

;;; --------------------------------------------- Grant withheld ----------------------------------------------------

(deftest guest-embeds-refused-without-the-grant-test
  (testing "without the grant, the same guest-embed paths refuse rather than answering from any database"
    (do-with-embed-routing-setup!
     false
     (fn [urls]
       (testing "queries, exports and pivots fail"
         (doseq [[endpoint url & args] [[:card-query     (:card-query urls)]
                                        [:card-csv       (:card-csv urls)]
                                        [:card-pivot     (:card-pivot urls)]
                                        [:dashcard-query (:dashcard-query urls)]
                                        [:dashcard-csv   (:dashcard-csv urls)]
                                        [:dashcard-pivot (:dashcard-pivot urls)]]]
           (testing endpoint
             (is (= routing.tu/generic-query-failure
                    (-> (apply client/client :get url args)
                        (select-keys [:status :error :error_type :error_is_curated])))))))
       (testing "the remapping and map-tile endpoints refuse with a 400, carrying the refusal's own message"
         (doseq [[endpoint url & args] [[:card-param-remap  (:card-param-remap urls)]
                                        [:dash-param-values (:dash-param-values urls)]
                                        [:dash-param-search (:dash-param-search urls)]
                                        [:dash-param-remap  (:dash-param-remap urls)]
                                        [:card-tile         (:card-tile urls)
                                         :latField (:lat-field urls) :lonField (:lon-field urls)]
                                        [:dash-tile         (:dash-tile urls)
                                         :latField (:lat-field urls) :lonField (:lon-field urls)]]]
           (testing endpoint
             (let [body (apply client/client :get 400 url args)]
               (is (names? body routing.tu/anonymous-refusal-message) (pr-str body))
               (doseq [secret [(:db-name urls) "routing" "anonymous_access_granted"]]
                 (is (not (names? body secret))
                     (str (pr-str secret) " leaked in " (pr-str body)))))
             (let [body (apply mt/user-http-request :rasta :get 400 url args)]
               (is (names? body (routing.tu/viewer-refusal-message (:db-name urls))) (pr-str body))))))
       ;; `metabase.parameters.field/search-values-from-field-id` logs and returns `[]` when the underlying fetch
       ;; throws -- long-standing behaviour it shares with sandbox errors and warehouse timeouts -- so these two come
       ;; back empty instead of raising. No destination data reaches the viewer either way.
       (testing "the card parameter-value endpoints return no values"
         (doseq [[endpoint url] [[:card-param-values (:card-param-values urls)]
                                 [:card-param-search (:card-param-search urls)]]]
           (testing endpoint
             (is (=? {:values empty?} (client/client :get 200 url))))))
       (testing "a signed-in non-admin is refused too, and told what to change"
         (is (= (routing.tu/query-failure-for-viewer (:db-name urls))
                (-> (mt/user-http-request :rasta :get (:card-query urls))
                    (select-keys [:status :error :error_type :error_is_curated])))))))))

(deftest preview-embed-refused-without-the-grant-test
  (testing "an embed preview refuses too, so an admin previewing an ungranted routed database sees what the published
           embed will do rather than a preview that works and an embed that does not"
    (do-with-embed-routing-setup!
     false
     (fn [urls]
       ;; the preview endpoints share the public-sharing execution helpers, which replace the text of any error type
       ;; not marked safe for embeds -- but the refusal writes its own message for a signed-in viewer, and nobody but
       ;; a superuser can reach a preview, so the previewing admin is told which database and which setting rather
       ;; than being handed the generic failure an embedded stranger gets.
       (doseq [[endpoint url] [[:preview-card-query (:preview-card-query urls)]
                               [:preview-dash-query (:preview-dash-query urls)]]]
         (testing endpoint
           (is (= (routing.tu/query-failure-for-viewer (:db-name urls))
                  (-> (mt/user-http-request :crowberto :get url)
                      (select-keys [:status :error :error_type :error_is_curated]))))))))))

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
        (mt/with-temporary-setting-values [enable-embedding-static true]
          (testing "PUT /api/card/:id"
            (is (true? (:enable_embedding
                        (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card))
                                              {:enable_embedding true})))))
          (testing "PUT /api/dashboard/:id"
            (is (true? (:enable_embedding
                        (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dashboard))
                                              {:enable_embedding true}))))))))))
