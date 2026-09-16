-- Queries for :model/Glossary. Private sqlvec builders wrapped into executors in
-- metabase.glossary.queries; see metabase.app-db.hugsql. Literal SQL only; input flows through
-- value params. Portable across H2, MySQL, Postgres.
--
-- NB: never start a comment line with a `:keyword:` -- HugSQL's parser reads any leading keyword in
-- a `--` comment as a header directive and fails with "Missing HugSQL Header".

-- :name- glossary-entries :? :*
-- Every Glossary entry, or those whose term or definition contains :pattern, in term order.
-- :search? is an int flag rather than a `:pattern IS NULL` test so Postgres can type the param
-- (a bare `? IS NULL` cannot be typed). When it is 0 the LIKE arms are skipped and every row
-- matches; :pattern is still bound (as an unused empty string) so the param count is constant.
--
-- The caller escapes %/_/! in :pattern and adds the surrounding wildcards, so a wildcard typed by
-- a user matches literally. ESCAPE '!' is plain text here -- in HoneySQL it had to be an [:escape]
-- form with a ::literal workaround for MySQL's collation on inline strings.
SELECT *
FROM glossary
WHERE (:value:search? = 0
       OR LOWER(term) LIKE :value:pattern ESCAPE '!'
       OR LOWER(definition) LIKE :value:pattern ESCAPE '!')
ORDER BY term ASC

-- :name- glossary-entry :? :1
-- The Glossary entry with :id, or nil.
SELECT *
FROM glossary
WHERE id = :value:id

-- :name- glossary-entry-by-term :? :1
-- The Glossary entry whose term is exactly :term, or nil.
SELECT *
FROM glossary
WHERE term = :value:term

-- :name- users-by-id :? :*
-- The id, email, and name of the Users with :ids. Callers guard against an empty id set; see
-- metabase.app-db.hugsql/non-empty-in for the case where an empty list must still run.
SELECT id, email, first_name, last_name
FROM core_user
WHERE id IN (:value*:ids)
