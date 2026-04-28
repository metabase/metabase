(ns metabase-enterprise.advanced-config.file.workspace
  "Child-instance loader for the `:workspace` section of `config.yml`.

   On boot, materializes the workspace as `:model/Workspace` + `:model/WorkspaceDatabase`
   rows in `:provisioned` state. The parent has already created the warehouse-side
   schema/user/grants; the child's job is to record that fact so existing read paths
   (`db-workspace-schema`, the QP middleware, the transform write-redirection hook)
   resolve workspace-mode correctly.

   Idempotent: re-applying the same config skips workspaces and workspace_database rows
   that already exist for the configured (workspace-name, database-id) pairs."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def keep-me
  "Marker so the parent advanced-config.file ns can `(comment ...keep-me)` to retain the require."
  nil)

;;; ---------------------------------- Spec ----------------------------------

(s/def ::input_schemas
  (s/coll-of string? :min-count 1))

(s/def ::output_schema
  (s/and string? seq))

(s/def ::workspace-database-config
  (s/keys :req-un [::input_schemas ::output_schema]))

(s/def ::databases
  ;; map of database-name -> per-database workspace config. Keys may be
  ;; keywords or strings depending on YAML parser flags; both are accepted.
  (s/and (s/map-of (s/or :kw keyword? :str string?) ::workspace-database-config)
         seq))

(s/def ::name
  (s/and string? seq))

(s/def ::config-file-spec
  (s/keys :req-un [::name ::databases]))

(defn valid-workspace-section?
  "Predicate used by the file-level loader to decide whether `(:workspace m)` is
  a structurally-valid bring-up manifest. Only a valid section opens the
  config-text-file gate for OSS instances — a typo or empty section must not."
  [section-config]
  (s/valid? ::config-file-spec section-config))

(defmethod advanced-config.file.i/section-spec :workspace
  [_section-name]
  (s/spec ::config-file-spec))

(defn- ordered->plain
  "snakeyaml's parsed maps are ordered/lazy; re-walk into plain Clojure maps."
  [x]
  (walk/postwalk
   (fn [form]
     (if (map? form)
       (into {} form)
       form))
   x))

(defn- resolve-db-id [db-name]
  (or (t2/select-one-pk :model/Database :name db-name)
      (throw (ex-info (str "Workspace config references unknown database: " (pr-str db-name))
                      {:database-name db-name}))))

(defn- resolve-creator-id
  "Pick a superuser to attribute the workspace to. Prefers the bundled
   `workspace@workspace.local` admin (created by the `:users` section in the
   same config.yml). Falls back to any superuser. Throws if none exists —
   a workspace can't be ownerless."
  []
  (or (t2/select-one-pk :model/User :email "workspace@workspace.local")
      (t2/select-one-pk :model/User :is_superuser true)
      (throw (ex-info "Cannot bootstrap workspace from config.yml: no superuser exists. Ensure the :users section runs before :workspace."
                      {}))))

(defn- existing-workspace-database
  "Return the existing WorkspaceDatabase row for (workspace-id, db-id), or nil."
  [workspace-id db-id]
  (t2/select-one :model/WorkspaceDatabase
                 :workspace_id workspace-id
                 :database_id  db-id))

(defn- upsert-workspace-database!
  "Insert a `:provisioned` WorkspaceDatabase row, or no-op if one already exists.
   `output-schema` comes from config.yml — the parent already created the warehouse
   schema/user/grants under that name, so we record the fact rather than running
   `provision!`."
  [workspace-id db-id {:keys [input_schemas output_schema]}]
  (when-not (existing-workspace-database workspace-id db-id)
    (t2/insert! :model/WorkspaceDatabase
                {:workspace_id     workspace-id
                 :database_id      db-id
                 :database_details {}
                 :input_schemas    (vec input_schemas)
                 :output_schema    output_schema
                 :status           :provisioned})))

(defn- find-or-create-workspace!
  "Idempotent on `:name`: returns the existing workspace's id when one with the
   given name already exists, otherwise inserts a fresh row."
  [workspace-name creator-id]
  (or (t2/select-one-pk :model/Workspace :name workspace-name)
      (t2/insert-returning-pk! :model/Workspace
                               {:name       workspace-name
                                :creator_id creator-id})))

(defn apply-workspace-section!
  "Boot-time materialization of the parsed `:workspace` section.

   Shape (post-`ordered->plain`):

     {:name      \"<workspace-name>\"
      :databases {\"<db-name>\" {:input_schemas [...]
                                  :output_schema \"<schema>\"}
                  ...}}

   For each database entry, resolves the db-name to a `:model/Database` id and
   inserts (idempotently) a `:provisioned` WorkspaceDatabase row."
  [section-config]
  (let [{:keys [name databases]} (ordered->plain section-config)
        creator-id   (resolve-creator-id)
        workspace-id (find-or-create-workspace! name creator-id)]
    (doseq [[db-name-kw wsd-config] databases]
      (let [db-name (clojure.core/name db-name-kw)
            db-id   (resolve-db-id db-name)]
        (upsert-workspace-database! workspace-id db-id wsd-config)))
    {:workspace-id workspace-id
     :database-count (count databases)}))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (apply-workspace-section! section-config))
