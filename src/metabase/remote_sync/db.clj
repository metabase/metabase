(ns metabase.remote-sync.db
  "Application database queries for the remote sync module, and the HoneySQL clauses selecting the rows it syncs."
  (:require
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.remote-sync.spec :as remote-sync.spec]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def all-rows-filter-clause
  "The HoneySQL where-clause selecting every row."
  [:= 1 1])

(defn- synced-filter-clause
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting the rows remote sync syncs,
  all of them unless its spec says otherwise."
  [model alias]
  (if-let [clause (:synced-filter-clause (remote-sync.spec/spec model))]
    (clause alias)
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
  "The HoneySQL query selecting the primary keys of the rows of `model` remote sync syncs."
  [model :- :keyword]
  (let [table (t2/table-name model)
        alias (keyword (str "synced_" (name table)))]
    ^:allow-subquery {:select [(u/qualified-key alias (first (t2/primary-keys model)))]
                      :from   [[table alias]]
                      :where  (synced-filter-clause model alias)}))

(mu/defn synced-fk-clause :- [:fn vector?]
  "The HoneySQL where-clause holding when `column` of the table aliased `alias` references a row of `model` remote sync
  syncs."
  [alias  :- :keyword
   column :- :keyword
   model  :- :keyword]
  [:in (u/qualified-key alias column) (synced-ids-clause model)])

(defn- read-only-filter-clause
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting its read-only rows: those
  synced, or on every instance, which a read-only instance can't write."
  [model alias]
  [:or (synced-filter-clause model alias) (built-in-filter-clause model alias)])

(mu/defn read-only-pks :- [:set ::remote-sync.schema/pk]
  "The primary keys of the read-only rows of `model` (see [[read-only-filter-clause]])."
  [model :- :keyword]
  (into #{}
        (map :pk)
        (t2/query {:select [[(u/qualified-key :row (first (t2/primary-keys model))) :pk]]
                   :from   [[(t2/table-name model) :row]]
                   :where  (read-only-filter-clause model :row)})))

(mu/defn read-only-row? :- :boolean
  "Whether the row of `model` with the primary key `pk` is read-only (see [[read-only-filter-clause]])."
  [model :- :keyword
   pk    :- ::remote-sync.schema/pk]
  (boolean (seq (t2/query {:select [[[:inline 1] :one]]
                           :from   [[(t2/table-name model) :row]]
                           :where  [:and
                                    [:= (u/qualified-key :row (first (t2/primary-keys model))) pk]
                                    (read-only-filter-clause model :row)]
                           :limit  1}))))

(mu/defn not-read-only-filter-clause :- [:fn vector?]
  "The HoneySQL where-clause over the columns of `model`'s table, aliased `alias`, selecting the rows that aren't
  read-only (see [[read-only-filter-clause]])."
  [model :- :keyword
   alias :- :keyword]
  (let [pk (first (t2/primary-keys model))]
    [:not [:exists ^:allow-subquery {:select [[[:inline 1] :one]]
                                     :from   [[(t2/table-name model) :synced_row]]
                                     :where  [:and
                                              [:= (u/qualified-key :synced_row pk) (u/qualified-key alias pk)]
                                              (read-only-filter-clause model :synced_row)]}]]))
