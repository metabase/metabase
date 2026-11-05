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
  locks it: `POST` and `DELETE /api/ee/workspace-instance/current` refuse to change a workspace config.yml sets.

  [[apply-config-yml!]] applies the same config.yml to a running instance, for `POST /api/ee/workspace-instance/config`,
  as a boot with that file would: every section through the boot loader's section code, then its `workspace:`
  section, with the same lock. Only another config.yml replaces it, through that endpoint or a boot.
  Sections carry secrets (the workspace user's warehouse password, user passwords, API keys), so nothing here puts
  the file's values in an error message or a log line."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   ;; also loads every config.yml section's code, and the version spec
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]))

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
  (ws/set-instance-workspace! (section->workspace-instance section))
  (ws/lock-by-config-file!))

;;; ------------------------------------------- Applying at runtime ----------------------------------------------

(defn- check-spec!
  "Throw a 400 unless `value` conforms to `spec`. The message names where each problem is, never the value there: a
  section may hold a password, an API key or a token."
  [spec value section-name]
  (when-let [problems (::s/problems (s/explain-data spec value))]
    (throw (ex-info (tru "The {0} section of this config.yml is not valid at {1}."
                         (name section-name)
                         (str/join ", " (distinct (map (comp pr-str :in) problems))))
                    {:status-code 400}))))

(defn- parse-config-yml
  [config-yml]
  (try
    (yaml/parse-string config-yml)
    (catch Exception _
      ;; SnakeYAML's message quotes the lines around the problem, which may hold a secret
      (throw (ex-info (tru "This config.yml is not valid YAML.") {:status-code 400})))))

(defn- known-section?
  [section-name]
  (not= (get-method advanced-config.file.i/initialize-section! section-name)
        (get-method advanced-config.file.i/initialize-section! :default)))

(defn- check-config!
  "Throw a 400 unless `parsed` is a config.yml of a supported version with a `workspace:` section, only sections the
  boot loader knows, and every section valid. Boot logs and skips an unknown section; here the caller hears about it."
  [parsed]
  (when-not (and (map? parsed)
                 (s/valid? :metabase.config.file.config/version (:version parsed))
                 (map? (:config parsed)))
    (throw (ex-info (tru "This config.yml needs a supported version and a config map.") {:status-code 400})))
  (let [sections (:config parsed)
        unknown  (sort (remove known-section? (keys sections)))]
    (when (seq unknown)
      (throw (ex-info (tru "This config.yml has sections Metabase does not know: {0}." (str/join ", " (map name unknown)))
                      {:status-code 400})))
    (when-not (:workspace sections)
      (throw (ex-info (tru "This config.yml has no workspace section.") {:status-code 400})))
    (doseq [[section-name section] sections]
      (check-spec! (advanced-config.file.i/section-spec section-name) section section-name))
    (when-not (mr/validate ::ws/workspace-instance (section->workspace-instance (:workspace sections)))
      (throw (ex-info (tru "The workspace section of this config.yml is not valid: each main schema needs its own scratch namespace, and no scratch namespace may be a main schema.")
                      {:status-code 400})))))

(defn- scrub
  "`message` with every string in `section` replaced by `****`, longest first: any of them may be a secret."
  [message section]
  (reduce (fn [message secret]
            (str/replace message secret "****"))
          message
          (sort-by (comp - count) (distinct (filter #(and (string? %) (seq %)) (tree-seq coll? seq section))))))

(defn- apply-section!
  [section-name section]
  (try
    (advanced-config.file.i/initialize-section! section-name section)
    (catch Exception e
      (log/warnf "Could not apply the %s section of a config.yml: %s" (name section-name) (.getName (class e)))
      (throw (ex-info (tru "Could not apply the {0} section of this config.yml: {1}"
                           (name section-name)
                           ;; the workspace section holds only names, which the message needs to say which is wrong
                           (cond-> (str (ex-message e))
                             (not= section-name :workspace) (scrub section)))
                      {:status-code 400})))))

(defn apply-config-yml!
  "Apply `config-yml`, the text of a config.yml with a `workspace:` section, as a boot with it would: every section
  through the boot loader's section code, in the boot order, so the workspace is installed and locked last. Does not
  expand `{{env ...}}` templates, which would read this instance's environment, and does not need the
  `:config-text-file` feature. Everything is checked before anything is applied. Returns the installed workspace."
  [config-yml]
  (let [parsed (parse-config-yml config-yml)]
    (check-config! parsed)
    ;; every section the boot loader takes, for now; MBCWS-43 revisits which sections this endpoint should accept
    (doseq [[section-name section] (advanced-config.file/sort-by-initialization-order (:config parsed))]
      (apply-section! section-name section))
    (ws/instance-workspace)))
