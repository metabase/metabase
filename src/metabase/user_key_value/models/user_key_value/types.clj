(ns metabase.user-key-value.models.user-key-value.types
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.io File)
   (java.nio.file
    FileSystems
    Files
    OpenOption
    Path
    StandardWatchEventKinds
    WatchEvent
    WatchKey
    WatchService)))

(set! *warn-on-reflection* true)

(defn- file->namespace [^File f]
  (keyword "namespace" (-> f .getName (str/replace #"\.edn$" ""))))

(mr/def ::namespace
  "A namespace for the key-value pair"
  [:and
   {;; api request comes in, turn `foo` into `:namespace/foo`
    :decode/api-request (partial keyword "namespace")
    :encode/api-request name
    ;; writing to the DB, turn `:namespace/foo` into `foo`
    :encode/database name
    ;; reading from the DB, turn `foo` into `:namespace/foo`
    :decode/database (partial keyword "namespace")}
   :keyword])

(mr/def ::expires-at
  "When the key-value pair expires"
  :time/instant)

(mu/defn- defnamespace
  "Declare a new namespace with a schema for the value"
  [namespace :- ::namespace
   schema]
  (derive namespace ::registered-namespace)
  (mr/register! namespace schema))

(defn- known-namespaces
  []
  (descendants ::registered-namespace))

;;; this is just a placeholder so LSP can register the place it lives for jump-to-definition functionality. Actual
;;; schema gets created below by [[user-key-value-schema]] and [[update-user-key-value-schema]]
(mr/def ::user-key-value any?)

(defn- user-key-value-schema
  "Build the schema for a `::user-key-value`"
  []
  [:and
   [:map
    [:expires-at [:maybe ::expires-at]]
    [:namespace ::namespace]
    [:value {:encode/database json/encode
             :decode/database #(json/decode % keyword)}
     :any]]
   (into [:multi
          {:dispatch :namespace}]
         (map (fn [namespace]
                [namespace namespace]))
         (known-namespaces))])

(defn- update-user-key-value-schema! []
  (log/debug "Updating user-key-value schema")
  (mr/register! ::user-key-value (user-key-value-schema)))

(update-user-key-value-schema!)

(def ^:private types-dir "user_key_value_types")

(defn- load-schema!
  "Loads a schema with the provided namespace"
  [schema namespace]
  (defnamespace namespace schema)
  (update-user-key-value-schema!))

(defn- load-schema-from-file!
  "Load a schema from an EDN file, using its filename as the namespace."
  [^File file]
  (let [namespace (file->namespace file)
        schema  (-> file slurp edn/read-string)]
    (load-schema! schema namespace)))

(defn watch-directory!
  "Only used in dev. Watch a directory for changes and call the callback with the affected file."
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

(defn handle-file-change!
  "Only used in dev. Handle a file change in the types directory."
  [^File file action]
  (case action
    :create (load-schema-from-file! file)
    :modify (load-schema-from-file! file)
    :delete (let [namespace (file->namespace file)]
              ;; this is kind of silly. we don't have a way to delete something from the registry, so just hackily
              ;; make a schema that can't ever be valid. In production, we're not going to be watching files, so
              ;; this is solely for dev.
              (defnamespace namespace [:and true? false?]))))

(defn load-all-schemas-prod!
  "Loads all type schemas from the a given resource path. This is the production code path which doesn't implement
  file-watching, and works when running in a JAR."
  [dir]
  (u.files/with-open-path-to-resource [dir dir]
    (with-open [ds (Files/newDirectoryStream dir)]
      (let [schemas (reduce
                     (fn [acc ^Path file]
                       (let [schema (try
                                      (-> file
                                          (Files/newInputStream (u/varargs OpenOption))
                                          slurp
                                          edn/read-string)
                                      (catch Throwable e
                                        (throw
                                         (ex-info (format "Error loading schema %s: %s" (str file) (ex-message e))
                                                  {}
                                                  e))))
                             namespace (keyword "namespace"
                                                (-> file
                                                    .getFileName
                                                    (str/replace #"\.edn$" "")))]
                         (conj acc [schema namespace])))
                     []
                     ds)]
        (doseq [[schema namespace] schemas]
          (load-schema! schema namespace))
        (update-user-key-value-schema!)))))

(defn load-and-watch-schemas!
  "In production, just load the schemas. In development, watch for changes as well."
  []
  (load-all-schemas-prod! types-dir)
  ;; in dev, watch both types directories for changes
  (when config/is-dev?
    (try
      (watch-directory! (io/file (io/resource types-dir)) handle-file-change!)
      (catch Exception e
        (log/warn e "Could not watch UserKeyValue schema directory!")))))
