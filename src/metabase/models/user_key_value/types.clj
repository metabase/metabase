(ns metabase.models.user-key-value.types
  (:require
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.io File)
   (java.nio.file FileSystems
                  Path
                  StandardWatchEventKinds
                  WatchKey
                  WatchService
                  WatchEvent)))

(set! *warn-on-reflection* true)

(defn- file->context [^File f]
  (keyword "context" (-> f .getName (str/replace #"\.edn$" ""))))

(mr/def ::context
  "A context for the key-value pair"
  [:and
   {;; api request comes in, turn `foo` into `:context/foo`
    :decode/api-request (partial keyword "context")
    ;; writing to the DB, turn `:context/foo` into `foo`
    :encode/database name
    ;; reading from the DB, turn `foo` into `:context/foo`
    :decode/database (partial keyword "context")}
   :keyword])

(mu/defn defcontext
  "Declare a new context with a schema for the value"
  [context :- ::context
   schema]
  (derive context ::registered-context)
  (mr/register! context schema))

(defn- known-contexts
  []
  (descendants ::registered-context))

;;; this is just a placeholder so LSP can register the place it lives for jump-to-definition functionality. Actual
;;; schema gets created below by [[user-key-value-schema]] and [[update-user-key-value-schema]]
(mr/def ::user-key-value any?)

(defn- user-key-value-schema
  "Build the schema for a `::user-key-value`"
  []
  [:and
   [:map
    [:context ::context]
    [:value {:encode/database json/generate-string
             :decode/database json/parse-string}
     :any]]
   (into [:multi
          {:dispatch :context}]
         (map (fn [context]
                [context context]))
         (known-contexts))])

(defn- update-user-key-value-schema! []
  (log/debug "Updating user-key-value schema")
  (mr/register! ::user-key-value (user-key-value-schema)))

(update-user-key-value-schema!)

;; Types live in `resources/user_key_value_types`

(defn- types-dirs
  "Types live in `user_key_value_types`, in both `test_resources` and `resources`."
  []
  (->> (classpath/classpath-directories)
       (map #(io/file % "user_key_value_types"))
       (filter #(.exists ^File %))))

(defn- types-files []
  (->> (types-dirs)
       (mapcat #(file-seq (io/file %)))
       (filter #(.isFile ^File %))
       distinct))

(defn- load-schema
  "Load a schema from an EDN file, using its name as the context."
  [^File file]
  (let [context (file->context file)
        schema  (-> file slurp edn/read-string)]
    (defcontext context schema)
    (update-user-key-value-schema!)))

(defn load-all-schemas
  "Load all schemas from the types directory."
  []
  (doseq [^File file (types-files)]
    (when (str/ends-with? (.getName file) ".edn")
      (load-schema file))))

(defn watch-directory
  "Watch a directory for changes and call the callback with the affected file."
  [dir callback]
  (let [^WatchService watcher (.newWatchService (FileSystems/getDefault))
        ^Path path    (.toPath (io/file dir))]
    (.register path watcher
               (into-array [StandardWatchEventKinds/ENTRY_CREATE
                            StandardWatchEventKinds/ENTRY_MODIFY
                            StandardWatchEventKinds/ENTRY_DELETE]))
    (future
      (loop []
        (when-let [^WatchKey key (.take watcher)]
          (doseq [^WatchEvent event (.pollEvents key)]
            (let [kind (.kind event)
                  filename (.context event)
                  file (io/file dir (.toString filename))]
              (cond
                (= kind StandardWatchEventKinds/ENTRY_CREATE) (callback file :create)
                (= kind StandardWatchEventKinds/ENTRY_MODIFY) (callback file :modify)
                (= kind StandardWatchEventKinds/ENTRY_DELETE) (callback file :delete))))
          (.reset key)
          (recur))))))

(defn handle-file-change
  "Handle a file change in the types directory."
  [^File file action]
  (case action
    :create (load-schema file)
    :modify (load-schema file)
    :delete (let [context (file->context file)]
              ;; this is kind of silly. we don't have a way to delete something from the registry, so just hackily
              ;; make a schema that can't ever be valid. In production, we're not going to be watching files, so
              ;; this is solely for dev.
              (defcontext context [:and true? false?]))))

(defn load-and-watch-schemas
  "In production, just load the schemas. In development, watch for changes as well."
  []
  (load-all-schemas)
  (when config/is-dev?
    (doseq [types-dir (types-dirs)]
      (watch-directory types-dir handle-file-change))))

#_{:clj-kondo/ignore [:unused-private-var]}
(defonce ^:private watcher (load-and-watch-schemas))
