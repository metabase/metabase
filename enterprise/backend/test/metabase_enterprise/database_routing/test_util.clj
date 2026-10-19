(ns metabase-enterprise.database-routing.test-util
  "Fixtures shared by the tests for public sharing and guest embedding on a routed database."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [metabase-enterprise.database-routing.common :as common]
   [metabase-enterprise.database-routing.e2e-test :refer [execute-statement! with-routing-setup!]]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(defn do-with-routed-warehouse!
  "Stands up a routed database whose anonymous-access grant is `granted?` and calls `f` with the ids and queries a test
  needs. The router database's row reads `router-data` and the destination's reads `destination-data`."
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
            (let [db-id        (u/the-id router-db)
                  db-name      (:name router-db)
                  table-id     (t2/select-one-pk :model/Table :db_id db-id)
                  field-id     (t2/select-one-pk :model/Field :table_id table-id :name "STR")
                  lat-field-id (t2/select-one-pk :model/Field :table_id table-id :name "LATITUDE")
                  lon-field-id (t2/select-one-pk :model/Field :table_id table-id :name "LONGITUDE")
                  mp           (lib.metadata.jvm/application-database-metadata-provider db-id)
                  table        (lib.metadata/table mp table-id)
                  str-field    (lib.metadata/field mp field-id)]
              (mt/with-temp [:model/DatabaseRouter _ {:database_id              db-id
                                                      :user_attribute           "db_name"
                                                      :anonymous_access_granted granted?}]
                (f {:db-id         db-id
                    :db-name       db-name
                    :table-id      table-id
                    :field-id      field-id
                    :str-dimension [:dimension [:field field-id nil]]
                    :str-query     (-> (lib/query mp table)
                                       (lib/with-fields [str-field]))
                    :pivot-query   (-> (lib/query mp table)
                                       (lib/aggregate (lib/count))
                                       (lib/breakout str-field))
                    :param-query   (-> (lib/native-query mp (str "SELECT count(*) FROM \"my_database_name\" "
                                                                 "WHERE {{str}}"))
                                       (lib/with-template-tags {"str" {:id           "_STR_"
                                                                       :name         "str"
                                                                       :display-name "Str"
                                                                       :type         :dimension
                                                                       :dimension    (lib/ref str-field)
                                                                       :widget-type  :string/=}}))
                    :tile-query    (lib/query mp table)
                    :lat-field     (json/encode [:field lat-field-id nil])
                    :lon-field     (json/encode [:field lon-field-id nil])})))))))))

(defn png?
  "True when `s` is the body of a rendered map tile."
  [s]
  (= [\P \N \G] (drop 1 (take 4 s))))

(defn router-data-only?
  "True when an export mentions the router database's row and not the destination's."
  [export]
  (and (str/includes? export "router-data")
       (not (str/includes? export "destination-data"))))

(defn strings-in-rows
  "Every string cell in `response`'s rows."
  [response]
  (into #{} (comp (mapcat identity) (filter string?)) (mt/rows response)))

(def generic-query-failure
  "What a refused query looks like to an anonymous viewer."
  {:status "failed", :error "An error occurred while running the query.", :error_type "qp"})

(defn call-recording-grant-refusals
  "Call `thunk`, and return its result as `:response` along with `:refused`, the set of router database ids refused for
  lacking the anonymous-access grant while it ran."
  [thunk]
  (let [refused  (atom #{})
        resolve* (mt/original-fn #'common/router-db-or-id->destination-db-id*)]
    (mt/with-dynamic-fn-redefs [common/router-db-or-id->destination-db-id*
                                (fn [& args]
                                  (try
                                    (apply resolve* args)
                                    (catch clojure.lang.ExceptionInfo e
                                      (let [{:keys [anonymous-access-not-granted router-database-id]} (ex-data e)]
                                        (when anonymous-access-not-granted
                                          (swap! refused conj router-database-id)))
                                      (throw e))))]
      {:response (thunk)
       :refused  @refused})))

(def plain-refusal-message
  "What the query-time refusal says on the paths that return its message rather than replacing it."
  "This database does not allow anonymous access.")

(defn configuration-disclosures
  "The strings a refusal must never show a viewer of the router database `database-name`: the database itself, the
  feature, and the setting."
  [database-name]
  [database-name "routing" "anonymous_access_granted"])

;;; ------------------------------------------------ Guest embedding -------------------------------------------------

(defn- do-with-guest-embedding-enabled!
  "Switch guest embedding on site-wide behind a fresh `embedding-secret-key`, and call `f` with that key."
  [f]
  (let [secret-key (u.random/secure-hex 32)]
    (mt/with-temporary-setting-values [enable-embedding-modular     true
                                       enable-embedding-interactive true
                                       embedding-secret-key         secret-key]
      (f secret-key))))

(defn do-with-embed-routing-setup!
  "Publishes guest embeds on a routed database whose anonymous-access grant is `granted?`, and calls `f` with a map of
  the URLs to visit plus the router database's `:db-id` and `:db-name`."
  [granted? f]
  (do-with-routed-warehouse!
   granted?
   (fn [{:keys [db-id db-name field-id str-dimension str-query pivot-query param-query tile-query
                lat-field lon-field]}]
     (let [embedded    {:enable_embedding true}
           card-source (fn [source-card]
                         {:id                   "_SRC_"
                          :name                 "Src"
                          :slug                 "src"
                          :type                 "string/="
                          :values_source_type   "card"
                          :values_source_config {:card_id     (u/the-id source-card)
                                                 :value_field [:field field-id nil]}})]
       (mt/with-temp [:model/Card card
                      (merge embedded {:dataset_query str-query})
                      :model/Card pivot-card
                      (merge embedded {:dataset_query pivot-query})
                      :model/Card param-card
                      (merge embedded {:dataset_query    param-query
                                       :embedding_params {:str "enabled"}})
                      :model/Card tile-card
                      (merge embedded {:dataset_query tile-query})
                      :model/Card series-card
                      {:dataset_query str-query}
                      :model/Card source-card
                      {:dataset_query str-query}
                      :model/Card card-source-card
                      (merge embedded {:dataset_query    str-query
                                       :embedding_params {:src "enabled"}
                                       :parameters       [(card-source source-card)]})
                      :model/Dashboard dashboard
                      (merge embedded {:embedding_params {:str "enabled", :src "enabled"}
                                       :parameters      [{:id   "_STR_"
                                                          :name "Str"
                                                          :slug "str"
                                                          :type "string/="}
                                                         (card-source source-card)]})
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
                      :model/DashboardCardSeries _
                      {:dashboardcard_id (u/the-id dashcard)
                       :card_id          (u/the-id series-card)
                       :position         0}]
         (do-with-guest-embedding-enabled!
          (fn [secret-key]
            (letfn [(token [resource additional-claims]
                      (jwt/sign (merge {:resource resource, :params {}} additional-claims) secret-key))
                    (card-token [card-or-id & [additional-claims]]
                      (token {:question (u/the-id card-or-id)} additional-claims))
                    (dash-token [dash-or-id & [additional-claims]]
                      (token {:dashboard (u/the-id dash-or-id)} additional-claims))]
              (let [card-tok   (card-token card)
                    pivot-tok  (card-token pivot-card)
                    param-tok  (card-token param-card)
                    source-tok (card-token card-source-card)
                    series-id  (u/the-id series-card)
                    tile-tok  (card-token tile-card)
                    dash-tok  (dash-token dashboard)
                    ;; preview tokens carry their own parameter whitelist and ignore `enable_embedding`
                    pv-card   (card-token card {:_embedding_params {}})
                    pv-dash   (dash-token dashboard {:_embedding_params {}})
                    dc-id     (u/the-id dashcard)
                    card-id   (u/the-id card)
                    pivot-dc  [(u/the-id pivot-dashcard) (u/the-id pivot-card)]
                    tile-dc   [(u/the-id tile-dashcard) (u/the-id tile-card)]]
                (f {:db-id              db-id
                    :db-name            db-name
                    :card-metadata      (str "embed/card/" card-tok)
                    :dash-metadata      (str "embed/dashboard/" dash-tok)
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
                    :dashcard-series    (format "embed/dashboard/%s/dashcard/%d/card/%d"
                                                dash-tok dc-id series-id)
                    :card-source-values (str "embed/card/" source-tok "/params/_SRC_/values")
                    :dash-source-values (str "embed/dashboard/" dash-tok "/params/_SRC_/values")
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
                    :lon-field          lon-field}))))))))))
