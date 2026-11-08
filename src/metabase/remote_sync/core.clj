(ns metabase.remote-sync.core
  "Which rows of each model remote sync syncs, as a HoneySQL where-clause each model defines."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti synced-where
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting the rows remote sync syncs
  under the remote sync context `ctx`, or nil when it syncs none."
  {:arglists '([model alias ctx])}
  (fn [model _alias _ctx] model))

(defmethod synced-where :default
  [_model _alias _ctx]
  nil)

(defn synced-models
  "The models that define which of their rows remote sync syncs."
  []
  (sort (remove #{:default} (keys (methods synced-where)))))

(mu/defn synced-ids :- [:fn map?]
  "The HoneySQL query selecting the primary keys of the rows of `model` remote sync syncs under `ctx`."
  [model :- :keyword
   ctx   :- ::remote-sync.schema/context]
  (let [table (t2/table-name model)
        alias (keyword (str "synced_" (name table)))]
    ^:allow-subquery {:select [(u/qualified-key alias (first (t2/primary-keys model)))]
                      :from   [[table alias]]
                      :where  (or (synced-where model alias ctx) [:= 1 0])}))

(defenterprise editable?
  "Whether the row of `model` with the primary key `pk` can be changed, which a synced row can't on a read-only
  instance; a nil `pk`, of a row not saved yet, is left to the read-only hook."
  metabase-enterprise.remote-sync.core
  [_model _pk]
  true)

(defenterprise read-only-pks
  "The set of those of `pks` whose rows of `model` can't be changed (see [[editable?]])."
  metabase-enterprise.remote-sync.core
  [_model _pks]
  #{})
