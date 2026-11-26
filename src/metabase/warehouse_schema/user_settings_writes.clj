(ns metabase.warehouse-schema.user-settings-writes
  "The bookkeeping the write functions of FieldUserSettings and TableUserSettings share, each function taking the
  `spec` of its model: `:model`, the `:topics` of its `:create`, `:update` and `:delete` events, and the
  `metabase.warehouse-schema.db` functions `:settings-by-ids`, `:empty-settings` and `:delete-empty-settings!`, the last
  two taking the ids of the Fields or Tables the settings belong to."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.util :as u]
   [toucan2.tools.before-update :as t2.before-update]))

(set! *warn-on-reflection* true)

(defn- updated-settings
  "The settings `previous`, an instance of `model`, as an update of `changes` leaves them, with the flags their
  before-update sets and the `:updated_at` they had."
  [model previous changes]
  (-> (t2.before-update/before-update model (merge previous changes))
      (assoc :updated_at (:updated_at previous))))

(defn add-created
  "`writes`, the writes of one call as `{id {:before row :after row}}`, with `:before` nil for a row the call created
  and `:after` `::deleted` for one it deleted, with the creation of the settings `rows`, the inserted instances."
  [writes rows]
  (reduce #(assoc %1 (:id %2) {:before nil :after %2}) writes rows))

(defn add-updated
  "`writes` with the update of the settings `rows` of the model of `spec`, as they were read, by the changes
  `changes-of` gives for each."
  [writes {:keys [model]} rows changes-of]
  (reduce (fn [writes row]
            (let [{:keys [before after] :as write} (get writes (:id row))
                  current                          (if write after row)]
              (cond-> writes
                (not= ::deleted current)
                (assoc (:id row) {:before (if write before row)
                                  :after  (updated-settings model current (changes-of row))}))))
          writes
          rows))

(defn- add-deleted
  "`writes` with the delete of the settings `rows`, as they were read."
  [writes rows]
  (reduce (fn [writes row]
            (let [write (get writes (:id row))]
              (assoc writes (:id row) {:before (if write (:before write) row) :after ::deleted})))
          writes
          rows))

(defn delete-empty!
  "Delete the settings of the model of `spec`, among those of the Fields or Tables with `parent-ids`, that hold no user
  value and no true flag, in batches of [[app-db/delete-partition-size]] parents, returning `writes` with their
  deletes."
  [writes {:keys [empty-settings delete-empty-settings!]} parent-ids]
  (reduce (fn [writes batch]
            (let [parent-ids (vec batch)
                  rows       (empty-settings parent-ids)]
              (u/prog1 (add-deleted writes rows)
                (when (seq rows)
                  (delete-empty-settings! parent-ids)))))
          writes
          (partition-all app-db/delete-partition-size (into [] (distinct) parent-ids))))

(defn- deleted-rows
  "The rows, as they were before the call, of the settings that `writes` deletes and that existed before the call."
  [writes]
  (into [] (keep (fn [{:keys [before after]}] (when (and before (= ::deleted after)) before))) (vals writes)))

(defn publish-writes!
  "Publish the deletes, the creates and the updates that change something of `writes`, one event of each of the
  `:topics` of `spec` for the call, with the `:context` and `:writer` of `opts`."
  ([writes spec]
   (publish-writes! writes spec nil))
  ([writes {:keys [topics]} opts]
   (let [live    (into {} (remove #(= ::deleted (:after (val %)))) writes)
         updated (into {} (filter (comp :before val)) live)]
     (when-let [deleted (not-empty (deleted-rows writes))]
       (events/publish-event! (:delete topics) (events/delete-event deleted opts)))
     (events/publish-event! (:create topics)
                            (events/create-event (into [] (keep (fn [{:keys [before after]}] (when-not before after))) (vals live))
                                                 opts))
     (events/publish-event! (:update topics)
                            (events/update-event (update-vals updated :before)
                                                 (mapv #(hash-map :id %) (keys updated))
                                                 (assoc opts :objects (update-vals updated :after)))))))

(defn settings-by-id
  "The settings of the model of `spec` with `ids`, `{id row}`, read in batches of [[app-db/delete-partition-size]] ids."
  [{:keys [settings-by-ids]} ids]
  (into {}
        (comp (mapcat #(settings-by-ids (vec %))) (map (juxt :id identity)))
        (partition-all app-db/delete-partition-size ids)))
