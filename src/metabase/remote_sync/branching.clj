(ns metabase.remote-sync.branching
  "OSS surface for content branching.

   Every branchable (git-synced) entity row carries a `branch` column: NULL for
   content not under git sync, the git branch name otherwise. The same entity —
   identified by its `entity_id`, THE identity across branches — can be
   materialized as one row per branch, each with its own numeric id. Numeric ids
   are branch-local and never remapped; serdes rewrites all numeric references
   through entity_ids when a branch is materialized, so content on a branch
   references branch rows natively.

   A user checks out a branch (`core_user.branch`); [[current-branch]] resolves
   the branch context for a request (explicit sync-operation binding, then the
   user's checkout, then the instance's global sync branch). Entity queries
   filter with [[branch-filter-clause]] / [[check-branch-visible]]; serdes
   extract/load scope through [[exportable-instance?]] and [[serdes-load-target]]."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(def keep-me
  "Marker so the core facade can retain its require of this namespace."
  nil)

(defenterprise current-branch
  "The git branch context for the current request/operation: the explicit sync
   binding when set, otherwise the current user's checked-out branch, otherwise
   the instance's global sync branch. Nil when remote sync is not in play.
   OSS: always nil."
  metabase-enterprise.remote-sync.branching
  []
  nil)

(defn branch-filter-clause
  "HoneySQL WHERE clause restricting branchable content to the current branch:
   rows with a NULL `branch` (not under git sync) are always visible; branch rows
   only on their own branch. Returns nil — no filtering — when there is no branch
   context. Use in every query that lists branchable entities:

     (cond-> query
       (remote-sync/branch-filter-clause :c.branch)
       (sql.helpers/where (remote-sync/branch-filter-clause :c.branch)))"
  ([] (branch-filter-clause :branch))
  ([branch-col]
   (when-let [b (current-branch)]
     [:or [:= branch-col nil] [:= branch-col b]])))

(defn visible-on-current-branch?
  "True when `entity` (a row map possibly carrying `:branch`) is visible in the
   current branch context: unbranched rows always, branch rows only on their
   branch."
  [entity]
  (let [row-branch (:branch entity)]
    (or (nil? row-branch)
        (= row-branch (current-branch)))))

(defn check-branch-visible
  "404 when `entity` belongs to another branch; returns `entity` otherwise. Use in
   by-id endpoints for branchable models."
  [entity]
  (when entity
    (if (visible-on-current-branch? entity)
      entity
      (throw (ex-info "Not found." {:status-code 404})))))

(defenterprise exportable-instance?
  "Serdes-extract filter: should this t2 `instance` be serialized in the current
   branch context? Unbranched rows and rows of the current branch: yes; other
   branches' rows: no. OSS: always true."
  metabase-enterprise.remote-sync.branching
  [_instance]
  true)

(defenterprise stamp-loaded-row!
  "Serdes-load hook: after an entity is loaded in a branch context, stamp its row
   with the operation's branch (`:branch` is serdes-skipped, so the load itself
   never writes it). No-op on main/OSS."
  metabase-enterprise.remote-sync.branching
  [_model-name _instance]
  nil)

(defenterprise serdes-load-target
  "Serdes-load hook: scope entity resolution by branch. For branchable models in a
   branch context, returns `[ingested' local']` where `local'` is the row with the
   ingested `entity_id` on the current branch (nil → insert) and `ingested'`
   carries `:branch`, so loads always land on the operation's branch.
   OSS: identity."
  metabase-enterprise.remote-sync.branching
  [_model-name ingested local]
  [ingested local])
