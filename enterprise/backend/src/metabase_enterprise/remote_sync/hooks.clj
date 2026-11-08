(ns metabase-enterprise.remote-sync.hooks
  "The read-only guard of remote sync: on a read-only instance, synced rows can't be inserted, changed, or deleted,
  except by remote sync itself, which writes while deserializing."
  (:require
   [metabase-enterprise.remote-sync.core :as remote-sync]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- read-only-context
  "The remote sync context when synced rows are read-only, or nil when they can be written."
  []
  (when-not mi/*deserializing?*
    (let [ctx (remote-sync/context)]
      (when (:read-only? ctx)
        ctx))))

(defn- check-not-synced!
  "Throws when the row of `model` with the primary key `pk` is synced under `ctx`."
  [model pk ctx]
  (when (seq (remote-sync/synced-pks model [pk] ctx))
    (throw (ex-info (tru "This content is managed by remote sync and can''t be changed on this instance.")
                    {:status-code 403 :model model :id pk}))))

(defn- check-row!
  "Throws when `row` of `model` is synced on a read-only instance."
  [model row]
  (when-let [ctx (read-only-context)]
    (check-not-synced! model (get row (first (t2/primary-keys model))) ctx)))

(defenterprise after-insert
  "Throws when `row` of `model`, just inserted, is synced on a read-only instance."
  :feature :none
  [model row]
  (check-row! model row))

(defn- export-changes?
  "Whether the changes of `row` of `model` change what an export of it holds."
  [model row]
  (let [original (t2/original row)
        exported (serialization/export-batch model [original (merge original (t2/changes row))])]
    (or (some #(instance? Exception %) exported)
        (not= (first exported) (second exported)))))

(defenterprise before-update
  "Throws when `row` of `model`, about to change what an export holds, is synced on a read-only instance, before the
  update or, with its changes, just before the update commits."
  :feature :none
  [model row]
  (when (seq (select-keys (t2/changes row) (serialization/columns model)))
    (when-let [ctx (read-only-context)]
      (when (export-changes? model row)
        (let [pk (get row (first (t2/primary-keys model)))]
          (check-not-synced! model pk ctx)
          (app-db/do-before-commit #(check-not-synced! model pk ctx)))))))

(defenterprise before-delete
  "Throws when `row` of `model`, about to be deleted, is synced on a read-only instance."
  :feature :none
  [model row]
  (check-row! model row))
