(ns metabase.driver-api.core
  ;; missing docstring warnings are false positives because of Potemkin
  {:clj-kondo/config '{:linters {:missing-docstring {:level :off}}}}
  (:refer-clojure :exclude [replace compile])
  (:require
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.appearance.core :as appearance]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver-api.impl]
   [metabase.events.core :as events]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib-be.core :as lib-be]
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
   [metabase.query-processor.util.relative-datetime :as qp.relative-datetime]
   [metabase.query-processor.util.transformations.nest-breakouts :as qp.util.transformations.nest-breakouts]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.secrets.core :as secrets]
   [metabase.settings.core :as setting]
   [metabase.sync.util :as sync-util]
   [metabase.system.core :as system]
   [metabase.upload.core :as upload]
   [metabase.warehouse-schema.models.table :as table]
   [potemkin :as p]))

#_{:clj-kondo/ignore [:deprecated-var :discouraged-var]}
(p/import-vars
 actions/cached-database
 actions/cached-database-via-table-id
 actions/cached-table
 actions/cached-value
 actions/incorrect-value-type
 actions/perform-action!*
 actions/violate-check-constraint
 actions/violate-foreign-key-constraint
 actions/violate-not-null-constraint
 actions/violate-permission-constraint
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
 lib-be/instance->metadata
 lib.metadata/database
 lib.metadata/field
 lib.metadata/fields
 lib.metadata/active-fields
 lib.metadata/table
 lib.metadata/tables
 lib.metadata/transforms
 lib.schema.common/instance-of-class
 lib.schema.temporal-bucketing/date-bucketing-units
 lib.types.isa/temporal?
 lib.util.match/match
 lib.util.match/match-one
 lib.util.match/replace
 lib/truncate-alias
 lib/->legacy-MBQL
 lib/->metadata-provider
 lib/normalize
 lib/order-by-clause
 lib/query-from-legacy-inner-query
 lib/raw-native-query
 limit/absolute-max-results
 limit/determine-query-max-rows
 logger/level-enabled?
 mbql.u/aggregation-at-index
 mbql.u/assoc-field-options
 mbql.u/desugar-filter-clause
 mbql.u/expression-with-name
 mbql.u/field-options
 mbql.u/negate-filter-clause
 mbql.u/normalize-token
 mbql.u/query->max-rows-limit
 mbql.u/query->source-table-id
 mbql.u/simplify-compound-filter
 mbql.u/update-field-options
 mdb/clob->str
 mdb/data-source
 mdb/make-subname
 mdb/query-canceled-exception?
 mdb/spec
 metabase.driver-api.impl/cached
 metabase.driver-api.impl/dispatch-by-clause-name-or-class
 metabase.driver-api.impl/is-clause?
 metabase.driver-api.impl/mbql-clause?
 metabase.driver-api.impl/nest-expressions
 mi/instance-of?
 premium-features/is-hosted?
 qp.compile/compile
 qp.debug/debug>
 ;; TODO (Cam 8/19/25) -- importing dynamic vars doesn't really work because the copies here don't pick up changes to
 ;; the original value. We need to make these functions instead.
 qp.i/*disable-qp-logging*
 qp.preprocess/preprocess
 qp.reducible/reducible-rows
 qp.relative-datetime/maybe-cacheable-relative-datetime-honeysql
 qp.setup/with-qp-setup
 qp.store/->legacy-metadata
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
  "If this channel is bound you can check if it has received a message
  to see if the query has been canceled."
  []
  qp.pipeline/*canceled-chan*)
;; should use import-vars :rename once https://github.com/clj-kondo/clj-kondo/issues/2498 is fixed
(p/import-fn setting/get-value-of-type setting-get-value-of-type)
(p/import-fn secrets/value-as-string secret-value-as-string)
(p/import-fn secrets/value-as-file! secret-value-as-file!)
(p/import-fn table/database table->database)

(p/import-fn lib/unique-name-generator-with-options unique-name-generator)

(p/import-def qp.error-type/db qp.error-type.db)
(p/import-def qp.error-type/driver qp.error-type.driver)
(p/import-def qp.error-type/invalid-parameter qp.error-type.invalid-parameter)
(p/import-def qp.error-type/invalid-query qp.error-type.invalid-query)
(p/import-def qp.error-type/missing-required-parameter qp.error-type.missing-required-parameter)
(p/import-def qp.error-type/qp qp.error-type.qp)
(p/import-def qp.error-type/unsupported-feature qp.error-type.unsupported-feature)

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

(def schema.actions.args.row
  ":metabase.actions.args/row"
  :metabase.actions.args/row)

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
  ::mbql.s/value)

(def mbql.schema.field
  "mbql.s/field"
  ::mbql.s/field)

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

(def qp.compile.query-with-compiled-query
  "Schema for the output of [[compile]]: `:metabase.query-processor.compile/query-with-compiled-query`"
  ::qp.compile/query-with-compiled-query)

(def MBQLQuery
  "Schema for a legacy MBQL inner query."
  ::mbql.s/MBQLQuery)

(def Join
  "Schema for a legacy MBQL join."
  ::mbql.s/Join)
