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

(defn storage-context
  "A fresh storage context whose paths come from [[layout]]."
  []
  (serialization/storage-context layout))

(defn current-move-rule
  "Today's rule. A full export writes every item at its computed path. An incremental export writes each changed
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
  "Rule (b) of the layout spec: every item moves to its computed path at each push. Changed items move as with
  [[current-move-rule]]; an unchanged item whose stored path differs from its computed one makes the push a full
  export. So the first push after a change of layout moves every file in one commit, and a push with no layout change
  moves nothing. Each incremental export extracts every synced item to compute its path."
  [{:keys [export status stored-path computed-path] :as item}]
  (if (and (= :incremental export)
           (= "synced" status)
           (not= (not-empty stored-path) @computed-path))
    :remote-sync/incremental-not-possible
    (current-move-rule item)))

(def move-rule
  "The move rule remote sync exports with. It is called once per item, with:
  - `:export`        `:full` (every managed file is deleted first) or `:incremental` (only the files named are touched)
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
