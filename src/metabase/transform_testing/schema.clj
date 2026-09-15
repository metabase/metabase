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
  "A column of inline test data."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:name      ::lib.schema.common/non-blank-string]
   [:base_type ::lib.schema.common/base-type]])

(mr/def ::row
  "A row of inline test data, keyed by column name."
  (ms/string-keyed-map [:maybe [:or :boolean number? :string]]))

(mr/def ::sql-data
  "Test data returned by a SQL query run against the transform's source database."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:format {:decode/normalize lib.schema.common/normalize-keyword} [:= :sql]]
   [:sql    ::lib.schema.common/non-blank-string]])

(mr/def ::rows-data
  "Inline test data."
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
            [:name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]]
           ::sql-data]]
   [:rows [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]]
           ::rows-data]]])

(mr/def ::expectation.empty
  "An expectation that a SQL query over the transform output returns no rows."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :empty]]
   [:name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:sql  ::lib.schema.common/non-blank-string]])

(mr/def ::expectation
  "A check on the output of the transform under test."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)}
   [:equals ::expectation.equals]
   [:empty  ::expectation.empty]])

(mr/def ::inputs
  "The `:inputs` column of a TransformTest."
  [:sequential ::input])

(mr/def ::expectations
  "The `:expectations` column of a TransformTest."
  [:sequential ::expectation])

(mr/def ::transform-test
  "A TransformTest as selected from the app DB: every column of `:transform_test`."
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
  "What a user sends to create a TransformTest."
  [:map {:closed true}
   [:transform_id ::lib.schema.id/transform]
   [:name         ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       ::inputs]
   [:expectations ::expectations]])

(mr/def ::transform-test.update
  "What a user sends to update a TransformTest."
  [:map {:closed true}
   [:transform_id {:optional true} ::lib.schema.id/transform]
   [:name         {:optional true} ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       {:optional true} ::inputs]
   [:expectations {:optional true} ::expectations]])

(mr/def ::status
  "The outcome of a transform test run or of one of its expectations."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :passed :failed])

(mr/def ::run-result
  "The outcome of a transform test run."
  [:map {:closed true}
   [:status ::status]])
