(ns metabase-enterprise.database-routing.test-util
  "Fixtures shared by the tests for the two anonymous surfaces -- public sharing and guest embedding. Both are gated by
  the same per-database anonymous-access grant, so both need the same routed warehouse underneath and the same way of
  telling which database answered.

  `with-routing-setup!` and `execute-statement!` are not here: they live in
  [[metabase-enterprise.database-routing.e2e-test]], which is where every other test in this module gets them."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.database-routing.e2e-test :refer [execute-statement! with-routing-setup!]]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn do-with-routed-warehouse!
  "Stands up a routed database whose anonymous-access grant is `granted?` and calls `f` with the ids and queries an
  anonymous-surface test needs in order to build its own objects and URLs:

    :db-id :table-id :field-id   the router database, its table, and its `str` column
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
                  table-id     (t2/select-one-pk :model/Table :db_id db-id)
                  field-id     (t2/select-one-pk :model/Field :table_id table-id :name "STR")
                  lat-field-id (t2/select-one-pk :model/Field :table_id table-id :name "LATITUDE")
                  lon-field-id (t2/select-one-pk :model/Field :table_id table-id :name "LONGITUDE")]
              (mt/with-temp [:model/DatabaseRouter _ {:database_id              db-id
                                                      :user_attribute           "db_name"
                                                      :anonymous_access_granted granted?}]
                (f {:db-id         db-id
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
