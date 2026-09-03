(ns metabase.audit-app.grants
  "Reconciliation of the audit-read role's `SELECT` grants with [[metabase.audit-app.purview/audit-view-names]].

  These grants cannot be a one-time provisioning step. Liquibase drops and recreates the `v_*` views on upgrade --
  18 of the 20 view files open with `DROP VIEW IF EXISTS`, and several migrations outside
  `resources/migrations/instance_analytics_views/` drop them too -- and Postgres destroys a view's grants along with
  the view. So they are re-established after migrations on every boot, which also means a view entering or leaving
  the purview takes effect with no operator action.

  Creating the role, and granting it `CONNECT` and schema `USAGE`, stays manual -- see
  `docs/installation-and-operation/configuring-application-database.md`. Only the per-view grants are managed here."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.purview :as purview]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private views-and-grants-sql
  ;; Read direct grants out of `relacl` rather than `information_schema.role_table_grants`, which shows only grants
  ;; the current user made or holds: a grant an operator made by hand would be invisible there, so every boot would
  ;; re-issue it and report a change that already existed. `aclexplode` also excludes privileges the role merely
  ;; inherits (via PUBLIC or role membership), which is right -- `REVOKE ... FROM <role>` cannot take those away, so
  ;; treating them as revocable would loop forever.
  (str "SELECT c.relname AS view_name,"
       "       EXISTS (SELECT 1 FROM aclexplode(c.relacl) a"
       "               WHERE a.privilege_type = 'SELECT' AND a.grantee = r.oid) AS granted"
       "  FROM pg_class c"
       "  JOIN pg_namespace n ON n.oid = c.relnamespace"
       " CROSS JOIN (SELECT oid FROM pg_roles WHERE rolname = ?) r"
       " WHERE n.nspname = current_schema() AND c.relkind = 'v'"))

(defn- views-and-grants
  "Every view in the app DB's current schema, as `{view-name granted?}`, where `granted?` is whether `role` holds a
  direct `SELECT` grant on it."
  [role]
  (into {}
        (map (juxt (comp u/lower-case-en :view_name) :granted))
        (t2/query [views-and-grants-sql role])))

(defn- reconciliation
  "What has to change for `role` to hold `SELECT` on exactly the purview.

  `views` is [[views-and-grants]]. Purview entries with no view behind them are skipped rather than failing the whole
  reconciliation -- `GRANT` on a missing object errors, and would take the other nineteen down with it.

  Revocation is scoped to the `v_` prefix on purpose: a stale grant on a view dropped from the purview is the silent
  leak this exists to close, while anything else the operator granted the role is their decision, not ours."
  [views]
  (let [present (set (filter purview/audit-view-names (keys views)))
        granted (set (for [[view granted?] views
                           :when (and granted? (str/starts-with? view "v_"))]
                       view))]
    {:grant  (set/difference present granted)
     :revoke (set/difference granted present)}))

(defn- grant-statement
  "One `GRANT`/`REVOKE` covering `views`, or `nil` when there is nothing to do. One statement rather than one per
  view, so a reconciliation either lands whole or not at all."
  [verb preposition role views]
  (when (seq views)
    (format "%s SELECT ON %s %s %s"
            verb
            (str/join ", " (map mdb/quote-for-application-db (sort views)))
            preposition
            (mdb/quote-for-application-db role))))

(defn- reconcile-postgres! [role]
  (if-not (seq (t2/query {:select [[[:inline 1] :one]] :from [:pg_roles] :where [:= :rolname role]}))
    (log/errorf (str "Audit-read role %s does not exist in the application database. Usage analytics queries will"
                     " fail until it is created -- see the application database documentation.")
                role)
    (let [{:keys [grant revoke] :as result} (reconciliation (views-and-grants role))]
      (doseq [statement [(grant-statement "GRANT" "TO" role grant)
                         (grant-statement "REVOKE" "FROM" role revoke)]
              :when statement]
        (t2/query statement))
      (when (or (seq grant) (seq revoke))
        (log/infof "Reconciled audit-read grants for %s: granted %s, revoked %s"
                   role (sort grant) (sort revoke)))
      result)))

(defn reconcile-audit-read-grants!
  "Bring `role`'s `SELECT` grants in line with the audit purview. Call after migrations and before anything queries
  the Audit DB. Returns `{:grant #{...} :revoke #{...}}` describing what changed, or `nil` when nothing was done.

  A failure here leaves usage analytics broken but the rest of Metabase working, so it logs and returns rather than
  aborting startup -- consistent with Metabase never having required an app-DB grant in order to boot."
  [role]
  (when role
    (if-not (= :postgres (mdb/db-type))
      ;; MySQL's `v_*` views are `SQL SECURITY INVOKER` (#45641), so a role granted only the views still cannot read
      ;; them, and H2 has no users at all. Granting on either would imply a containment that does not exist.
      (log/infof (str "Not reconciling audit-read grants for %s: grants scoped to the analytics views are only"
                      " enforceable on Postgres application databases.")
                 role)
      (try
        (reconcile-postgres! role)
        (catch Throwable e
          (log/errorf e (str "Could not reconcile audit-read grants for %s. Usage analytics queries will fail until"
                             " the role holds SELECT on the analytics views. Check that the application database"
                             " user owns those views.")
                      role))))))
