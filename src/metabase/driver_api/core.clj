(ns metabase.driver-api.core
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.auth-provider.core :as auth-provider]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.middleware.wrap-value-literals :as qp.wrap-value-literals]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.query-processor.util :as qp.util]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.query-processor.util.relative-datetime :as qp.relative-datetime]
   [metabase.query-processor.util.transformations.nest-breakouts :as qp.util.transformations.nest-breakouts]
   [metabase.secrets.core :as secrets]
   [metabase.settings.core :as setting]
   [metabase.sync.util :as sync-util]
   [metabase.system.core :as system]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouses.core :as warehouses]
   [potemkin :as p]))

(p/import-vars
 annotate/aggregation-name
 annotate/base-type-inferer
 annotate/merged-column-info
 classloader/the-classloader
 config/is-test?
 config/is-dev?
 config/local-process-uuid
 config/mb-app-id-string
 config/mb-version-and-process-identifier
 config/mb-version-info
 config/run-mode
 connection-pool/map->properties
 lib.field/json-field?
 lib.metadata/database
 lib.metadata/field
 lib.metadata/fields
 lib.metadata/table
 lib.schema.temporal-bucketing/date-bucketing-units
 lib.types.isa/temporal?
 limit/absolute-max-results
 mbql.u/assoc-field-options
 mbql.u/update-field-options
 mbql.u/desugar-filter-clause
 mbql.u/is-clause?
 sync-util/name-for-logging
 mi/instance-of?
 mbql.u/query->max-rows-limit
 mbql.u/unique-name-generator
 mbql.u/dispatch-by-clause-name-or-class
 mdb/make-subname
 mdb/unique-identifier
 auth-provider/fetch-auth
 premium-features/is-hosted?
 qp/process-query
 qp.error-type/db
 qp.error-type/driver
 qp.error-type/invalid-query
 qp.error-type/qp
 qp.error-type/unsupported-feature
 qp.i/*disable-qp-logging*
 qp.pipeline/*canceled-chan*
 qp.reducible/reducible-rows
 qp.relative-datetime/maybe-cacheable-relative-datetime-honeysql
 qp.store/cached
 qp.store/initialized?
 qp.store/metadata-provider
 qp.store/with-metadata-provider
 qp.timezone/report-timezone-id-if-supported
 qp.timezone/requested-timezone-id
 qp.timezone/results-timezone-id
 qp.timezone/system-timezone-id
 qp.util.transformations.nest-breakouts/finest-temporal-breakout-index
 qp.util/default-query->remark
 qp.util/query->remark
 auth-provider/azure-auth-token-renew-slack-seconds
 qp.wrap-value-literals/wrap-value-literals-in-mbql
 secrets/clean-secret-properties-from-details
 system/site-uuid
 mbql.u/simplify-compound-filter
 mbql.u/negate-filter-clause
 lib.util.match/match-one
 lib.util.match/replace
 api/*current-user* ; very questionable
 premium-features/enable-database-auth-providers?
 warehouses/cloud-gateway-ips ; only in driver.common
 lib.schema.common/instance-of-class)

#_{:clj-kondo/ignore [:missing-docstring]}
;; should use import-vars :rename once https://github.com/clj-kondo/clj-kondo/issues/2498 is fixed
(do
  (p/import-fn setting/get-value-of-type setting-get-value-of-type)
  (p/import-fn secrets/value-as-string secret-value-as-string)
  (p/import-fn secrets/value-as-file! secret-value-as-file!)
  (p/import-fn table/database table->database))

(def schema.common.non-blank-string
  "::lib.schema.common/non-blank-string"
  ::lib.schema.common/non-blank-string)

(def schema.metadata.column
  "::lib.schema.metadata/column"
  ::lib.schema.metadata/column)

(def schema.id.database
  "::lib.schema.id/database"
  ::lib.schema.id/database)

(def schema.common.int-greater-than-or-equal-to-zero
  "::lib.schema.common/int-greater-than-or-equal-to-zero"
  ::lib.schema.common/int-greater-than-or-equal-to-zero)

(def schema.literal.string.datetime
  "::lib.schema.literal/string.datetime"
  ::lib.schema.literal/string.datetime)

(def qp.add.source-table
  "::add/source-table"
  ::add/source-table)

(def qp.add.source-alias
  "::add/source-alias"
  ::add/source-alias)

(def qp.add.source
  "::add/source"
  ::add/source)

(def qp.add.none
  "::add/none"
  ::add/none)

(def qp.add.desired-alias
  "::add/desired-alias"
  ::add/desired-alias)
