(ns metabase.metabot.tools.settings-admin
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.scope :as scope]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-limit 50)
(def ^:private max-limit 100)

(defn- env-backed?
  [setting-def]
  (some? (setting/env-var-value setting-def)))

(defn- read-only?
  [setting-def]
  (or (= :none (:setter setting-def))
      (env-backed? setting-def)))

(defn- excluded?
  [setting-def]
  (or (:sensitive? setting-def)
      (= :internal (:visibility setting-def))))

(defn- safe-description
  [setting-def]
  (try
    (when-let [d (:description setting-def)]
      (not-empty (str (d))))
    (catch Throwable _ nil)))

(defn- safe-current-value
  [setting-def]
  (try
    (setting/user-facing-value setting-def)
    (catch Throwable e
      (log/warn e "Error reading setting value for metabot admin tool" {:key (:name setting-def)})
      nil)))

(defn- setting-row
  [setting-def]
  {:key            (name (:name setting-def))
   :type           (:type setting-def)
   :description    (safe-description setting-def)
   :value          (safe-current-value setting-def)
   :default        (:default setting-def)
   :is_env_setting (env-backed? setting-def)
   :read_only      (read-only? setting-def)})

(defn- lookup-setting
  [key]
  (let [k (keyword (u/->kebab-case-en (name key)))]
    (get @setting/registered-settings k)))

(defn- matches-search?
  [search setting-def]
  (or (str/blank? search)
      (let [needle (u/lower-case-en (str/trim search))]
        (or (str/includes? (u/lower-case-en (name (:name setting-def))) needle)
            (str/includes? (u/lower-case-en (or (safe-description setting-def) "")) needle)))))

(def ^:private list-settings-schema
  [:map {:closed true}
   [:search {:optional true} [:maybe :string]]
   [:limit {:optional true} [:maybe :int]]])

(mu/defn ^{:tool-name "list_settings"
           :scope     scope/agent-admin-settings-read}
  list-settings-tool
  "List Metabase instance administration settings the current admin can view. Superuser only.

  Optionally pass `search` to filter to settings whose key or description contains that substring
  (case-insensitive), and `limit` to cap how many are returned (default 50, maximum 100). Each entry
  reports the setting key, type, description, current value, default, whether it is set via an
  environment variable, and whether it is read-only. Secret settings and internal settings are never
  listed. Use this to discover which settings exist before reading or changing one."
  [{:keys [search limit]} :- list-settings-schema]
  (api/check-superuser)
  (let [cap      (min (or limit default-limit) max-limit)
        matching (->> (vals @setting/registered-settings)
                      (remove excluded?)
                      (filter #(matches-search? search %))
                      (sort-by (comp name :name)))
        total    (count matching)
        rows     (into [] (comp (take cap) (map setting-row)) matching)
        capped?  (> total (count rows))]
    {:structured-output
     (cond-> {:result-type :admin-settings-list
              :total       total
              :returned    (count rows)
              :settings    rows}
       capped? (assoc :capped?    true
                      :note       (str "Showing " (count rows) " of " total
                                       " matching settings. Narrow the search or raise the limit to see more.")))}))

(def ^:private get-setting-schema
  [:map {:closed true}
   [:key :string]])

(mu/defn ^{:tool-name "get_setting"
           :scope     scope/agent-admin-settings-read}
  get-setting-tool
  "Read a single Metabase instance administration setting by its `key`. Superuser only.

  Returns the setting key, type, description, current value, default, whether it is set via an
  environment variable, and whether it is read-only. Refuses to read unknown, secret, or internal
  settings."
  [{:keys [key]} :- get-setting-schema]
  (api/check-superuser)
  (if-let [setting-def (lookup-setting key)]
    (if (excluded? setting-def)
      {:output (str "The setting '" key "' cannot be read because it is a secret or internal setting.")}
      {:structured-output (assoc (setting-row setting-def) :result-type :admin-setting)})
    {:output (str "There is no setting named '" key "'. Use list_settings to discover available settings.")}))

(def ^:private update-setting-schema
  [:map {:closed true}
   [:key :string]
   [:value :any]])

(mu/defn ^{:tool-name "update_setting"
           :scope     scope/agent-admin-settings-write}
  update-setting-tool
  "Update a single Metabase instance administration setting. Superuser only.

  Provide the setting `key` and the new `value`. Refuses to change unknown, secret, or internal
  settings, read-only settings, or settings backed by an environment variable. The response reports
  the previous value and a ready-made revert action: call update_setting again with the same key and
  the previous value to undo the change. Some settings have side-effectful setters, so reverting
  restores the stored value but may not undo every side effect the change caused. Always tell the user
  the change was applied and that it is revertible."
  [{:keys [key value]} :- update-setting-schema]
  (api/check-superuser)
  (if-let [setting-def (lookup-setting key)]
    (cond
      (excluded? setting-def)
      {:output (str "The setting '" key "' cannot be changed because it is a secret or internal setting.")}

      (= :none (:setter setting-def))
      {:output (str "The setting '" key "' is read-only and cannot be changed.")}

      (env-backed? setting-def)
      {:output (str "The setting '" key "' is set via an environment variable and cannot be changed at runtime.")}

      :else
      (let [k        (:name setting-def)
            previous (setting/get k)]
        (setting/with-enforced-setting-access-checks
          (setting/set! k value))
        (let [new-value (setting/get k)]
          {:structured-output
           {:result-type    :admin-setting-updated
            :key            (name k)
            :previous_value previous
            :new_value      new-value
            :reverted_with  {:tool "update_setting"
                             :args {:key (name k) :value previous}}
            :instructions   (str "The setting was updated. Tell the user the change was applied and that it can be"
                                 " reverted. To undo, call update_setting with key '" (name k) "' and value set to"
                                 " previous_value. Note: some settings have side-effectful setters, so reverting"
                                 " restores the value but may not undo every side effect.")}})))
    {:output (str "There is no setting named '" key "'. Use list_settings to discover available settings.")}))
