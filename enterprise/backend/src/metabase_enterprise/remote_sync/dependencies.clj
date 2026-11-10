(ns metabase-enterprise.remote-sync.dependencies
  "What synced content depends on that remote sync doesn't sync: of the rows of the app DB, which a change of the synced
  collections checks, and of the documents a push or pull keeps."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- built-in-keys
  "Those of the `[model ref]` keys `ks` of rows every instance has with the same entity id."
  [ks]
  (into #{}
        (mapcat (fn [[model model-keys]]
                  (let [eids (into [] (comp (map second) (filter string?)) model-keys)]
                    (map #(vector model %)
                         (remote-sync.db/built-in-entity-ids model eids)))))
        (group-by first ks)))

(defn missing-dependencies
  "For people, what the entities of `docs` depend on that is of a synced model but not among `docs` nor on every
  instance, keeping only the dependencies `dependency?` holds for, of the entities `referrer?` holds for."
  ([docs]
   (missing-dependencies docs (constantly true) (constantly true)))
  ([docs referrer? dependency?]
   (let [synced?   (set (remote-sync/synced-models))
         by-model  (reduce-kv (fn [m [model] doc] (update m model (fnil conj []) (:entity doc))) {} docs)
         escapes   (into {}
                         (filter (fn [[k]] (and (synced? (first k)) (dependency? k))))
                         (serialization/import-escapes by-model))
         built-in? (built-in-keys (keys escapes))]
     (for [[[model ref :as k] referrers] escapes
           :let  [referrers (filter referrer? referrers)]
           :when (and (not (built-in? k)) (seq referrers))]
       (tru "{0} uses {1} {2}, which isn''t synced. Sync it too, or remove the reference."
            (str/join ", " (map #(remote-sync.merge/label % (get docs %)) referrers))
            (name model)
            (if (sequential? ref) (str/join "." ref) ref))))))

(defn- unsynced-rows
  "The rows of `model` with the primary keys `pks` that not every instance has, by primary key."
  [model pks]
  (let [pk (first (t2/primary-keys model))]
    (into {}
          (map (juxt pk identity))
          (remote-sync.db/rows-not-built-in model pks))))

(defn unsynced-dependencies
  "The `{:model :row :used-by}` of each row of a synced model that isn't synced nor on every instance, yet synced rows
  depend on, `:used-by` holding the `[model row]` of the rows of exported models that depend on it."
  []
  (let [synced  (into {}
                      (map (juxt identity remote-sync.db/synced-rows))
                      (content/exported-models))
        rows    (into {}
                      (for [[model model-rows] synced
                            :let [pk (first (t2/primary-keys model))]
                            row model-rows]
                        [[model (get row pk)] row]))
        synced? (set (remote-sync/synced-models))
        escapes (into {} (filter (comp synced? ffirst)) (serialization/export-escapes synced))]
    (for [[model model-escapes] (group-by ffirst escapes)
          :let [found (unsynced-rows model (mapv (comp second key) model-escapes))]
          [[_ pk] referrers] model-escapes
          :let [row (get found pk)]
          :when row]
      {:model   model
       :row     row
       :used-by (mapv (fn [[referrer-model :as k]] [referrer-model (get rows k)]) referrers)})))
