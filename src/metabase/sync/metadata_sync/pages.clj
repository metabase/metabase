(ns metabase.sync.metadata-sync.pages
  "How the metadata of a Database is cut into the parts that one answer holds.

  The metadata is sent as three kinds, in this order: the objects (Table documents) of every Table, then the links of
  every Table, then the stats of every Table. So the Tables that a link points at are on the receiver before the link.
  Each kind is sent in key order, and a cursor says where the next answer starts. The sender keeps no state: a cursor
  holds all of it. These are pure functions: they read nothing."
  (:require
   [metabase.sync.metadata-sync.document :as document]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def kinds
  "The kinds of part, in the order they are sent."
  ["objects" "links" "stats"])

(mr/def ::cursor
  "Where an answer starts: the kind of part, and the key of the last Table that an earlier answer covered of that
  kind. No key is the start of the kind."
  [:map {:closed true}
   [:kind (into [:enum] kinds)]
   [:key  {:optional true} [:maybe ::document/key]]])

(def object-field-limit
  "The soft limit of the weight of the objects in one answer. A Table weighs its described Fields and one more, so
  this is about 20,000 Fields: about 10 MB as JSON."
  20000)

(def link-limit
  "The soft limit of the FK links in one answer. The receiver writes each FK through the Field model, as sync does, so
  this also bounds the statements of one apply."
  2000)

(def stats-field-values-limit
  "The soft limit of the FieldValues rows whose stats one answer reads. A Table with a row count and no FieldValues
  weighs one. Stats are also cut by size, see [[stats-byte-limit]]."
  2000)

(def stats-read-tables
  "The most Tables whose stats one read of the sender's app DB loads. A page stops reading once its stats pass
  [[stats-byte-limit]], so it reads at most this many Tables that it does not send."
  50)

(def stats-byte-limit
  "The soft limit of the size of the stats in one answer, in bytes as JSON: about the size of an answer of objects."
  10000000)

(defn page
  "The next of `tables` after the key `after`, or from the start when it is nil, whose weights add up to at most
  `limit`: `{:tables [...] :more boolean}`. `tables` are in key order, and `weight` gives a Table's weight. A page
  always holds one Table when any is left, also one that is heavier than the limit, so each page moves on."
  [tables weight after limit]
  (let [remaining (cond->> tables
                    after (drop-while #(not (pos? (compare (document/table-key %) after)))))
        taken     (reduce (fn [taken table]
                            (let [total (+ (:total (meta taken)) (weight table))]
                              (if (and (seq taken) (> total limit))
                                (reduced taken)
                                (with-meta (conj taken table) {:total total}))))
                          (with-meta [] {:total 0})
                          remaining)]
    {:tables (vec taken)
     :more   (< (count taken) (count remaining))}))

(defn next-cursor
  "The cursor of the answer after one of `kind` whose last covered Table has the key `last-key`, or nil when that
  answer was the last. `more?` says whether Tables of `kind` are left."
  [kind last-key more?]
  (if more?
    {:kind kind :key last-key}
    (when-let [next-kind (second (drop-while #(not= kind %) kinds))]
      {:kind next-kind})))
