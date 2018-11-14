(ns metabase.cmd.serialization
  (:require [metabase.db :as mdb]
            [metabase.models
             [collection :refer [Collection]]
             [database :refer [Database]]]
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

(defn dump
  [path]
  (mdb/setup-db-if-needed!)
  (dump/dump-all path (Database))
  (dump/dump-all path (Collection)))
