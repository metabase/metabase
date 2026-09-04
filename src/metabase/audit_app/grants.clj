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
   [metabase.audit-app.db :as audit-app.db]
   [metabase.audit-app.purview :as purview]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- reconciliation
  "What has to change for `role` to hold `SELECT` on exactly the purview, given
  [[metabase.audit-app.db/views-and-select-grants]] rows.

  Purview entries with no view behind them are skipped rather than failing the whole reconciliation -- `GRANT` on a
  missing object errors, and would take the other nineteen down with it.

  Revocation is scoped to the `v_` prefix on purpose: a stale grant on a view dropped from the purview is the silent
  leak this exists to close, while anything else the operator granted the role is their decision, not ours."
  [rows]
  (let [views   (into {} (map (juxt (comp u/lower-case-en :view_name) :granted)) rows)
        present (set (filter purview/audit-view-names (keys views)))
        granted (set (for [[view granted?] views
                           :when (and granted? (str/starts-with? view "v_"))]
                       view))]
    {:grant  (set/difference present granted)
     :revoke (set/difference granted present)}))

(defn- reconcile-postgres! [role]
  (if-not (audit-app.db/role-exists? role)
    (log/errorf (str "Audit-read role %s does not exist in the application database. Usage analytics queries will"
                     " fail until it is created -- see the application database documentation.")
                role)
    (let [{:keys [grant revoke] :as result} (reconciliation (audit-app.db/views-and-select-grants role))]
      (when (seq grant)
        (audit-app.db/grant-select-on-views! role grant))
      (when (seq revoke)
        (audit-app.db/revoke-select-on-views! role revoke))
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
