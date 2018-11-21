(ns metabase.cmd.serialization
  (:require [metabase.db :as mdb]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.serialization
             [dump :as dump]
             [load :as load]])
  (:refer-clojure :exclude [load]))

(defn load
  [path]
  (mdb/setup-db-if-needed!)
  (-> {}
      (load/load path Collection)
      (load/load path Database)))


(defn- dump-all
  [path entities]
  (doseq [e entities]
    (dump/dump path e)))

(defn dump
  [path]
  (mdb/setup-db-if-needed!)
  (dump-all path (Database))
  (dump-all path (Table))
  (dump-all path (Field))
  (dump-all path (Metric))
  (dump-all path (Segment))
  (dump-all path (Collection))
  (dump-all path (Card))
  (dump-all path (Dashboard)))
