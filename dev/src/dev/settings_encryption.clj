(ns dev.settings-encryption
  "Dump how every setting is stored at rest, so `./bin/mage settings-encryption-check` (run by CI on every PR) can diff a
  branch against its base and catch a setting whose `:encryption` flipped from `:no` to `:when-encryption-key-set`
  without a migration that encrypts the values a released version already stored plaintext -- the strict read would
  reject them. See `encrypt-settings-migrations` in `metabase.app-db.custom-migrations`.

  A dump is `{:settings {setting-name encryption}, :migrated #{setting-name}}`, where `:migrated` are the settings some
  migration encrypts. The mage command copies this file into a worktree of the base ref before dumping it, so it must
  keep working against a base that predates the migration registry."
  (:require
   [clojure.string :as str]
   [metabase.core.init]
   [metabase.settings.models.setting :as setting]))

(set! *warn-on-reflection* true)

(defn- source-setting?
  "Settings defined by `src` code, as opposed to fixtures a test namespace defines for itself."
  [{ns-symb :namespace}]
  (let [ns-str (name ns-symb)]
    (not (or (str/ends-with? ns-str "-test")
             (str/starts-with? ns-str "metabase.test.")))))

(defn dump
  "Every registered setting's `:encryption`, plus the settings a migration encrypts."
  []
  {:settings (into (sorted-map)
                   (comp (filter source-setting?)
                         (map (juxt :name :encryption)))
                   (vals @setting/registered-settings))
   :migrated (into (sorted-set)
                   (comp cat (map keyword))
                   (some-> (requiring-resolve 'metabase.app-db.custom-migrations/encrypt-settings-migrations)
                           deref
                           vals))})

(defn write-dump!
  "Write [[dump]] as EDN to `out`."
  [out]
  (spit out (pr-str (dump))))

(defn dump!
  "Cold-JVM entry point for `clojure -X:ee:dev dev.settings-encryption/dump! :out '\"path\"'`."
  [{:keys [out]}]
  (write-dump! (str out))
  (shutdown-agents))
