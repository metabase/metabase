(ns metabase.driver-api.core
  (:refer-clojure :exclude [replace compile require])
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.appearance.core :as appearance]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.database-routing.core :as database-routing]
   [metabase.events.core :as events]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.actions :as lib.schema.actions]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression.temporal :as lib.schema.expression.temporal]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.logger.core :as logger]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.debug :as qp.debug]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.middleware.wrap-value-literals :as qp.wrap-value-literals]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.query-processor.util :as qp.util]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.query-processor.util.relative-datetime :as qp.relative-datetime]
   [metabase.query-processor.util.transformations.nest-breakouts :as qp.util.transformations.nest-breakouts]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.secrets.core :as secrets]
   [metabase.settings.core :as setting]
   [metabase.sync.util :as sync-util]
   [metabase.system.core :as system]
   [metabase.upload.core :as upload]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]
   [metabase.warehouse-schema.models.table :as table]
   [potemkin :as p]))

#_{:clj-kondo/ignore [:deprecated-var]}
(p/import-vars
 actions/cached-value
 actions/incorrect-value-type
 actions/perform-action!*
 actions/violate-foreign-key-constraint
 actions/violate-not-null-constraint
 actions/violate-unique-constraint
 add/add-alias-info
 add/field-reference-mlv2
 annotate/aggregation-name
 annotate/base-type-inferer
 annotate/merged-column-info
 appearance/site-name
 classloader/the-classloader
 config/is-prod?
 config/is-test?
 config/local-process-uuid
 config/mb-app-id-string
 config/mb-version-and-process-identifier
 config/mb-version-info
 config/run-mode
 connection-pool/connection-pool-spec
 connection-pool/destroy-connection-pool!
 connection-pool/map->properties
 database-routing/check-allowed-access!
 events/publish-event!
 lib-be/start-of-week
 lib.field/json-field?
 lib.metadata.jvm/instance->metadata
 lib.metadata/database
 lib.metadata/field
 lib.metadata/fields
 lib.metadata/table
 lib.schema.common/instance-of-class
 lib.schema.temporal-bucketing/date-bucketing-units
 lib.types.isa/temporal?
 lib.util.match/match
 lib.util.match/match-one
 lib.util.match/replace
 lib.util/truncate-alias
 lib/->legacy-MBQL
 lib/query-from-legacy-inner-query
 limit/absolute-max-results
 limit/determine-query-max-rows
 logger/level-enabled?
 mbql.s/Join
 mbql.s/MBQLQuery
 mbql.u/aggregation-at-index
 mbql.u/assoc-field-options
 mbql.u/desugar-filter-clause
 mbql.u/dispatch-by-clause-name-or-class
 mbql.u/expression-with-name
 mbql.u/field-options
 mbql.u/is-clause?
 mbql.u/mbql-clause?
 mbql.u/negate-filter-clause
 mbql.u/normalize-token
 mbql.u/query->max-rows-limit
 mbql.u/query->source-table-id
 mbql.u/simplify-compound-filter
 mbql.u/unique-name-generator
 mbql.u/update-field-options
 mdb/clob->str
 mdb/data-source
 mdb/make-subname
 mdb/query-canceled-exception?
 mdb/spec
 mi/instance-of?
 nest-query/nest-expressions
 premium-features/is-hosted?
 qp.compile/compile
 qp.debug/debug>
 qp.i/*disable-qp-logging*
 qp.preprocess/preprocess
 qp.reducible/reducible-rows
 qp.relative-datetime/maybe-cacheable-relative-datetime-honeysql
 qp.setup/with-qp-setup
 qp.store/->legacy-metadata
 qp.store/cached
 qp.store/initialized?
 qp.store/metadata-provider
 qp.store/with-metadata-provider
 qp.timezone/report-timezone-id-if-supported
 qp.timezone/requested-timezone-id
 qp.timezone/results-timezone-id
 qp.timezone/system-timezone-id
 qp.util.transformations.nest-breakouts/finest-temporal-breakout-index
 qp.util.transformations.nest-breakouts/nest-breakouts-in-stages-with-window-aggregation
 qp.util/default-query->remark
 qp.util/query->remark
 qp.wrap-value-literals/unwrap-value-literal
 qp.wrap-value-literals/wrap-value-literals-in-mbql
 qp.writeback/execute-write-sql!
 qp/process-query
 schema.metadata-queries/add-required-filters-if-needed
 secrets/clean-secret-properties-from-details
 secrets/uploaded-base-64-prefix-pattern
 setting/defsetting
 sync-util/name-for-logging
 system/site-uuid
 upload/current-database)

(defn ^:deprecated current-user
  "Fetch the user making the request."
  []
  api/*current-user*)

(defn canceled-chan
  "If this channel is bount you can check if it has received a message
  to see if the query has been canceled."
  []
  qp.pipeline/*canceled-chan*)

#_{:clj-kondo/ignore [:missing-docstring]}
;; should use import-vars :rename once https://github.com/clj-kondo/clj-kondo/issues/2498 is fixed
(do
  (p/import-fn setting/get-value-of-type setting-get-value-of-type)
  (p/import-fn secrets/value-as-string secret-value-as-string)
  (p/import-fn secrets/value-as-file! secret-value-as-file!)
  (p/import-fn table/database table->database)

  (p/import-def qp.error-type/db qp.error-type.db)
  (p/import-def qp.error-type/driver qp.error-type.driver)
  (p/import-def qp.error-type/invalid-parameter qp.error-type.invalid-parameter)
  (p/import-def qp.error-type/invalid-query qp.error-type.invalid-query)
  (p/import-def qp.error-type/missing-required-parameter qp.error-type.missing-required-parameter)
  (p/import-def qp.error-type/qp qp.error-type.qp)
  (p/import-def qp.error-type/unsupported-feature qp.error-type.unsupported-feature))

(def schema.common.non-blank-string
  "::lib.schema.common/non-blank-string"
  ::lib.schema.common/non-blank-string)

(def schema.metadata.column
  "::lib.schema.metadata/column"
  ::lib.schema.metadata/column)

(def schema.metadata.database
  "::lib.schema.metadata/database"
  ::lib.schema.metadata/database)

(def schema.id.database
  "::lib.schema.id/database"
  ::lib.schema.id/database)

(def schema.id.table
  "::lib.schema.id/table"
  ::lib.schema.id/table)

(def schema.id.field
  "::lib.schema.id/field"
  ::lib.schema.id/field)

(def schema.actions.row
  "::lib.schema.actions/row"
  ::lib.schema.actions/row)

(def schema.expression.temporal.timezone-id
  "::lib.schema.expression.temporal/timezone-id"
  ::lib.schema.expression.temporal/timezone-id)

(def schema.temporal-bucketing.unit.date-time.truncate
  "::lib.schema.temporal-bucketing/unit.date-time.truncate"
  ::lib.schema.temporal-bucketing/unit.date-time.truncate)

(def schema.literal.string.datetime
  "::lib.schema.literal/string.datetime"
  ::lib.schema.literal/string.datetime)

(def schema.parameter.type
  "::lib.schema.parameter/type"
  ::lib.schema.parameter/type)

(def mbql.schema.DateTimeValue
  "::mbql.s/DateTimeValue"
  ::mbql.s/DateTimeValue)

(def mbql.schema.Aggregation
  "::mbql.s/Aggregation"
  ::mbql.s/Aggregation)

(def mbql.schema.OrderBy
  "::mbql.s/OrderBy"
  ::mbql.s/OrderBy)

(def mbql.schema.Query
  "::mbql.s/Query"
  ::mbql.s/Query)

(def mbql.schema.value
  "mbql.s/value"
  mbql.s/value)

(def mbql.schema.field
  "mbql.s/field"
  mbql.s/field)

(def mbql.schema.FieldOrExpressionDef
  "::mbql.s/FieldOrExpressionDef"
  ::mbql.s/FieldOrExpressionDef)

(def qp.add.source-table
  "::add/source-table"
  ::add/source-table)

(def qp.add.source-alias
  "::add/source-alias"
  ::add/source-alias)

(def qp.add.source
  "::add/source"
  ::add/source)

(def qp.add.alias
  "::add/alias -- use this to get the escaped alias for a join (instead of `:alias`)."
  ::add/alias)

(def qp.add.none
  "::add/none"
  ::add/none)

(def qp.add.nfc-path
  "::add/nfc-path"
  ::add/nfc-path)

(def qp.add.desired-alias
  "::add/desired-alias"
  ::add/desired-alias)

(def qp.util.transformations.nest-breakouts.externally-remapped-field
  ":metabase.query-processor.util.transformations.nest-breakouts/externally-remapped-field"
  ::qp.util.transformations.nest-breakouts/externally-remapped-field)
