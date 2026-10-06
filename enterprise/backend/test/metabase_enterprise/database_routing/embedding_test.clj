(ns ^:mb/driver-tests metabase-enterprise.database-routing.embedding-test
  "Guest embeds and embed previews on a database with routing enabled answer from the router database when an admin has
  granted that database anonymous access, and refuse when they have not. Guest embedding and public sharing are the two
  anonymous surfaces, and the same grant gates both -- see
  [[metabase-enterprise.database-routing.public-sharing-test]], whose shape this namespace follows.

  See [[metabase-enterprise.database-routing.common]] for where that decision is made and why."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.e2e-test :refer [execute-statement! with-routing-setup!]]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

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
  "Stands up a routed database whose anonymous-access grant is `granted?`, with guest embeds published on it, and calls
  `f` with a map of the URLs to visit.

  The router database's single row reads `router-data` and the destination's reads `destination-data`, so every
  assertion can tell which database answered. The latitude and longitude columns exist on the router database only: a
  map tile renders a PNG whether or not it found any points, so a tile query that reached the destination has to fail
  to be distinguishable from one that did not.

  Both the previewing admin and the signed-in non-admin carry a routing attribute pointing at the destination
  database, so anything that routed by the viewer rather than by the grant would show `destination-data`."
  [granted? f]
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes! :crowberto {"db_name" "destination-db"}
        (met/with-user-attributes! :rasta {"db_name" "destination-db"}
          (with-routing-setup! [router-db [[destination-db "destination-db"]]]
            (execute-statement! router-db "ALTER TABLE \"my_database_name\" ADD COLUMN latitude DOUBLE")
            (execute-statement! router-db "ALTER TABLE \"my_database_name\" ADD COLUMN longitude DOUBLE")
            (sync/sync-database! router-db)
            (execute-statement! router-db (str "INSERT INTO \"my_database_name\" (str, latitude, longitude) "
                                               "VALUES ('router-data', -10, 10)"))
            (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination-data')")
            (let [db-id         (u/the-id router-db)
                  table-id      (t2/select-one-pk :model/Table :db_id db-id)
                  field-id      (t2/select-one-pk :model/Field :table_id table-id :name "STR")
                  lat-field-id  (t2/select-one-pk :model/Field :table_id table-id :name "LATITUDE")
                  lon-field-id  (t2/select-one-pk :model/Field :table_id table-id :name "LONGITUDE")
                  str-dimension [:dimension [:field field-id nil]]
                  str-query     {:database db-id
                                 :type     :query
                                 :query    {:source-table table-id
                                            :fields       [[:field field-id nil]]}}
                  ;; the pivot endpoints need an aggregation to pivot
                  pivot-query   {:database db-id
                                 :type     :query
                                 :query    {:source-table table-id
                                            :aggregation  [[:count]]
                                            :breakout     [[:field field-id nil]]}}
                  ;; the parameter-value endpoints need a parameter backed by a Field
                  param-query   {:database db-id
                                 :type     :native
                                 :native   {:query         (str "SELECT count(*) FROM \"my_database_name\" "
                                                                "WHERE {{str}}")
                                            :template-tags {"str" {:id           "_STR_"
                                                                   :name         "str"
                                                                   :display-name "Str"
                                                                   :type         :dimension
                                                                   :dimension    [:field field-id nil]
                                                                   :widget-type  :string/=}}}}
                  ;; the map-tile endpoints resolve their lat/lon refs against the card's own columns, so this one
                  ;; selects every column rather than just `str`
                  tile-query    {:database db-id
                                 :type     :query
                                 :query    {:source-table table-id}}
                  embedded      {:enable_embedding true}]
              (mt/with-temp [:model/DatabaseRouter _ {:database_id              db-id
                                                      :user_attribute           "db_name"
                                                      :anonymous_access_granted granted?}
                             :model/Card card
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
                    (f {:card-query          (str "embed/card/" card-tok "/query")
                        :card-csv            (str "embed/card/" card-tok "/query/csv")
                        :card-pivot          (str "embed/pivot/card/" pivot-tok "/query")
                        :card-param-values   (str "embed/card/" param-tok "/params/_STR_/values")
                        :card-param-search   (str "embed/card/" param-tok "/params/_STR_/search/router")
                        :card-param-remap    (str "embed/card/" param-tok
                                                  "/params/_STR_/remapping?value=router-data")
                        :card-tile           (str "embed/tiles/card/" tile-tok "/1/1/1")
                        :dashcard-query      (format "embed/dashboard/%s/dashcard/%d/card/%d"
                                                     dash-tok dc-id card-id)
                        :dashcard-csv        (format "embed/dashboard/%s/dashcard/%d/card/%d/csv"
                                                     dash-tok dc-id card-id)
                        :dashcard-pivot      (apply format "embed/pivot/dashboard/%s/dashcard/%d/card/%d"
                                                    dash-tok pivot-dc)
                        :dash-param-values   (str "embed/dashboard/" dash-tok "/params/_STR_/values")
                        :dash-param-search   (str "embed/dashboard/" dash-tok "/params/_STR_/search/router")
                        :dash-param-remap    (str "embed/dashboard/" dash-tok
                                                  "/params/_STR_/remapping?value=router-data")
                        :dash-tile           (apply format
                                                    "embed/tiles/dashboard/%s/dashcard/%d/card/%d/1/1/1"
                                                    dash-tok tile-dc)
                        :preview-card-query  (str "preview_embed/card/" pv-card "/query")
                        :preview-dash-query  (format "preview_embed/dashboard/%s/dashcard/%d/card/%d"
                                                     pv-dash dc-id card-id)
                        :lat-field           (json/encode [:field lat-field-id nil])
                        :lon-field           (json/encode [:field lon-field-id nil])})))))))))))

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
  "What an embedded query failure looks like: the shared public-sharing execution helpers replace the text of any error
  type not marked safe for embeds, so a refusal is reported as a plain query failure."
  {:status "failed", :error "An error occurred while running the query.", :error_type "qp"})

(def ^:private refusal-message
  "The message [[metabase-enterprise.database-routing.common]] throws with when the grant is missing."
  "This database does not allow anonymous access.")

(defn- refused?
  "True when an /api/embed response body names the refusal. Unlike the public routes, the embedding routes return the
  message of a non-streaming error rather than replacing it, so that whoever is integrating the embed can see why it
  failed -- sometimes behind the prefix of the layer that caught it."
  [body]
  (str/includes? (str body) refusal-message))

;;; --------------------------------------------- Grant in place ----------------------------------------------------

(deftest guest-embed-card-uses-router-database-test
  (testing "a guest-embedded question on a granted routed database answers from the router database, on every endpoint"
    (do-with-embed-routing-setup!
     true
     (fn [urls]
       (testing "GET /api/embed/card/:token/query"
         (is (= [["router-data"]] (mt/rows (client/client :get 202 (:card-query urls))))))
       (testing "GET /api/embed/card/:token/query/:export-format"
         (is (router-data-only? (client/client :get 200 (:card-csv urls)))))
       (testing "GET /api/embed/pivot/card/:token/query"
         (is (= #{"router-data"} (strings-in-rows (client/client :get 202 (:card-pivot urls))))))
       (testing "GET /api/embed/card/:token/params/:param-key/values"
         (is (=? {:values [["router-data"]], :has_more_values false}
                 (client/client :get 200 (:card-param-values urls)))))
       (testing "GET /api/embed/card/:token/params/:param-key/search/:prefix"
         (is (=? {:values [["router-data"]]}
                 (client/client :get 200 (:card-param-search urls)))))
       (testing "GET /api/embed/card/:token/params/:param-key/remapping"
         (is (= ["router-data"] (client/client :get 200 (:card-param-remap urls)))))
       (testing "GET /api/embed/tiles/card/:token/:zoom/:x/:y"
         (is (png? (client/client :get 200 (:card-tile urls)
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
         (is (router-data-only? (client/client :get 200 (:dashcard-csv urls)))))
       (testing "GET /api/embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
         (is (= #{"router-data"} (strings-in-rows (client/client :get 202 (:dashcard-pivot urls))))))
       (testing "GET /api/embed/dashboard/:token/params/:param-key/values"
         (is (= {:values [["router-data"]], :has_more_values false}
                (client/client :get 200 (:dash-param-values urls)))))
       (testing "GET /api/embed/dashboard/:token/params/:param-key/search/:prefix"
         (is (=? {:values [["router-data"]]}
                 (client/client :get 200 (:dash-param-search urls)))))
       (testing "GET /api/embed/dashboard/:token/params/:param-key/remapping"
         (is (= ["router-data"] (client/client :get 200 (:dash-param-remap urls)))))
       (testing "GET /api/embed/tiles/dashboard/:token/dashcard/:dashcard-id/card/:card-id/:zoom/:x/:y"
         (is (png? (client/client :get 200 (:dash-tile urls)
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
             (is (= generic-query-failure
                    (-> (apply client/client :get url args)
                        (select-keys [:status :error :error_type])))))))
       (testing "the remapping and map-tile endpoints refuse with a 400"
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
               (is (refused? body) (pr-str body))))))
       ;; `metabase.parameters.field/search-values-from-field-id` logs and returns `[]` when the underlying fetch
       ;; throws -- long-standing behaviour it shares with sandbox errors and warehouse timeouts -- so these two come
       ;; back empty instead of raising. No destination data reaches the viewer either way.
       (testing "the card parameter-value endpoints return no values"
         (doseq [[endpoint url] [[:card-param-values (:card-param-values urls)]
                                 [:card-param-search (:card-param-search urls)]]]
           (testing endpoint
             (is (=? {:values empty?} (client/client :get 200 url))))))
       (testing "a signed-in non-admin is refused in the same way"
         (is (= generic-query-failure
                (-> (mt/user-http-request :rasta :get (:card-query urls))
                    (select-keys [:status :error :error_type])))))))))

(deftest preview-embed-refused-without-the-grant-test
  (testing "an embed preview refuses too, so an admin previewing an ungranted routed database sees what the published
           embed will do rather than a preview that works and an embed that does not"
    (do-with-embed-routing-setup!
     false
     (fn [urls]
       ;; the preview endpoints share the public-sharing execution helpers, which replace the text of any error type
       ;; not marked safe for embeds, so the previewing admin sees the same generic query failure the embedded viewer
       ;; would. The refusal names itself in the server log and in the message the parameter endpoints return.
       (testing "GET /api/preview_embed/card/:token/query"
         (is (= generic-query-failure
                (-> (mt/user-http-request :crowberto :get (:preview-card-query urls))
                    (select-keys [:status :error :error_type])))))
       (testing "GET /api/preview_embed/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
         (is (= generic-query-failure
                (-> (mt/user-http-request :crowberto :get (:preview-dash-query urls))
                    (select-keys [:status :error :error_type])))))))))

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
