(ns metabase.serialization.protocol.memoized
  "A [[metabase.serialization.protocol/Store]] that reads each row of another store at most once, for the life of one
  piece of work, such as one API response, whose walks and exports name the same rows many times. It never sees
  writes made after its reads, so it must not outlive that work."
  (:require
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.spec :as serialization.spec]))

(set! *warn-on-reflection* true)

(defn store
  "A store of the rows of `inner` that reads the rows of each model, primary key and set of columns from `inner` once,
  missing rows included, and answers later reads of them from what it read."
  [inner]
  (let [read (atom {})]
    (reify protocol/Store
      (select-by-pks [_ model pks columns]
        (let [k       [model columns]
              unread  (into #{} (remove (get @read k {})) pks)]
          (when (seq unread)
            (let [pk    (serialization.spec/primary-key model)
                  found (into {} (map (juxt #(get % pk) identity)) (protocol/select-by-pks inner model unread columns))]
              (swap! read update k merge (into found (map (fn [id] [id (get found id ::missing)])) unread))))
          (let [rows (get @read k)]
            (into [] (keep #(let [row (get rows %)] (when-not (= ::missing row) row))) pks))))
      (select-by-refs [_ model refs columns]
        (protocol/select-by-refs inner model refs columns))
      (select-by-parent-pks [_ model parent-pks columns]
        (protocol/select-by-parent-pks inner model parent-pks columns))
      (transact [_ opts f]
        (protocol/transact inner opts f)))))
