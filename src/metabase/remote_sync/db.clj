(ns metabase.remote-sync.db
  "Application database queries for the remote sync module, and the HoneySQL clauses selecting the rows it syncs."
  (:require
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.remote-sync.spec :as remote-sync.spec]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]))

(def all-rows-filter-clause
  "The HoneySQL where-clause selecting every row."
  (t2/fragment [:= 1 1]))

(mu/defn synced-filter-clause :- [:fn vector?]
  "The HoneySQL where-clause over the columns of `model`'s table selecting the rows remote sync syncs, all of them
  unless its spec says otherwise, with `opts`."
  [model :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (if-let [clause (:synced-filter-clause (remote-sync.spec/spec model))]
    (clause opts)
    all-rows-filter-clause))

(mu/defn built-in-filter-clause :- [:fn vector?]
  "The HoneySQL where-clause over the columns of `model`'s table selecting the rows every instance has with the same
  entity id, none unless its spec says otherwise."
  [model :- :keyword]
  (if-let [clause (:built-in-filter-clause (remote-sync.spec/spec model))]
    (clause)
    (t2/fragment [:= 1 0])))

(defn- ids-query
  "The HoneySQL query selecting the primary keys of the rows of `model` matching `where`, from the `:ids-query` of its
  spec."
  [model where]
  (if-let [query (:ids-query (remote-sync.spec/spec model))]
    (query where)
    (throw (ex-info (str "The remote sync spec of " model " has no :ids-query") {:model model}))))

(mu/defn synced-ids-clause :- [:fn map?]
  "The HoneySQL query selecting the primary keys of the rows of `model` remote sync syncs, with `opts`."
  [model :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  (ids-query model (synced-filter-clause model opts)))

(defn- read-only-filter-clause
  "The HoneySQL where-clause over the columns of `model`'s table selecting its read-only rows: those synced, archived or
  not, since unarchiving one makes it synced again, or on every instance, which a read-only instance can't write."
  [model]
  (t2/fragment [:or (synced-filter-clause model {:include-archived? true}) (built-in-filter-clause model)]))

(mu/defn read-only-pks :- [:set ::remote-sync.schema/pk]
  "The primary keys of the read-only rows of `model` (see [[read-only-filter-clause]])."
  [model :- :keyword]
  (set (t2/select-pks-set model {:where (read-only-filter-clause model)})))

(mu/defn read-only-row? :- :boolean
  "Whether the row of `model` with the primary key `pk` is read-only (see [[read-only-filter-clause]])."
  [model :- :keyword
   pk    :- ::remote-sync.schema/pk]
  (t2/exists? model :toucan/pk pk {:where (read-only-filter-clause model)}))

(mu/defn read-only-pks-among :- [:set ::remote-sync.schema/pk]
  "The primary keys among `pks` of the read-only rows of `model` (see [[read-only-filter-clause]])."
  [model :- :keyword
   pks   :- [:sequential ::remote-sync.schema/pk]]
  (if (seq pks)
    (set (t2/select-pks-set model :toucan/pk [:in pks] {:where (read-only-filter-clause model)}))
    #{}))
