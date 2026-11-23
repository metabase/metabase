(ns metabase.sync.analyze.table-chunks
  "The Tables of a sync step in chunks, and chunks in groups whose Fields fit in memory together, so that the step reads
  and saves the Fields of many Tables at once.")

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
