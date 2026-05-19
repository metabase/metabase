(ns metabase-enterprise.serialization.dump-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.serialization.dump :as dump]))

(defn datastructure-node-types
  [coll]
  (let [types (atom #{})]
    (walk/postwalk
     (fn [n]
       (swap! types conj (type n))
       n)
     coll)
    (deref types)))

(def example-card
  {:source_card_id         "skoPT2xiuEcUV8vFkHE6S",
   :table_id               ["Internal Metabase Database" "public" "v_alerts"],
   :card_schema            23,
   :database_id            "Internal Metabase Database",
   :collection_id          "vG58R8k-QddHWA7_47umn",
   :query_type             :query,
   :name                   "Active alerts",
   :type                   :question,
   :creator_id             "crowberto@metabase.com",
   :dataset_query          {:lib/type :mbql/query,
                            :stages   [{:source-card "skoPT2xiuEcUV8vFkHE6S",
                                        :aggregation [[:count {}]],
                                        :filters     [[:=
                                                       {}
                                                       [:field
                                                        {:effective-type :type/Boolean, :base-type :type/Boolean}
                                                        ["Internal Metabase Database" "public" "v_alerts" "archived"]]
                                                       false]],
                                        :joins       [{:lib/type    :mbql/join,
                                                       :alias       "People - Creator",
                                                       :conditions  [[:=
                                                                      {}
                                                                      [:field
                                                                       {:effective-type :type/Integer, :base-type :type/Integer}
                                                                       ["Internal Metabase Database" "public" "v_alerts" "creator_id"]]
                                                                      [:field
                                                                       {:effective-type :type/Integer,
                                                                        :base-type      :type/Integer,
                                                                        :join-alias     "People - Creator"}
                                                                       ["Internal Metabase Database" "public" "v_users" "user_id"]]]],
                                                       :fields      :none,
                                                       :stages      [{:source-card "0wVIfjBJWclD0lKeABYYl", :lib/type :mbql.stage/mbql}],
                                                       :strategy    :left-join,
                                                       :lib/options {"lib/uuid" "dc61e51d-9dfd-4fa6-a096-f70665a7d988"}}],
                                        :lib/type    :mbql.stage/mbql}],
                            :database "Internal Metabase Database"},
   :parameter_mappings     [],
   :serdes/meta            [{:model "Card", :id "JPERH6xYVcj3m2Zw0YVY1", :label "active_alerts"}],
   :display                :scalar,
   :entity_id              "JPERH6xYVcj3m2Zw0YVY1",
   :visualization_settings {:table.cell_column "recipient_external", :table.pivot_column "name", :column_settings nil},
   :metabase_version       "v0.58.0-SNAPSHOT (86dcec8)",
   :parameters             [],
   :dashboard_id           "DHMhMa1FYxiyIgM7_xdgR",
   :created_at             "2023-06-15T01:56:06.29029Z"})

(def expected-yaml
  "name: Active alerts
entity_id: JPERH6xYVcj3m2Zw0YVY1
created_at: '2023-06-15T01:56:06.29029Z'
creator_id: crowberto@metabase.com
display: scalar
collection_id: vG58R8k-QddHWA7_47umn
query_type: query
database_id: Internal Metabase Database
table_id:
- Internal Metabase Database
- public
- v_alerts
parameters: []
parameter_mappings: []
dataset_query:
  database: Internal Metabase Database
  stages:
  - aggregation:
    - - count
      - {}
    filters:
    - - =
      - {}
      - - field
        - base-type: type/Boolean
          effective-type: type/Boolean
        - - Internal Metabase Database
          - public
          - v_alerts
          - archived
      - false
    joins:
    - alias: People - Creator
      conditions:
      - - =
        - {}
        - - field
          - base-type: type/Integer
            effective-type: type/Integer
          - - Internal Metabase Database
            - public
            - v_alerts
            - creator_id
        - - field
          - base-type: type/Integer
            effective-type: type/Integer
            join-alias: People - Creator
          - - Internal Metabase Database
            - public
            - v_users
            - user_id
      fields: none
      stages:
      - source-card: 0wVIfjBJWclD0lKeABYYl
        lib/type: mbql.stage/mbql
      strategy: left-join
      lib/options:
        lib/uuid: dc61e51d-9dfd-4fa6-a096-f70665a7d988
      lib/type: mbql/join
    source-card: skoPT2xiuEcUV8vFkHE6S
    lib/type: mbql.stage/mbql
  lib/type: mbql/query
visualization_settings:
  column_settings: null
  table.cell_column: recipient_external
  table.pivot_column: name
card_schema: 23
serdes/meta:
- id: JPERH6xYVcj3m2Zw0YVY1
  label: active_alerts
  model: Card
dashboard_id: DHMhMa1FYxiyIgM7_xdgR
metabase_version: v0.58.0-SNAPSHOT (86dcec8)
source_card_id: skoPT2xiuEcUV8vFkHE6S
type: question
")

(deftest serialization-deep-sort-test
  (testing "Sorting applies to all levels of nested data structures"
    (is (= #{clojure.lang.MapEntry
             java.lang.Boolean
             clojure.lang.PersistentVector
             clojure.lang.PersistentTreeMap                 ; Sorted maps, not unsorted maps
             java.lang.String
             clojure.lang.Keyword}
           (datastructure-node-types
            (dump/serialization-deep-sort
             [[:=
               {}
               [:field
                {:effective-type :type/Boolean, :base-type :type/Boolean}
                ["Internal Metabase Database" "public" "v_alerts" "archived"]]
               false]]
             [:Card :dataset_query :stages :filters]))))
    (is (= #{nil
             java.lang.Long
             clojure.lang.MapEntry
             java.lang.Boolean
             clojure.lang.PersistentVector
             clojure.lang.PersistentTreeMap                 ; Sorted maps, not unsorted maps
             java.lang.String
             clojure.lang.Keyword}
           (datastructure-node-types (dump/serialization-deep-sort example-card [:Card]))))
    (is (= (pr-str (dump/serialization-deep-sort example-card [:Card]))
           (pr-str (dump/serialization-deep-sort (dump/serialization-deep-sort example-card [:Card]) [:Card]))))
    (is (= expected-yaml (dump/yaml-content example-card)))))
