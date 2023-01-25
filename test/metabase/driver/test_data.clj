(ns metabase.driver.test-data
  "Code for converting EDN dataset definitions to dumps that can be into various databases, e.g. SQL, CSV, etc."
  (:require
   [metabase.driver :as driver]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.util.malli.schema :as ms]
   [metabase.models.field :as field]
   [metabase.util.malli :as mu]))

;;;; Malli schema

(def FieldBaseType
  "Malli schema for the `:base-type` in a [[FieldDefinition]]. Three options:

  1. A type keyword like `:type/Text`. This is translated to an appropriate native type by the driver test code,
     e.g. [[metabase.driver.sql.test-data/base-type->sql-type]]

  2. A raw native type string e.g. `\"text\"`

  2. A map of driver -> raw native type string e.g. `{:postgres \"text\"}`"
  [:or
   ms/FieldType
   [:map
    [:native ms/NonBlankString]]
   [:map
    [:natives
     [:map-of :keyword ms/NonBlankString]]]])

(def FieldDefinition
  [:map
   [:field-name        ms/NonBlankString]
   [:base-type         FieldBaseType]
   [:not-null?         {:optional true} [:maybe :boolean]]
   [:semantic-type     {:optional true} [:maybe ms/FieldSemanticType]]
   [:effective-type    {:optional true} [:maybe ms/FieldType]]
   [:coercion-strategy {:optional true} [:maybe ms/CoercionStrategy]]
   [:visibility-type   {:optional true} [:maybe (into [:enum] field/visibility-types)]]
   [:fk                {:optional true} [:maybe [:or :keyword ms/NonBlankString]]]
   [:field-comment     {:optional true} [:maybe ms/NonBlankString]]
   [:pk?               {:optional true} [:maybe :boolean]]])

(def TableDefinition
  [:and
   [:map
    [:table-name        ms/NonBlankString]
    [:field-definitions [:sequential {:min 1} FieldDefinition]]
    [:rows              [:sequential [:sequential any?]]] ; each row is a sequence of values
    [:table-comment     {:optional true} [:maybe ms/NonBlankString]]]
   #_[:fn
    {:error/fn (constantly "All rows must have the same number of values as the number of fields")}
    (fn [{:keys [field-definitions rows], :as _tabledef}]
      (let [num-fields (count field-definitions)]
        (every? (fn [row]
                  (= (count row) num-fields))
                rows)))]])

(def DatabaseDefinition
  [:map
   [:database-name     ms/NonBlankString]
   [:table-definitions [:sequential {:min 1} TableDefinition]]])

(def Step
  [:map
   [:type :keyword]])

;;;; dataset resolution

(mu/defn get-dataset :- DatabaseDefinition
  [dataset]
  (let [resolved (cond
                   (and (symbol? dataset)
                        (namespace dataset))
                   (data.impl/resolve-dataset-definition (symbol (namespace dataset)) (symbol (name dataset)))

                   (symbol? dataset)
                   (data.impl/resolve-dataset-definition 'metabase.test.data.dataset-definitions dataset)

                   :else dataset)]
    (tx/get-dataset-definition resolved)))

;;;; interface

(defmulti dataset-steps
  "Should dump a series of steps to drop old versions of the dataset as needed and initialize things like a database,
  e.g.

    [{:type :sql, :context :server, :sql [\"DROP DATABASE IF EXISTS my_database;\"]}
     {:type :sql, :context :server, :sql [\"CREATE DATABASE my_database;\"]}]"
  {:arglists '([driver dataset]), :added "0.46.0"}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

;;;; default impls

(def ^:dynamic *preview*
  "Whether to 'preview' the output and generate steps with just the first few rows for each table rather than ALL the
  rows. Good when developing stuff."
  false)
