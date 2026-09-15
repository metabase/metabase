(ns metabase.transform-testing.schema
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::table
  "A table read by the transform under test, by schema and name."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:schema {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:name   ::lib.schema.common/non-blank-string]])

(mr/def ::column
  "A column of inline test data, with its database native type."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:name      ::lib.schema.common/non-blank-string]
   [:database_type ::lib.schema.common/non-blank-string]])

(mr/def ::row
  "A row of inline test data, keyed by column name."
  (ms/string-keyed-map [:maybe [:or :boolean number? :string]]))

(mr/def ::sql-data
  "Test data returned by a SQL query run against the transform's source database."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:format {:decode/normalize lib.schema.common/normalize-keyword} [:= :sql]]
   [:sql    ::lib.schema.common/non-blank-string]])

(mr/def ::rows-data
  "Test data written out in the request: the columns, with the type each is cast to, and the rows."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:format  {:decode/normalize lib.schema.common/normalize-keyword} [:= :rows]]
   [:columns [:sequential {:min 1} ::column]]
   [:rows    [:sequential ::row]]])

(mr/def ::input
  "An input table of the transform under test, replaced with test data."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)}
   [:sql  [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::sql-data]]
   [:rows [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::rows-data]]])

(mr/def ::expectation.equals
  "An expectation that the transform output equals test data."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)}
   [:sql  [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::sql-data]]
   [:rows [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::rows-data]]])

(mr/def ::expectation.empty
  "An expectation that a SQL query over the transform output returns no rows."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :empty]]
   [:name ::lib.schema.common/non-blank-string]
   [:sql  ::lib.schema.common/non-blank-string]])

(mr/def ::expectation
  "A check on the output of the transform under test."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)}
   [:equals ::expectation.equals]
   [:empty  ::expectation.empty]])

(mr/def ::inputs
  "Test data for the tables the transform reads. Every table it reads needs one, and an input for
  a table it does not read is refused."
  [:sequential ::input])

(mr/def ::expectations
  "The checks run against the transform's output. Names must be unique within a test."
  [:sequential ::expectation])

(mr/def ::transform-test
  "A saved transform test: the transform it covers, the inputs that stand in for its source
  tables, and the expectations checked against its output."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:entity_id    :string]
   [:transform_id ::lib.schema.id/transform]
   [:creator_id   ::lib.schema.id/user]
   [:name         :string]
   [:description  [:maybe :string]]
   [:inputs       ::inputs]
   [:expectations ::expectations]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]])

(mr/def ::transform-test.create
  "What a client sends to create a transform test."
  [:map {:closed true}
   [:transform_id ::lib.schema.id/transform]
   [:name         ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       ::inputs]
   [:expectations ::expectations]])

(mr/def ::transform-test.update
  "What a client sends to update a transform test. Omitted fields are left unchanged."
  [:map {:closed true}
   [:transform_id {:optional true} ::lib.schema.id/transform]
   [:name         {:optional true} ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       {:optional true} ::inputs]
   [:expectations {:optional true} ::expectations]])

(mr/def ::status
  "The outcome of a transform test run, or of one of its expectations.

  `:error` is an expectation outcome only: that expectation's own query could not be run, while
  the rest of the run completed and still reported."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :passed :failed :error])

(mr/def ::expectation-result
  "What one expectation found. `:status` and the identifying keys are always present; the rest is
  whatever that expectation type has to say about a failure, so a new type adds its own keys
  without touching this schema."
  [:map
   [:name    :string]
   [:type    :keyword]
   [:status  ::status]
   [:columns {:optional true} [:sequential ::column]]
   [:error   {:optional true} [:map
                               [:type    :keyword]
                               [:message :string]]]])

(mr/def ::run-result
  "The outcome of a transform test run.

  `:tables` maps each temp table the run created to the table it stood in for."
  [:map {:closed true}
   [:status       ::status]
   [:expectations [:sequential ::expectation-result]]
   [:tables       [:map-of :string :string]]])

(mr/def ::connection
  "A connection from `driver/do-with-test-connection`: a JDBC connection, or the BigQuery client and session that stand
  in for one."
  [:or
   (ms/InstanceOfClass java.sql.Connection)
   [:map {:closed true}
    [:client     (ms/InstanceOfClass Object)]
    [:session-id :string]]])
