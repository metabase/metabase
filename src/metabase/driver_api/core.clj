(ns metabase.driver-api.core
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.types.isa :as lib.types.isa]
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
   [metabase.query-processor.util.relative-datetime :as qp.relative-datetime]
   [metabase.query-processor.util.transformations.nest-breakouts :as qp.util.transformations.nest-breakouts]
   [metabase.system.core :as system]
   [potemkin :as p]))

(p/import-vars
 annotate/aggregation-name
 annotate/base-type-inferer
 annotate/merged-column-info
 classloader/the-classloader
 config/is-test?
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
 mbql.u/desugar-filter-clause
 mbql.u/is-clause?
 mbql.u/query->max-rows-limit
 mbql.u/unique-name-generator
 mdb/make-subname
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
 qp.wrap-value-literals/wrap-value-literals-in-mbql
 system/site-uuid)

"

lib.util.match - kondo lint-as

 constants
 - qp.error-type
 - keywords like ::add/source ::add/source-table

 name conflicts
 - table/database lib.metadata/database

 secrets - lost context
 - secrets/value-as-string  vs driver/value-as-string

"
