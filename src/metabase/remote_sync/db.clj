(ns metabase.remote-sync.db
  "Application database queries for the remote sync module, and the HoneySQL clauses selecting the rows it syncs."
  (:require
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.remote-sync.spec :as remote-sync.spec]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def ^:private all-rows-filter-clause
  "The HoneySQL where-clause selecting every row."
  [:= 1 1])

(defn- synced-filter-clause
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting the rows remote sync syncs,
  all of them unless its spec says otherwise, with `opts` (see `::remote-sync.schema/synced-filter-opts`)."
  [model alias opts]
  (if-let [clause (:synced-filter-clause (remote-sync.spec/spec model))]
    (clause alias opts)
    all-rows-filter-clause))

(mu/defn built-in-filter-clause :- [:fn vector?]
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting the rows every instance has
  with the same entity id, none unless its spec says otherwise."
  [model :- :keyword
   alias :- :keyword]
  (if-let [clause (:built-in-filter-clause (remote-sync.spec/spec model))]
    (clause alias)
    [:= 1 0]))

(mu/defn synced-ids-clause :- [:fn map?]
  "The HoneySQL query selecting the primary keys of the rows of `model` remote sync syncs, with `opts`."
  [model :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (let [table (t2/table-name model)
        alias (keyword (str "synced_" (name table)))]
    ^:allow-subquery {:select [(u/qualified-key alias (first (t2/primary-keys model)))]
                      :from   [[table alias]]
                      :where  (synced-filter-clause model alias opts)}))

(mu/defn synced-fk-clause :- [:fn vector?]
  "The HoneySQL where-clause holding when `column` of the table aliased `alias` references a row of `model` remote sync
  syncs, with `opts`."
  [alias  :- :keyword
   column :- :keyword
   model  :- :keyword
   opts   :- ::remote-sync.schema/synced-filter-opts]
  [:in (u/qualified-key alias column) (synced-ids-clause model opts)])
