(ns metabase-enterprise.database-routing.test-util
  "Fixtures shared by the tests for the two anonymous surfaces -- public sharing and guest embedding. Both are gated by
  the same per-database anonymous-access grant, so both need the same routed warehouse underneath and the same way of
  telling which database answered.

  The guest-embed fixture below is here rather than beside its assertions because two namespaces drive the same
  requests: [[metabase-enterprise.database-routing.embedding-test]], which asserts what each endpoint does, and
  [[metabase-enterprise.database-routing.embedding-route-coverage-test]], which asserts that no endpoint was left out.
  Two copies could drift, and the second namespace's whole claim is that they have not.

  `with-routing-setup!` and `execute-statement!` are not here: they live in
  [[metabase-enterprise.database-routing.e2e-test]], which is where every other test in this module gets them."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [metabase-enterprise.database-routing.e2e-test :refer [execute-statement! with-routing-setup!]]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.permissions.core :as perms]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(defn do-with-routed-warehouse!
  "Stands up a routed database whose anonymous-access grant is `granted?` and calls `f` with the ids and queries an
  anonymous-surface test needs in order to build its own objects and URLs:

    :db-id :db-name              the router database and its name, which the refusal names
    :table-id :field-id          its table and its `str` column
    :str-dimension               a `:dimension` target for `str`, for parameter mappings
    :str-query                   a query returning `str`
    :pivot-query                 a query aggregating by `str`, for the pivot endpoints
    :param-query                 a native query with a Field-backed parameter, for the parameter endpoints
    :tile-query                  a query selecting every column, for the map-tile endpoints
    :lat-field :lon-field        JSON-encoded refs to pass the map-tile endpoints

  The router database's single row reads `router-data` and the destination's reads `destination-data`, so every
  assertion can tell which database answered. The latitude and longitude columns exist on the router database only: a
  map tile renders a PNG whether or not it found any points, so a tile query that reached the destination has to fail
  to be distinguishable from one that did not.

  Both the admin and the non-admin carry a routing attribute pointing at the destination database, so anything that
  routed by whoever is visiting rather than by the grant would answer `destination-data`."
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
                  lon-field-id (t2/select-one-pk :model/Field :table_id table-id :name "LONGITUDE")]
              (mt/with-temp [:model/DatabaseRouter _ {:database_id              db-id
                                                      :user_attribute           "db_name"
                                                      :anonymous_access_granted granted?}]
                (f {:db-id         db-id
                    :db-name       db-name
                    :table-id      table-id
                    :field-id      field-id
                    :str-dimension [:dimension [:field field-id nil]]
                    :str-query     {:database db-id
                                    :type     :query
                                    :query    {:source-table table-id
                                               :fields       [[:field field-id nil]]}}
                    :pivot-query   {:database db-id
                                    :type     :query
                                    :query    {:source-table table-id
                                               :aggregation  [[:count]]
                                               :breakout     [[:field field-id nil]]}}
                    :param-query   {:database db-id
                                    :type     :native
                                    :native   {:query         (str "SELECT count(*) FROM \"my_database_name\" "
                                                                   "WHERE {{str}}")
                                               :template-tags {"str" {:id           "_STR_"
                                                                      :name         "str"
                                                                      :display-name "Str"
                                                                      :type         :dimension
                                                                      :dimension    [:field field-id nil]
                                                                      :widget-type  :string/=}}}}
                    :tile-query    {:database db-id
                                    :type     :query
                                    :query    {:source-table table-id}}
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
  "Every string cell in `response`'s rows. The pivot endpoints put the pivot-grouping column in different positions
  for cards and for dashcards, so these assertions read the `str` column out by type rather than by index."
  [response]
  (into #{} (comp (mapcat identity) (filter string?)) (mt/rows response)))

(def generic-query-failure
  "What a refused query looks like to an anonymous viewer: the shared public-sharing execution helpers replace the text
  of any error type not marked safe for embeds, so the refusal is reported as a plain query failure."
  {:status "failed", :error "An error occurred while running the query.", :error_type "qp"})

(def plain-refusal-message
  "What the query-time refusal says to a viewer who may not manage the routed database, on the paths that return its
  message rather than replacing it."
  "This database does not allow anonymous access.")

(defn manager-refusal-message
  "What the query-time refusal says instead to a viewer who may manage the routed database `database-name`. See
  [[metabase-enterprise.database-routing.common/refuse-anonymous-access!]]."
  [database-name]
  (format (str "%s has database routing enabled and does not allow anonymous access, so a public link or guest embed"
               " on it returns no data.")
          database-name))

(defn query-failure-for-manager
  "[[generic-query-failure]] with [[manager-refusal-message]] in place of its message, marked curated."
  [database-name]
  (assoc generic-query-failure
         :error (manager-refusal-message database-name)
         :error_is_curated true))

(defn configuration-disclosures
  "The strings a refusal must never show a viewer who may not manage the router database `database-name`: the database
  itself, the feature, and the setting."
  [database-name]
  [database-name "routing" "anonymous_access_granted"])

(defn do-as-database-manager!
  "Give every user manage-database permission on the router database `db-id` and call `f`.

  Without `:advanced-permissions`, `current-user-can-write-db?` falls back to the open-source superuser check, so the
  grant would be a no-op and anything `f` asserts would pass on the superuser path instead."
  [db-id f]
  (mt/with-additional-premium-features #{:advanced-permissions}
    (perms/set-database-permission! (perms/all-users-group) db-id :perms/manage-database :yes)
    (f)))

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
  "Publishes guest embeds on the routed database [[do-with-routed-warehouse!]] stands up, whose anonymous-access grant
  is `granted?`, and calls `f` with a map of the URLs to visit plus the router database's `:db-id` and `:db-name`.

  There is one URL per `/api/embed` and `/api/preview_embed` endpoint that runs a warehouse query, plus
  `:card-metadata` and `:dash-metadata` for the two that do not, and `:card-source-values` / `:dash-source-values` /
  `:dashcard-series` for the ways into the router database that are not a question on the page itself."
  [granted? f]
  (do-with-routed-warehouse!
   granted?
   (fn [{:keys [db-id db-name field-id str-dimension str-query pivot-query param-query tile-query
                lat-field lon-field]}]
     (let [embedded    {:enable_embedding true}
           ;; a filter whose value list is drawn from another question rather than from a field. Nothing on the page
           ;; renders that question, so this is the one edge that reaches a database none of the page's own questions
           ;; need be saved against.
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
