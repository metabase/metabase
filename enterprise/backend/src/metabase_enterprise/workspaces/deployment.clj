(ns metabase-enterprise.workspaces.deployment
  "Provision / deprovision a workspace onto a pre-booted child Metabase instance from
   the pool. The parent talks to the child over HTTP using the child's stored
   superuser `api_key` (the `X-API-Key` header).

   Binding uses the child's runtime config-file endpoint `POST /api/ee/advanced-config`,
   which applies the workspace `config.yml` (warehouse DB connections + the `:workspace`
   section) *writably* — it does NOT lock the instance (the lock is a boot-only /
   `MB_INSTANCE_WORKSPACE` concern), so the matching deprovision over HTTP keeps working.

   Deployment is automatic: `POST /api/ee/workspace-manager` (see
   [[metabase-enterprise.workspaces.api.workspace-manager]]) calls [[provision!]], which
   claims any free pool instance — there are no standalone deployment endpoints."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- child-url
  "Join the instance's base url with an api path."
  [base path]
  (str (str/replace base #"/$" "") path))

(defn- child-request!
  "Make an authenticated HTTP request to a child instance. `opts` is merged into the
   clj-http request map. On any non-2xx / transport error, throws a sanitized ex-info (502).

   The raw clj-http exception is deliberately NOT attached as the cause: its ex-data carries
   the full request map — including the `x-api-key` header and the multipart body (which holds
   warehouse credentials / the remote-sync token) — and the response body, and the exception
   middleware serializes the whole cause chain into the API response + logs. We extract only
   the child's HTTP status and log a scrubbed line server-side."
  [{:keys [url api_key]} method path opts]
  (try
    (http/request
     (merge {:method  method
             :url     (child-url url path)
             :headers {"x-api-key" api_key}
             :as      :json
             ;; let clj-http throw on non-2xx; the catch below wraps + sanitizes it
             :throw-exceptions true
             :socket-timeout   30000
             :connection-timeout 10000}
            opts))
    (catch Exception e
      (let [child-status (:status (ex-data e))]
        ;; Log without the throwable (its stacktrace data echoes the request headers/body).
        (log/warnf "Child request failed: %s %s -> %s"
                   (name method) path (or child-status (.getMessage e)))
        (throw (ex-info (format "Child request failed: %s %s" (name method) path)
                        (cond-> {:status-code 502
                                 :child-url   url
                                 :path        path}
                          child-status (assoc :child-status child-status))))))))

(defn verify-instance-reachable!
  "Verify a pool instance is reachable and its `api_key` authenticates, by calling the
   instance's `GET /api/user/current`. A 2xx means the url is reachable AND the key is valid.
   Throws a 400 ex-info otherwise (the request itself is sanitized by [[child-request!]] so no
   credentials leak). `instance` is a map with `:url` and `:api_key`."
  [{:keys [url] :as instance}]
  (try
    (child-request! instance :get "/api/user/current" {})
    nil
    (catch Exception e
      (let [child-status (:child-status (ex-data e))]
        (throw (ex-info "Couldn't reach the instance with the provided URL and API key."
                        (cond-> {:status-code 400, :url url}
                          child-status (assoc :child-status child-status))))))))

(defn- bind-workspace-on-child!
  "Apply the workspace config.yml to the child via its runtime advanced-config endpoint.
   Multipart field `config` = the YAML, exactly like the manual `/config` download +
   upload flow, but driven server-to-server. Writable (does not lock the child)."
  [instance config-yaml]
  ;; The child's advanced-config endpoint expects a *file* part ({:filename, :tempfile}).
  ;; clj-http only encodes a multipart entry as a file part (with a filename) when its
  ;; `:content` is a File — a String content is sent as a plain form field, which the
  ;; endpoint's `:tempfile` schema then rejects. So write the YAML to a temp file.
  (let [^java.io.File tmp (java.io.File/createTempFile "workspace-config" ".yml")]
    (try
      (spit tmp config-yaml)
      (child-request! instance :post "/api/ee/advanced-config/"
                      {:multipart [{:name "config" :content tmp}]
                       :as        :string})
      (finally
        (.delete tmp)))))

(def ^:private synced-collection-name
  "Name of the collection on the child that the agent builds into and that remote-sync
   serializes. Matches the `setup-child.ts` spike."
  "Robot DE")

(defn- configure-remote-sync!
  "On the child: create the synced collection, point remote-sync at the content repo
   (read-write), pin that collection, and trigger the initial import so the collection
   is populated from the repo. `remote-sync` is `{:url ..., :token ..., :branch ...}`.

   This is GHY-3828's provision step: `setup-child.ts` sets the settings but never kicks
   the import, so a freshly-provisioned child started empty. Returns the import task id
   (or nil when the import reports no changes)."
  [instance {:keys [url token branch]}]
  (let [branch        (or branch "main")
        ;; Idempotent: reuse an existing "Robot DE" if present rather than creating a second
        ;; one. A prior provision that failed after creating the collection but before the
        ;; settings PUT leaves an orphan that the (is_remote_synced-gated) deprovision cleanup
        ;; can't see; reusing it here absorbs that orphan instead of accumulating duplicates.
        existing      (->> (:body (child-request! instance :get "/api/collection" {:as :json}))
                           (filter #(= synced-collection-name (:name %)))
                           first)
        coll-id       (or (:id existing)
                          (:id (:body (child-request! instance :post "/api/collection"
                                                      {:form-params  {:name synced-collection-name}
                                                       :content-type :json}))))]
    (child-request! instance :put "/api/ee/remote-sync/settings"
                    {:form-params  {:remote-sync-url    url
                                    :remote-sync-token  token
                                    :remote-sync-type   "read-write"
                                    :remote-sync-branch branch
                                    :collections        {coll-id true}}
                     :content-type :json})
    (let [{{task-id :task_id} :body}
          (child-request! instance :post "/api/ee/remote-sync/import"
                          {:form-params  {:branch branch}
                           :content-type :json})]
      (log/infof "Triggered remote-sync import on instance %d (collection %s, task %s)"
                 (:id instance) coll-id task-id)
      task-id)))

(defn- no-free-instance-ex []
  (ex-info "No free workspace instance is available; add one or free one up first."
           {:status-code 400}))

(defn check-free-instance-available!
  "Throw a 400 immediately when the pool has no free instance (`workspace_id` IS NULL).
   Probe only — the atomic claim happens inside [[provision!]]; callers use this to fail
   fast before creating anything."
  []
  (when-not (t2/exists? :model/WorkspaceInstance :workspace_id nil)
    (throw (no-free-instance-ex))))

(defn check-instance-deletable!
  "Throw a 400 when the pool instance is currently provisioned (bound to a workspace) —
   it must be deprovisioned before it can be deleted."
  [{:keys [workspace_id]}]
  (when workspace_id
    (throw (ex-info "Cannot delete a provisioned instance; deprovision it first."
                    {:status-code 400 :workspace_id workspace_id}))))

(defn- claim-free-instance!
  "Atomically claim any free pool instance (`workspace_id` IS NULL) for `workspace-id`.
   Each candidate is claimed with a conditional update — `workspace_id` is set only WHERE
   it is currently NULL — as a compare-and-swap, so two concurrent provisions can't both
   grab the same instance; on a lost race we move on to the next candidate. Returns the
   claimed instance, or throws 400 when no instance is free."
  [workspace-id]
  (or (some (fn [instance]
              (when (pos? (t2/update! :model/WorkspaceInstance
                                      :id (:id instance) :workspace_id nil
                                      {:workspace_id workspace-id}))
                (assoc instance :workspace_id workspace-id)))
            (t2/select :model/WorkspaceInstance :workspace_id nil {:order-by [[:id :asc]]}))
      (throw (no-free-instance-ex))))

(defn- release-instance!
  "Best-effort: free a claimed instance (workspace_id -> null) and unbind the child, used to
   roll back a provision whose child steps failed. Never throws — rollback must not mask the
   original error."
  [instance]
  ;; Two independent best-effort steps: a failed child unbind must NOT skip freeing the
  ;; appdb row (the pool slot), and neither step may throw — provision!'s catch re-throws
  ;; the original error after this, which a throw here would mask.
  (try
    (child-request! instance :delete "/api/ee/workspace-instance/current" {:as :string})
    (catch Exception _e
      (log/warnf "Rollback unbind failed on instance %d (continuing)" (:id instance))))
  (try
    (t2/update! :model/WorkspaceInstance :id (:id instance) {:workspace_id nil})
    (catch Exception _e
      (log/warnf "Rollback appdb-free failed on instance %d" (:id instance)))))

(defn provision!
  "Bind workspace `workspace-id` to any free pool instance.

   1. Atomically claim a free instance (CAS on `workspace_id` IS NULL) — 400 when the
      pool has none.
   2. Build the workspace `config.yml` (409 if the workspace has un-provisioned databases).
   3. POST it to the child (creates DB connections + binds the workspace, writably).
   4. If `remote-sync` config is supplied, configure remote-sync on the child + trigger
      the initial import (GHY-3828).

   The instance is claimed up front so concurrent provisions can't double-bind it. If any
   subsequent step fails the claim is rolled back — the child is unbound (best-effort) and
   `workspace_id` reset to null — so a failed provision never strands the instance bound on
   the child while free in the pool, nor busy in the pool while unconfigured.

   `remote-sync` is optional `{:url ..., :token ..., :branch ...}`; when omitted the
   workspace is bound but no content is synced. Returns the bound instance."
  [workspace-id remote-sync]
  (let [instance (claim-free-instance! workspace-id)]
    (try
      (let [config (or (ws.config/build-workspace-config workspace-id)
                       (throw (ex-info "Workspace not found" {:status-code 404 :workspace_id workspace-id})))
            yaml   (ws.config/config->yaml config)]
        (bind-workspace-on-child! instance yaml)
        (when remote-sync
          (configure-remote-sync! instance remote-sync))
        (log/infof "Provisioned workspace %d onto instance %d" workspace-id (:id instance))
        (t2/select-one :model/WorkspaceInstance :id (:id instance)))
      (catch Exception e
        (release-instance! instance)
        (throw e)))))

(defn- clean-synced-collection!
  "GHY-3829 policy (a): archive the agent's synced collection (\"Robot DE\") on the child on
   deprovision, so the next provision of this instance starts from a known-clean state
   instead of inheriting the prior workspace's collection + its cards/transforms.

   `DELETE /api/ee/workspace-instance/current` clears workspace mode + table remappings but
   leaves this collection behind, hence this extra step. We *archive* (`PUT :archived true`)
   rather than hard-delete: the collection REST API refuses to delete a non-trashed
   collection, and archiving already removes it from listings — so a re-provisioned instance
   won't see it.

   Targets only collections that are BOTH named `synced-collection-name` AND flagged
   `is_remote_synced` — i.e. the collection remote-sync actually pinned — so a user's own
   collection that merely shares the name is never touched. Best-effort: a failure here is
   logged but does NOT fail the deprovision — returning the instance to the pool matters more
   than a perfectly-clean appdb."
  [instance]
  (try
    (let [collections (:body (child-request! instance :get "/api/collection" {:as :json}))
          targets     (filter #(and (= synced-collection-name (:name %))
                                    (:is_remote_synced %))
                              collections)]
      (doseq [{coll-id :id} targets]
        (child-request! instance :put (str "/api/collection/" coll-id)
                        {:form-params  {:archived true}
                         :content-type :json})
        (log/infof "Archived synced collection %s on instance %d" coll-id (:id instance))))
    (catch Exception e
      (log/warnf e "Failed to clean synced collection on instance %d (continuing deprovision)"
                 (:id instance)))))

(defn deprovision!
  "Unbind workspace `workspace-id` from pool instance `instance-id`, returning that instance
   to the pool.

   1. Find the instance bound to `workspace-id` — 404 if none. Verify it is `instance-id`
      (409 on mismatch — guards against a stale caller naming the wrong instance).
   2. Child: archive the synced collection (best-effort cleanup — GHY-3829 policy (a)).
   3. Child: `DELETE /api/ee/workspace-instance/current` (clears workspace mode + remappings).
   4. Mark the instance free (`workspace_id = null`).

   Steps 2 and 3 are both **best-effort**: a dead/unreachable child must NOT keep the pool
   slot permanently `provisioned` (there'd be no API path to reclaim it — DELETE /instance is
   409-guarded on a busy instance). Freeing the parent row always happens. The worst case is
   a child left bound but unreachable; a later reachable provision/deprovision cleans it.

   The instance itself is NOT destroyed — it keeps its admin user + `api_key` and returns
   to the pool for reuse. Booting is the expensive part the pool exists to avoid."
  [workspace-id instance-id]
  (let [instance (t2/select-one :model/WorkspaceInstance :workspace_id workspace-id)]
    (when-not instance
      (throw (ex-info "No pool instance is provisioned for this workspace"
                      {:status-code 404 :workspace_id workspace-id})))
    (when (not= instance-id (:id instance))
      (throw (ex-info "That instance is not the one provisioned for this workspace"
                      {:status-code 409 :workspace_id workspace-id
                       :instance_id instance-id :bound_instance_id (:id instance)})))
    (clean-synced-collection! instance)
    (try
      (child-request! instance :delete "/api/ee/workspace-instance/current" {:as :string})
      (catch Exception _e
        (log/warnf "Child unbind failed on instance %d; freeing the pool slot anyway"
                   (:id instance))))
    (t2/update! :model/WorkspaceInstance :id (:id instance) {:workspace_id nil})
    (log/infof "Deprovisioned workspace %d from instance %d" workspace-id (:id instance))
    (t2/select-one :model/WorkspaceInstance :id (:id instance))))
