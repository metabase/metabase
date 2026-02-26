(ns metabase.release-flags.models
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.release-flags.schema :as schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ReleaseFlag [_model] :release_flag)

(methodical/defmethod t2/primary-keys :model/ReleaseFlag [_model] [:flag])

(doto :model/ReleaseFlag
  (derive :metabase/model))

(mu/defn all-flags :- schema/FlagMap
  "Returns a map of flag name to its data (description, start_date, is_enabled)."
  []
  (into {}
        (map (fn [{:keys [flag] :as row}]
               [flag (dissoc row :flag)]))
        (t2/select :model/ReleaseFlag)))

(mu/defn update-statuses!
  "Takes a map of flag name to enabled status and updates each flag's is_enabled accordingly."
  [statuses :- schema/StatusMap]
  (doseq [[flag enabled?] statuses]
    (let [flag (if (keyword? flag)
                 (if (namespace flag)
                   (str (namespace flag) "/" (name flag))
                   (name flag))
                 flag)]
      (t2/update! :model/ReleaseFlag :flag flag {:is_enabled enabled?}))))

(mu/defn delete-flags! :- :int
  "Deletes the given set of flags from the release_flag table. Returns the number deleted."
  [flag-names :- [:set :string]]
  (if (seq flag-names)
    (t2/delete! :model/ReleaseFlag :flag [:in flag-names])
    0))

(mu/defn upsert-flag!
  "Inserts or updates a release flag with the given name, description, and start_date."
  [flag-name :- :string
   description :- [:maybe :string]
   start-date :- :any]
  (t2/with-transaction [_conn]
    (if (t2/exists? :model/ReleaseFlag :flag flag-name)
      (t2/update! :model/ReleaseFlag :flag flag-name
                  {:description description
                   :start_date start-date})
      (t2/insert! :model/ReleaseFlag {:flag        flag-name
                                      :description description
                                      :start_date  start-date}))))

(defn- env-str
  "Looks up a config key from environ (env vars, JVM properties, .lein-env).
   Returns the string value or nil."
  [k]
  (let [v (get env/env k)]
    (when-not (str/blank? v)
      (str/trim v))))

(mu/defn- release-flags-enabled? :- :boolean
  "Returns true if the release flags system is active.
   This is the case in dev/test mode or when the MB_ENABLE_RELEASE_FLAGS env var is truthy."
  []
  (boolean
   (or (not= "prod" (or (env-str :mb-run-mode) "prod"))
       (let [enable-str (env-str :mb-enable-release-flags)]
         (and enable-str
              (not= "false" enable-str)
              (not= "0" enable-str))))))

(mu/defn has-release-flag? :- :boolean
  "Is this release flag enabled?
  If the release flag does not exist, always returns false.
  If running in prod mode, always returns false."
  [flag :- schema/FlagName]
  (boolean
   (when (release-flags-enabled?)
     (let [flag (if (keyword? flag)
                  (if (namespace flag)
                    (str (namespace flag) "/" (name flag))
                    (name flag))
                  flag)]
       (t2/select-one-fn :is_enabled :model/ReleaseFlag :flag flag)))))
