(ns metabase.audit-app.purview
  "The audit purview -- the app-DB views the Audit DB may read.

  Audit content is served by querying the application database through a `metabase_database` row pinned to
  [[metabase.audit-app.impl/audit-db-id]]. The `v_*` views are the redaction boundary for that path: each projects an
  explicit column list, so `v_users` exposes no password hashes and `v_databases` no connection details. Restricting
  the audit path to this set is a privacy property, not a convenience."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]))

(def audit-view-names
  "Set of lower-cased view names in the audit purview."
  (edn/read-string (slurp (io/resource "metabase/audit_app/purview.edn"))))
