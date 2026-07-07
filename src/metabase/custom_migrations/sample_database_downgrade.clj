(ns metabase.custom-migrations.sample-database-downgrade
  "Liquibase custom migration that restores the H2 sample database on downgrade from a SQLite-sample
  version. The actual work lives in the `sample-data` module
  ([[metabase.sample-data.core/restore-h2-sample-database-on-downgrade!]]); this namespace is only the
  Liquibase glue, kept in the `migrations` module so it can depend on `sample-data` (which the low-level
  `app-db` module, where legacy custom migrations live, may not)."
  (:require
   [metabase.sample-data.core :as sample-data]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (liquibase Scope)
   (liquibase.change Change)
   (liquibase.change.custom CustomTaskChange CustomTaskRollback)
   (liquibase.exception ValidationErrors)
   (liquibase.util BooleanUtil)))

(set! *warn-on-reflection* true)

(defn- should-execute-change?
  "Whether a Liquibase rollback change should actually run. The rollback method is called twice - once
  to generate MDC data and once to make the change - and unlike forward changes Liquibase does not
  guard the first call, so we do it ourselves."
  []
  (BooleanUtil/isTrue (.get (Scope/getCurrentScope) Change/SHOULD_EXECUTE true)))

;; The H2 -> SQLite upgrade replacement is handled at startup in metabase.sample-data.impl, so the
;; forward migration is a no-op; only the rollback restores the H2 sample database.
(defrecord ^{:doc "Liquibase custom migration: on downgrade, swap the SQLite sample database back to H2."}
 RestoreH2SampleDatabaseOnDowngrade []
  CustomTaskChange
  (execute [_ _database]
    (log/info "No forward migration for RestoreH2SampleDatabaseOnDowngrade"))
  (getConfirmationMessage [_]
    "Custom migration: RestoreH2SampleDatabaseOnDowngrade")
  (setUp [_])
  (validate [_ _database]
    (ValidationErrors.))
  (setFileOpener [_ _resourceAccessor])

  CustomTaskRollback
  (rollback [_ _database]
    (t2/with-transaction [_conn]
      (when (should-execute-change?)
        (sample-data/restore-h2-sample-database-on-downgrade!)))))
