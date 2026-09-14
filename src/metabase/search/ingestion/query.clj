(ns metabase.search.ingestion.query
  "Builds the app-DB queries that read the indexable rows of a search model from its `metabase.search.spec` spec.
  Query building only: `metabase.search.db` runs the queries, so this namespace must not require it."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def max-searchable-value-length
  "The maximum length of a searchable value. This is mostly driven by postgresql max-lengths on tsvector columns.
  And is about half of postgresql's max, since we concat two values together often. That is likely aggressive, but being safe until we can better understand normal data shapes"
  500000)

(defn searchable-value-trim-sql
  "Returns the honeysql expression to trim a searchable value to the max length.
  The passed column should be a keyword that is qualified as needed.
  Uses a slightly larger value that what will be stored in the db so we can better use word boundaries on the actual end"
  [column]
  (if (#{:postgres :h2} (mdb/db-type))
    [:left
     column
     [:cast (+ max-searchable-value-length 100) :integer]]
    column))

(defn- search-term-columns
  "Extract column names from search-terms spec for SQL query generation"
  [search-terms]
  (if (map? search-terms) (keys search-terms) search-terms))

(defn- attrs->select-items [attrs]
  (for [[k v] attrs
        :when (and v (not (search.spec/function-attr? v)))]
    (let [as (keyword (u/->snake_case_en (name k)))]
      (if (true? v) as [v as]))))

(defn- spec-index-query*
  [_db-type search-model]
  (let [spec         (search.spec/spec search-model)
        fn-deps      (search.spec/collect-fn-attr-req-fields spec)
        fn-selects   (map (fn [field]
                            [(keyword (str "this." (name field))) field])
                          fn-deps)
        search-terms (set (search-term-columns (:search-terms spec)))]
    (u/remove-nils
     {:select    (search.spec/qualify-columns :this
                                              (concat
                                               (map (fn [term] [(searchable-value-trim-sql (keyword (str "this." (name term))))
                                                                term])
                                                    search-terms)
                                               (mapcat (fn [k] (attrs->select-items
                                                                (->> (get spec k)
                                                                     (remove (comp search-terms key)))))
                                                       [:attrs :render-terms])
                                               fn-selects))
      :from      [[(t2/table-name (:model spec)) :this]]
      :where     (:where spec [:= [:inline 1] [:inline 1]])
      :left-join (when (:joins spec)
                   (into []
                         cat
                         (for [[join-alias [join-model join-condition]] (:joins spec)]
                           [[(t2/table-name join-model) join-alias]
                            join-condition])))})))

(def ^:private spec-index-query-memo (memoize spec-index-query*))

(defn spec-index-query
  "The Honey SQL query selecting the indexable rows of `search-model` from its spec. Memoized per app-DB type since
  the generated Honey SQL varies by engine (e.g. `searchable-value-trim-sql` emits LEFT/CAST only for Postgres and H2)."
  [search-model]
  (spec-index-query-memo (mdb/db-type) search-model))

(defn spec-index-query-where
  "[[spec-index-query]] restricted to the rows matching `where-clause` (nil = every row)."
  [search-model where-clause]
  (-> (spec-index-query search-model)
      (sql.helpers/where where-clause)))
