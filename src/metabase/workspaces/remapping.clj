(ns metabase.workspaces.remapping
  "Forward and reverse entity-ID remapping for workspaces.

  A workspace is a copy-on-write overlay over git-syncable entities: the first write to an
  entity inside a workspace copies it, and the copy's ID is recorded in
  `workspace_entity_remapping`. While a user has a workspace active (`core_user.workspace_id`),
  entity IDs coming in from the outside world (API params, saved references) are *source* IDs
  and should be resolved to the workspace copy with [[remapped-entity-id]] (forward); IDs of
  workspace copies going back out should be translated with [[source-entity-id]] (reverse).

  The `:model/Workspace` and `:model/WorkspaceEntityRemapping` models live in EE
  (`metabase-enterprise.workspaces.models.*`), so everything that touches them here is a
  `defenterprise` with an identity/no-op OSS stub — on OSS there is never an active
  workspace, so the stubs are the correct behavior, not a degradation."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn current-workspace-id :- [:maybe pos-int?]
  "ID of the current user's active workspace (`core_user.workspace_id`, carried on
  `api/*current-user*`), or nil when none is active. Use `with-redefs` on this fn in tests
  that need to force a workspace context without a real current user."
  []
  (:workspace_id @api/*current-user*))

(defn check-workspace-enabled
  "Assert that the current user has an active workspace (`core_user.workspace_id`); throw a
  400 otherwise. Use in endpoints that only make sense inside a workspace."
  []
  (api/check-400 (some? (current-workspace-id))
                 (tru "You must have an active workspace to perform this action.")))

(defn stamp-workspace-id
  "assoc `:workspace_id` with the current user's active workspace unless the key is already
  present (nil on main / OSS, where no workspace can be active). Call from `before-insert` of
  workspace-scoped models so rows created inside a workspace are tagged with it — including
  copy-on-write clones, which are always inserted in a workspace context.

  Also drops `:workspace_id_helper`: it is a database-generated column (present on instances
  selected from the DB), and row-copy code paths that re-insert selected rows must never try
  to assign it."
  [instance]
  (cond-> (dissoc instance :workspace_id_helper)
    (not (contains? instance :workspace_id))
    (assoc :workspace_id (current-workspace-id))))

(defn with-source-entity-id
  "Present a (possibly remapped) `entity` under `source-id`, the ID the client asked for, so
  clients keep a stable view of the graph. Identity for non-map or ID-less values."
  [entity source-id]
  (cond-> entity
    (and (map? entity) (:id entity))
    (assoc :id source-id)))

(defn model->entity-type
  "Convert a Toucan model keyword such as `:model/Card` to the plain kebab-case keyword the
  workspaces module stores in `workspace_entity_remapping.entity_type` (e.g. `:card`,
  `:dashboard-card`, `:native-query-snippet`). This conversion is internal to the workspaces
  module -- code outside `metabase.workspaces.*` / `metabase-enterprise.workspaces.*` only ever
  sees Toucan model keywords through the module's public API."
  [model]
  (keyword (u/->kebab-case-en (name model))))

(defn- shadowed-by-workspace-copy?
  "True if `id` (belonging to `model`, a main/nil-workspace row) has been copied into `workspace-id` -- i.e.
  there's a `workspace_entity_remapping` row for (`workspace-id`, `model`, `id`) whose `target_entity_id`
  differs from its `source_entity_id`. See [[workspace-visibility-clause]]'s docstring for the full rule this
  implements; kept in sync with it by construction (same table, same predicate).

  `model` and `id` come from [[t2/model]] / `:id` on a `can-read?` `instance`, which isn't always a genuine
  Toucan instance (e.g. rows shaped by a metadata provider for the QP) -- `model` or `id` missing means we
  can't answer the question, so default to *not* shadowed rather than throwing."
  [model id workspace-id]
  (boolean
   (and model id
        (t2/exists? :workspace_entity_remapping
                    {:where [:and
                             [:= :workspace_id workspace-id]
                             [:= :entity_type (name (model->entity-type model))]
                             [:= :source_entity_id id]
                             [:not= :target_entity_id :source_entity_id]]}))))

(defn readable-workspace-row?
  "Row-level counterpart to [[workspace-visibility-clause]], for `mi/can-read?` implementations -- readable
  exactly when a listing filtered by that clause would include this row:

  - `instance`'s `:workspace_id` matches the current user's active workspace, OR
  - `instance`'s `:workspace_id` is nil (a main row) AND it isn't shadowed by a copy in the current workspace
    (vacuously true when there's no active workspace).

  This is safe for direct/already-resolved reads too, not just listings: every workspace-wired endpoint
  remaps *before* read-checking, so a workspace user reads their own copy (presented under the source id),
  never the shadowed source row itself -- see `workspace-query-remapping-test` for the QP path in particular.

  Runs one query per call (via [[shadowed-by-workspace-copy?]]) when `instance` is a main row and a workspace
  is active; fine for `can-read?` and small `filter mi/can-read?` post-filters, but listings should prefer
  [[workspace-visibility-clause]] (or a builder that ANDs it in) instead of relying on this in a loop."
  [instance]
  (let [row-workspace-id (:workspace_id instance)
        active-workspace-id (current-workspace-id)]
    (if (some? row-workspace-id)
      (= row-workspace-id active-workspace-id)
      (or (nil? active-workspace-id)
          (not (shadowed-by-workspace-copy? (t2/model instance) (:id instance) active-workspace-id))))))

(defn workspace-visibility-clause
  "HoneySQL `:where` clause restricting rows of `model` to what the current user's active workspace
  should see. `id-column` and `workspace-id-column` are the (possibly table-qualified, e.g. `:c.id`,
  `:c.workspace_id`) columns of the query being filtered.

  - No active workspace: only main rows are visible (`workspace-id-column IS NULL`).
  - Active workspace `ws`: rows belonging to `ws` are visible, plus main rows *not* shadowed by one of
    `ws`'s copies -- i.e. there is no `workspace_entity_remapping` row for (`ws`, `model`, this row's id)
    whose `target_entity_id` differs from its `source_entity_id` (a workspace-created row, where source =
    target, does not shadow anything and is handled by the first branch instead).

  This is pure OSS logic (it only reads [[current-workspace-id]], which is nil on OSS / without an active
  workspace, and the `workspace_entity_remapping` table directly -- the EE model is intentionally not
  resolved here so this can run from any module)."
  [model id-column workspace-id-column]
  (if-let [workspace-id (current-workspace-id)]
    [:or
     [:= workspace-id-column workspace-id]
     [:and
      [:= workspace-id-column nil]
      [:not
       [:exists
        {:select [1]
         :from   [:workspace_entity_remapping]
         :where  [:and
                  [:= :workspace_entity_remapping.workspace_id workspace-id]
                  [:= :workspace_entity_remapping.entity_type (name (model->entity-type model))]
                  [:= :workspace_entity_remapping.source_entity_id id-column]
                  [:not= :workspace_entity_remapping.target_entity_id
                   :workspace_entity_remapping.source_entity_id]]}]]]]
    [:= workspace-id-column nil]))

(defenterprise remapped-entity-id
  "Forward ID remapping: the ID to use in place of source entity `id` for the current user.
  Returns the workspace copy's ID when the active workspace has a remapping for
  (`model`, `id`); otherwise returns `id` unchanged. OSS: identity."
  metabase-enterprise.workspaces.remapping
  [_model id]
  id)

(defenterprise source-entity-id
  "Reverse ID remapping: given `id` of an entity that may be a workspace copy, return the
  source (production) entity ID it was copied from, or `id` unchanged when it is not a copy
  in the current user's active workspace. OSS: identity."
  metabase-enterprise.workspaces.remapping
  [_model id]
  id)

(defenterprise remapped-entity-ids
  "Batch forward remapping: map of source ID -> workspace copy ID for the subset of `ids`
  that have a remapping in the current user's active workspace. OSS / no active workspace:
  empty map."
  metabase-enterprise.workspaces.remapping
  [_model _ids]
  {})

(defenterprise add-remapping!
  "Record that (`model`, `source-id`) maps to `target-id` in the current user's active
  workspace. POST endpoints call this with `source-id = target-id` after creating an entity,
  marking it workspace-owned. No-op on OSS or without an active workspace."
  metabase-enterprise.workspaces.remapping
  [_model _source-id _target-id]
  nil)

(defenterprise delete-remapping!
  "DELETE hook: remove the active workspace's remapping row for (`model`, `source-id`) —
  call it after deleting the (remapped) entity row so no dangling mapping is left behind.
  No-op on OSS or without an active workspace."
  metabase-enterprise.workspaces.remapping
  [_model _source-id]
  nil)

(defenterprise ensure-workspace-copy!
  "Copy-on-write hook for PUT endpoints. When the current user has an active workspace:
  return the ID of the entity's workspace copy, cloning the entity on first write (via the
  per-model [[metabase.workspaces.clone/clone-entity!]]) and recording the remapping.
  Otherwise returns `id` unchanged, so callers can use this unconditionally at the top of
  every PUT. OSS: identity."
  metabase-enterprise.workspaces.remapping
  [_model id]
  id)

(defenterprise check-valid-workspace-id
  "Check that `workspace-id` may be set as a user's active workspace. On OSS any non-nil
  workspace-id is rejected, since workspaces are an enterprise feature."
  metabase-enterprise.workspaces.remapping
  [workspace-id]
  (api/check-400 (nil? workspace-id)
                 (tru "Workspaces are a paid feature not currently available to your instance.")))
