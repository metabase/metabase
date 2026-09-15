(ns metabase.glossary.queries
  "Query executors for `:model/Glossary`, built on [[metabase.app-db.hugsql]].

  The SQL lives in glossary.sql as private sqlvec *builders* (`-- :name-`, suffixed `-sqlvec` so
  they never collide with the public executors here); each executor wraps a builder to apply the
  model's declared `:in`/`:out` transforms and never exposes a queryable to callers. Reads return
  Toucan instances, so `t2/hydrate` behaves as it did with a HoneySQL query.

  This ns replaces `metabase.glossary.db`. Where that ns bound request values with `[:auto/param]`
  markers, here a value cannot be syntax at all: the statement is fixed text in a file and a param
  is a `?` placeholder, so there is no marker to apply or forget."
  (:require
   [clojure.string :as str]
   [hugsql.core :as hugsql]
   [metabase.app-db.hugsql :as app-db.hugsql]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private model :model/Glossary)

;; Private sqlvec builders (`<name>-sqlvec`), one per `-- :name-` in glossary.sql. The declare
;; doubles as the file's table of contents (clj-kondo can't see vars interned by def-sqlvec-fns).
(declare glossary-entries-sqlvec glossary-entry-sqlvec glossary-entry-by-term-sqlvec
         insert-glossary-entry-sqlvec update-glossary-entry-sqlvec delete-glossary-entry-sqlvec
         users-by-id-sqlvec)

(hugsql/def-sqlvec-fns "metabase/glossary/glossary.sql")

(defn- like-substring-pattern
  "A `LIKE` pattern matching `s` case-insensitively as a literal substring, for a lowercased column.
  Escapes `%`, `_` and the escape character `!` so a wildcard a user typed matches literally; the
  matching `ESCAPE '!'` is written into the SQL file.

  This is the pure-string half of `metabase.util.honey-sql-2/like-substring`. That fn also had to
  build an `[:escape ...]` HoneySQL form with a `::literal` workaround for MySQL's collation on
  inlined strings -- structure that only existed because the pattern had to travel as syntax. Here
  it travels as a bound parameter, so only the escaping remains."
  [s]
  (str "%" (str/replace (u/lower-case-en s) #"([!%_])" "!$1") "%"))

;;; Public executors: params in, instances or a count out. Callers never touch a queryable.

(mu/defn glossary-entries :- [:sequential ::glossary.schema/glossary]
  "The Glossary entries whose term or definition contains `search` case-insensitively, or every
  entry when `search` is nil, in term order."
  [search :- [:maybe :string]]
  ((app-db.hugsql/select-executor model glossary-entries-sqlvec)
   {:search? (if search 1 0)
    :pattern (if search (like-substring-pattern search) "")}))

(mu/defn glossary-entry :- [:maybe ::glossary.schema/glossary]
  "The Glossary entry with `id`, or nil."
  [id :- ms/PositiveInt]
  (first ((app-db.hugsql/select-executor model glossary-entry-sqlvec) {:id id})))

(mu/defn glossary-entry-by-term :- [:maybe ::glossary.schema/glossary]
  "The Glossary entry for `term`, or nil."
  [term :- :string]
  (first ((app-db.hugsql/select-executor model glossary-entry-by-term-sqlvec) {:term term})))

(mu/defn insert-glossary-entry! :- ::glossary.schema/glossary
  "Insert the Glossary `row` and return the inserted instance. The entry is read back by term
  because the insert statement returns a count, not a row."
  [row :- ::glossary.schema/glossary.update]
  (app-db.hugsql/execute! model insert-glossary-entry-sqlvec
                          {:term       (:term row)
                           :definition (:definition row)
                           :creator-id (:creator_id row)})
  (glossary-entry-by-term (:term row)))

(mu/defn update-glossary-entry! :- :any
  "Set the term and definition of the Glossary entry with `id`."
  [id         :- ms/PositiveInt
   term       :- :string
   definition :- :string]
  (app-db.hugsql/execute! model update-glossary-entry-sqlvec
                          {:id id :term term :definition definition}))

(mu/defn delete-glossary-entry! :- :any
  "Delete the Glossary entry with `id`."
  [id :- ms/PositiveInt]
  (app-db.hugsql/execute! model delete-glossary-entry-sqlvec {:id id}))

(mu/defn users-by-id :- [:map-of ::lib.schema.id/user :map]
  "A map of User id to the id, email, and name of the Users with `user-ids`.

  Returns `{}` for an empty set without querying: an empty `IN ()` is a syntax error, and there is
  nothing to look up. (`app-db.hugsql/non-empty-in` is for the other case -- an arm of a larger
  query that must still run and contribute no rows.)"
  [user-ids :- [:set ::lib.schema.id/user]]
  (if (empty? user-ids)
    {}
    (into {} (map (juxt :id identity))
          (app-db.hugsql/rows model users-by-id-sqlvec {:ids user-ids}))))
