(ns metabase-enterprise.remote-sync.layout
  "Where remote sync writes each item in the repository. Two functions decide it, and each one is a var to swap:
  - [[layout]] maps an item to its path (through the storage context of [[storage-context]]);
  - [[move-rule]] takes an item's computed path, its stored path and its sync status, and returns the file to write
    and the files to delete."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(def layout
  "The layout remote sync writes: a function of a storage context and an extracted entity that returns the entity's
  resolved path (see [[serialization/storage-context]])."
  serialization/default-layout)

(def git-sync-extract-opts
  "Serdes extraction opts for git sync."
  {:include-field-values     false
   :include-database-secrets false
   :continue-on-error        false
   :skip-archived            true})

(defn storage-context
  "A fresh storage context whose paths come from [[layout]]; a table's file holds no schema."
  []
  (serialization/storage-context layout {:table-schema? false :extract-opts git-sync-extract-opts}))

(defn kind-layout?
  "Whether [[layout]] is the kind layout."
  []
  (identical? serialization/kind-layout layout))

(defn library-without-files?
  "Whether [[layout]] gives the Library's own collections no files, so that the repository holds only the Library's
  content."
  []
  (kind-layout?))

(defn tables-in-own-files?
  "Whether [[layout]] writes each table to a file of its own, which holds the table's settings, columns and
  remappings, so that remote sync writes the table rather than walking through it."
  []
  (kind-layout?))

(defn current-move-rule
  "A full export writes every item at its computed path. An incremental export writes each changed
  item at its computed path and deletes its stored file when that differs; a moved collection needs a full export,
  since its path is the folder of its contents. It leaves unchanged items where they are."
  [{:keys [export model-type status stored-path computed-path]}]
  (cond
    (= :full export)                         {:write @computed-path}
    (= "synced" status)                      nil
    (or (= "create" status)
        (str/blank? stored-path)
        (= stored-path @computed-path))      {:write @computed-path}
    (= "Collection" model-type)              :remote-sync/incremental-not-possible
    :else                                    {:write @computed-path :delete [stored-path]}))

(defn move-every-item
  "Every item moves to its computed path at each push. Changed items move as with
  [[current-move-rule]]; an unchanged item whose stored path differs from its computed one makes the push a full
  export. So the first push after a change of layout moves every file in one commit, and a push with no layout change
  moves nothing. Each incremental export extracts every synced item to compute its path."
  [{:keys [export status stored-path computed-path] :as item}]
  (if (and (= :incremental export)
           (= "synced" status)
           (not= (not-empty stored-path) @computed-path))
    :remote-sync/incremental-not-possible
    (current-move-rule item)))

(defn move-changed-items
  "Moves only the changed items. Every export leaves an unchanged item at its stored path, the merged export included;
  a changed item moves to its computed path as with [[current-move-rule]]."
  [{:keys [export status stored-path] :as item}]
  (if (and (= :full export) (= "synced" status) (not (str/blank? stored-path)))
    {:write stored-path}
    (current-move-rule item)))

(def move-rule
  "The move rule remote sync exports with. It is called once per item, with:
  - `:export`        `:full` (every managed file is deleted first: a full export, and the merged export when the
                     remote moved ahead) or `:incremental` (only the files named are touched)
  - `:model-type`    the item's serdes model name
  - `:status`        its RemoteSyncObject status: `\"synced\"`, `\"create\"` or `\"update\"` (`\"create\"` for an item
                     no RemoteSyncObject tracks)
  - `:stored-path`   the path its RemoteSyncObject records, or nil
  - `:computed-path` a delay of the path [[layout]] gives it; deref it only when needed, as for an unchanged item in an
                     incremental export it extracts the item.
  It returns `{:write path :delete [path ...]}` (either key may be absent), nil to touch nothing, or
  `:remote-sync/incremental-not-possible` to make an incremental export a full one. In a full export it must return a
  `:write`."
  current-move-rule)
