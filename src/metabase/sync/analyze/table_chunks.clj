(ns metabase.sync.analyze.table-chunks
  "The Tables of a sync step in chunks, and chunks in groups whose Fields fit in memory together, so that the step reads
  and saves the Fields of many Tables at once."
  (:require
   [metabase.sync.util :as sync-util]))

(def tables-per-chunk
  "The number of Tables whose Fields a sync step reads with one statement."
  1000)

(def fields-per-read
  "The number of Fields a sync step reads and saves at once when it does not need all the Fields of a Table together."
  1000)

(defn chunks
  "Reducible `tables` in chunks of [[tables-per-chunk]]."
  [tables]
  (eduction (partition-all tables-per-chunk) tables))

(defn- chunk-groups
  "`tables` in order, in groups whose Fields, by `table-id->count`, each Table's capped at `budget`, add up to at most
  `budget`."
  [tables table-id->count budget]
  (let [size           #(min budget (get table-id->count (:id %) 0))
        [groups group] (reduce (fn [[groups group total] table]
                                 (let [n (size table)]
                                   (if (and (seq group) (> (+ total n) budget))
                                     [(conj groups group) [table] n]
                                     [groups (conj group table) (+ total n)])))
                               [[] [] 0]
                               tables)]
    (cond-> groups
      (seq group) (conj group))))

(defn groups
  "Reducible `tables` in order, in groups whose Fields add up to at most `budget`, each Table's capped at `budget`,
  counted a chunk at a time by `field-counts`, a function of Table ids that returns `{table-id count}`."
  [tables field-counts budget]
  (eduction (comp (partition-all tables-per-chunk)
                  (mapcat (fn [chunk] (chunk-groups chunk (field-counts (mapv :id chunk)) budget))))
            tables))

(defn save-by-table!
  "Call `save!` with `rows` at once, or with the rows of each Table, by `row-table-id`, when that throws an Exception or
  when they are of one Table, logging a failure as one of saving `what` of the Table `name-table` names by its id; return the ids of
  the Tables whose rows were not saved."
  [what name-table row-table-id save! rows]
  (let [by-table    (group-by row-table-id rows)
        save-table! (fn [[table-id table-rows]]
                      (when (instance? Throwable
                                       (sync-util/with-error-handling
                                        (format "Error saving %s of %s" what (name-table table-id))
                                         (save! table-rows)))
                        table-id))]
    (if (or (nil? (next by-table))
            (instance? Throwable (sync-util/rethrow-fatal (sync-util/with-error-handling (format "Error saving %s" what)
                                                            (save! rows)))))
      (into #{} (keep save-table!) by-table)
      #{})))

(defn table-name
  "A function of the id of one of `tables` that names it in the log."
  [tables]
  (comp sync-util/name-for-logging (into {} (map (juxt :id identity)) tables)))
