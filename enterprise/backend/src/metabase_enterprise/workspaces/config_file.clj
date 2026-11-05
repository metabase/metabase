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
  locks it: `POST` and `DELETE /api/ee/workspace-instance/current` refuse to change a workspace config.yml sets. When
  `MB_INSTANCE_WORKSPACE` is set, the env var wins and the section is skipped.

  [[apply-config-yml!]] applies the same config.yml to a running instance, for `POST /api/ee/workspace-instance/config`,
  as a boot with that file would: every section through the boot loader's section code, then its `workspace:`
  section, with the same lock, all in one app-DB transaction after every check has passed.

  Sections carry secrets (the workspace user's warehouse password, user passwords, API keys). The errors and log lines
  this namespace writes carry no value from the file. The connection test it runs is the driver layer's, which logs the
  driver's own error message when the test fails."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [metabase-enterprise.advanced-config.core :as advanced-config]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.driver.util :as driver.u]
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

(defmethod advanced-config/section-spec :workspace
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

(defmethod advanced-config/initialize-section! :workspace
  [_section-name section]
  (ws/call-with-instance-workspace-lock
   (fn []
     (if (= :env-var (ws/workspace-lock))
       ;; installing would also prune the env var workspace's remappings, which it still reads
       (log/warn "Skipping the workspace section of config.yml: MB_INSTANCE_WORKSPACE sets this instance's workspace, and the env var wins.")
       (do
         (ws/set-instance-workspace! (section->workspace-instance section))
         (ws/lock-by-config-file!))))))

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
  (not= (get-method advanced-config/initialize-section! section-name)
        (get-method advanced-config/initialize-section! :default)))

(def ^:private min-scrubbed-length
  "Strings shorter than this are left in messages: replacing every `u` or `5` would garble them, and no password, key
  or token is this short."
  4)

(defn- scrub
  "`message` with every string of at least [[min-scrubbed-length]] characters in `section` replaced by `****`, longest
  first: any of them may be a secret."
  [message section]
  (reduce (fn [message secret]
            (str/replace message secret "****"))
          message
          (sort-by (comp - count)
                   (into #{}
                         (filter #(and (string? %) (<= min-scrubbed-length (count %))))
                         (tree-seq coll? seq section)))))

(defn- refuse!
  "Throw a 400 saying the `section-name` section can't be applied because of `e`, with `section`'s values scrubbed
  from its message. The cause is left out: its message and data hold the values."
  [section-name section e]
  (log/warnf "Could not apply the %s section of a config.yml: %s" (name section-name) (.getName (class e)))
  (throw (ex-info (tru "Could not apply the {0} section of this config.yml: {1}"
                       (name section-name)
                       ;; the workspace section holds only names, which the message needs to say which is wrong
                       (cond-> (str (ex-message e))
                         (not= section-name :workspace) (scrub section)))
                  {:status-code 400})))

(defn- tested-at-apply?
  "Whether the `databases:` loader tests the connection of `database`, as it does for every entry that is not a
  deletion, the sample database or a stub."
  [database]
  (not (or (contains? database :delete) (:is_sample database) (:is_stub database))))

(defn- check-workspace-databases!
  "Throw a 400 unless each database the `workspace` instance names will, once `databases` (the `databases:` section)
  is applied, be exactly one database with an engine workspaces support."
  [workspace databases]
  (let [deleted   (into #{} (comp (filter #(contains? % :delete)) (map :name)) databases)
        from-file (into {} (comp (remove #(contains? % :delete)) (map (juxt :name identity))) databases)]
    (doseq [database-name (keys (:databases workspace))]
      (let [ids   (ws.db/database-ids-named database-name)
            entry (from-file database-name)]
        (cond
          (deleted database-name)
          (throw (ex-info (tru "This config.yml deletes database {0}, which its workspace section names."
                               (pr-str database-name))
                          {:status-code 400}))

          (< 1 (count ids))
          (throw (ex-info (tru "Several databases are named {0}: {1}." (pr-str database-name) (pr-str ids))
                          {:status-code 400}))

          ;; a stub entry never overwrites an existing database, so that one's engine is the one the workspace gets
          (and entry (not (and (:is_stub entry) (seq ids))))
          (ws/check-supported-engine! (select-keys entry [:name :engine]))

          (empty? ids)
          (throw (ex-info (tru "No database is named {0}, here or in this config.yml." (pr-str database-name))
                          {:status-code 400}))

          :else
          (ws/check-supported-engine! (ws.db/database-name-and-engine (first ids))))))))

(defn- check-config!
  "Throw a 400 unless `parsed` is a config.yml of a supported version with a `workspace:` section, only sections the
  boot loader knows, every section valid, and a workspace that names databases it can be installed on. Boot logs and
  skips an unknown section; here the caller hears about it."
  [parsed]
  (when-not (and (map? parsed)
                 (advanced-config/supported-version? (:version parsed))
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
      (check-spec! (advanced-config/section-spec section-name) section section-name))
    (let [workspace (section->workspace-instance (:workspace sections))]
      (when-not (mr/validate ::ws/workspace-instance workspace)
        (throw (ex-info (tru "The workspace section of this config.yml is not valid: each main schema needs its own scratch namespace, and no scratch namespace may be a main schema.")
                        {:status-code 400})))
      (check-workspace-databases! workspace (:databases sections)))))

(defn- test-connections!
  "Test the connection of each `databases:` entry the loader would test, before anything is written."
  [databases]
  (doseq [database databases
          :when (tested-at-apply? database)]
    (try
      (driver.u/with-database-network-policy database
        (driver.u/can-connect-with-details? (keyword (:engine database)) (:details database) :throw-exceptions))
      (catch Exception e
        (refuse! :databases databases e)))))

(defn apply-config-yml!
  "Apply `config-yml`, the text of a config.yml with a `workspace:` section, as a boot with it would: every section
  through the boot loader's section code, in the boot order, so the workspace is installed and locked last. First
  checks the whole file (names, specs, the databases the workspace names) and tests each database connection; then
  writes everything in one app-DB transaction, so a failure leaves nothing applied. Does not expand `{{env ...}}`
  templates, which would read this instance's environment, and does not need the `:config-text-file` feature. Returns
  the installed workspace."
  [config-yml]
  (let [{sections :config, :as parsed} (parse-config-yml config-yml)]
    (check-config! parsed)
    (test-connections! (:databases sections))
    (ws/in-one-transaction!
     (fn []
       ;; every section the boot loader takes, for now; MBCWS-43 revisits which sections this endpoint should accept
       (doseq [[section-name section] (advanced-config/sort-by-initialization-order sections)]
         (try
           (advanced-config/initialize-section! section-name section)
           (catch Exception e
             (refuse! section-name section e))))))
    (ws/instance-workspace)))
