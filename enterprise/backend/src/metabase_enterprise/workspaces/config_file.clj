(ns metabase-enterprise.workspaces.config-file
  "The `workspace:` section of config.yml: the WorkspaceInstance a parent serves in `GET /:id/connection?format=yaml`.

    workspace:
      name: orders-cleanup
      databases:
        analytics:
          schemas:
            sales: mb__isolation_k3f9q2xa_s42_sales

  Loaded at boot, after the `databases:` section has created or updated the databases it names. It installs the
  workspace through [[ws/set-instance-workspace!]], the path `POST /api/ee/workspace-instance/current` takes, and then
  locks it: the API refuses to change a workspace config.yml sets, until a boot reads config.yml again."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; YAML parsing keywordizes map keys, so database and schema names arrive as keywords.

(s/def ::non-blank-string
  (s/and string? (complement str/blank?)))

(s/def ::name-key
  (s/or :keyword keyword? :string ::non-blank-string))

(s/def ::name ::non-blank-string)

(s/def ::schemas
  (s/map-of ::name-key ::non-blank-string :min-count 1))

(s/def ::database
  (s/keys :req-un [::schemas]))

(s/def ::databases
  (s/map-of ::name-key ::database :min-count 1))

(s/def ::section
  (s/keys :req-un [::name ::databases]))

(defmethod advanced-config.file.i/section-spec :workspace
  [_section-name]
  ::section)

(defn- section->workspace-instance
  "The `workspace:` section, after it passed its spec, as a WorkspaceInstance: database and schema names as strings."
  [{:keys [name databases]}]
  {:name      name
   :databases (into {}
                    (map (fn [[database-name {:keys [schemas]}]]
                           [(u/qualified-name database-name)
                            {:schemas (update-keys schemas u/qualified-name)}]))
                    databases)})

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section]
  ;; the config file is only initialized at boot, so this lock lasts until the next boot reads config.yml again
  (ws/set-instance-workspace! (section->workspace-instance section))
  (ws/lock-by-config-file!))
