(ns metabase-enterprise.workspaces.hm-instance
  "Parent -> Harbormaster calls for workspace child instances.

  Contract (HM tech design CLO-5715): `POST /api/v2/mb/workspaces/instances` with the
  full config.yml in the body, `blocking=true` so the call returns only once the child
  is healthy with the config hot-loaded; `DELETE .../instances/:id` is idempotent
  (404 = already gone). HM keeps a backstop reaper, so a missed delete leaks money,
  not data. The fake-hm rig (GHY-4048) mimics this exact surface."
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.config.core :as config]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.secret :as u.secret]))

(set! *warn-on-reflection* true)

;; Bounded timeouts so a stalled HM never pins an API thread indefinitely. Create is
;; blocking on the HM side (machine spin-up + config hot-load), so its read timeout
;; is generous; delete just enqueues.
(def ^:private create-timeouts {:connection-timeout 10000, :socket-timeout 600000})
(def ^:private delete-timeouts {:connection-timeout 10000, :socket-timeout 30000})

(defn create-instance!
  "Create the child instance for a workspace (blocking; returns once the child is
  active with `config-yml` applied). Returns `{:id .. :url .. :status ..}`.
  Throws a 502 `ex-info` when HM refuses or is unreachable — the workspace and its
  warehouse resources are left in place so the caller can retry or delete."
  [{:keys [workspace-id name config-yml]}]
  (let [[ok? resp] (hm.client/make-request :post "/api/v2/mb/workspaces/instances"
                                           {:name       name
                                            :blocking   true
                                            :metadata   {:parent-instance (str (system/site-uuid))
                                                         :workspace-id    workspace-id}
                                            :mb-version (:tag config/mb-version-info)
                                            ;; wrapped so it can never land in a log line; the client
                                            ;; exposes it only at the JSON-encode boundary
                                            :config-yml (u.secret/secret config-yml)}
                                           create-timeouts)]
    (if (= ok? :ok)
      (select-keys (:body resp) [:id :url :status])
      (throw (ex-info (tru "Harbormaster failed to create the workspace instance.")
                      {:status-code  502
                       :workspace_id workspace-id
                       :hm_status    (:status resp)
                       :hm_body      (:body resp)})))))

(defn delete-instance!
  "Delete the child instance. Idempotent: 404 means it is already gone and counts as
  success. Returns true on success; on failure logs and returns false — the caller
  reports it and HM's backstop reaper eventually collects the instance."
  [hm-instance-id]
  (let [[ok? resp] (hm.client/make-request :delete (str "/api/v2/mb/workspaces/instances/" hm-instance-id)
                                           nil delete-timeouts)]
    (or (= ok? :ok)
        (= 404 (:status resp))
        (do (log/warnf "Harbormaster delete failed for workspace instance %s: status %s"
                       hm-instance-id (:status resp))
            false))))
