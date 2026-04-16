(ns metabase-enterprise.checker.source
  "Protocols for resolving portable references to entity data.

   Two protocols separate the two concerns:

   - **SchemaSource** resolves database schema references (databases, tables, fields).
     Backed by the `--schema-dir` directory.
   - **AssetsSource** resolves serialized entity references (cards, snippets, transforms,
     segments, dashboards, collections, documents, measures).
     Backed by the `--export` directory.

   The checker assigns integer IDs; sources just say 'yes this exists, here's the
   data' or 'no, this reference is unresolved'.

   ## The contract

   A source returns plain Clojure maps with **snake_case keys** matching the
   serialized form. The provider (`checker.provider`) is responsible for all
   conversion to lib metadata format:

   - snake_case → kebab-case (`:base_type` → `:base-type`)
   - strings → keywords (`:engine \"h2\"` → `:engine :h2`)
   - adding `:lib/type` discriminators
   - filling in defaults (`:active` defaults to `true` if absent)
   - resolving portable refs (path vectors) to integer IDs via the store
   - MBQL normalization

   This means a source author only has to answer 'given this portable reference,
   give me the raw map' — no need to know about lib metadata, type keywords, or
   the integer ID space. New sources (REST API, git repo, LLM, app DB via
   toucan2) can return the snake_case shape directly.

   ## Portable references

   - Database: string `db-name`
   - Table: `[db-name schema-name table-name]` — `schema-name` may be `nil`
     for schema-less databases (e.g. SQLite)
   - Field: `[db-name schema-name table-name field-name]`
   - Card / snippet / transform / segment / dashboard / collection / document /
     measure: string `entity-id`

   ## Required vs optional keys

   The docstrings below describe each `resolve-*` method's return shape. Keys
   marked **required** must be present for the checker to function. Keys marked
   **optional** are read defensively (the provider treats them as nil/default
   when absent).")

(set! *warn-on-reflection* true)

(defprotocol SchemaSource
  "Resolve database schema references to entity data."

  (resolve-database [this db-name]
    "Resolve a database by its real name. Returns a map or nil.

     Returned map keys (snake_case):
       :id           any     — required; opaque to checker, used as synthetic ID
       :name         string  — required
       :engine       string  — required; provider keywordizes (e.g. \"h2\" → :h2)
       :settings     map     — optional
       :dbms_version map     — optional")

  (resolve-table [this table-path]
    "Resolve a table by `[db-name schema-name table-name]`. `schema-name` is nil
     for schema-less databases. Returns a map or nil.

     Returned map keys (snake_case):
       :id              any     — required; opaque to checker
       :name            string  — required
       :display_name    string  — optional
       :schema          string  — required (may be nil for schema-less DBs)
       :db_id           any     — required; matches the database :id (or db-name)
       :active          bool    — optional, defaults to true
       :visibility_type string  — optional; provider keywordizes")

  (resolve-field [this field-path]
    "Resolve a field by `[db-name schema-name table-name field-name]`.
     Returns a map or nil.

     Returned map keys (snake_case):
       :id                 any     — required; opaque to checker
       :table_id           any     — required; matches the table :id (or table-path)
       :name               string  — required
       :display_name       string  — optional
       :base_type          string  — required; provider keywordizes
       :effective_type     string  — optional; defaults to :base_type
       :semantic_type      string  — optional; provider keywordizes
       :database_type      string  — optional
       :active             bool    — optional, defaults to true
       :visibility_type    string  — optional; provider keywordizes
       :position           int     — optional
       :fk_target_field_id vector  — optional; must be a field-path vector
                                     to participate in FK resolution")

  (fields-for-table [this table-path]
    "Return a collection of field-paths belonging to the given table-path
     `[db-name schema-name table-name]`. Returns nil if the table is unknown.")

  (all-field-paths [this]
    "Return a collection of all known field-paths.")

  (all-database-names [this]
    "Return a collection of all known database names (strings).")

  (all-table-paths [this]
    "Return a collection of all known table-paths.")

  (tables-for-database [this db-name]
    "Return a collection of table-paths belonging to the given database name."))

(defprotocol AssetsSource
  "Resolve serialized entity references to entity data.

   Each `resolve-*` method takes an `entity-id` string and returns the raw
   entity map (or nil if not found). Maps use snake_case keys matching the
   serialized YAML/JSON form."

  (resolve-card [this entity-id]
    "Resolve a card by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id              any     — required; opaque to checker
       :name            string  — required
       :type            string  — required; provider keywordizes (e.g. \"question\")
       :dataset_query   map     — required; MBQL query, normalized by provider
                                  Has :database (db-name string or db-id),
                                  :stages (or :type+:query for legacy form)
       :table_id        vector|int — optional; portable path or integer ID
       :result_metadata seq     — optional; column maps, may contain portable refs
                                  in :id, :table_id, :fk_target_field_id, :field_ref
       :archived        bool    — optional
       :collection_id   string  — optional; entity-id of containing collection
       :dashboard_id    string  — optional; entity-id of containing dashboard
       :document_id     string  — optional; entity-id of containing document")

  (resolve-snippet [this entity-id]
    "Resolve a native query snippet by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id      any    — required; opaque to checker
       :name    string — required
       :content string — required; the snippet's SQL fragment")

  (resolve-transform [this entity-id]
    "Resolve a transform by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id                 any    — required; opaque to checker
       :name               string — required
       :source             map    — required
                                    Has :type (\"query\" for query-based transforms),
                                    and :query when type=\"query\"
       :source_database_id any    — optional; fallback when :source.query has no :database")

  (resolve-segment [this entity-id]
    "Resolve a segment by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id         any    — required; opaque to checker
       :name       string — required
       :definition map    — required; MBQL definition (a dataset_query)")

  (resolve-dashboard [this entity-id]
    "Resolve a dashboard by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id            any    — required; opaque to checker
       :name          string — required
       :tabs          seq    — required; each tab has :entity_id (string)
       :dashcards     seq    — required; each dashcard has:
                                 :entity_id        string  — required
                                 :card_id          string  — optional (nil for virtual cards)
                                 :dashboard_tab_id vector|string — optional
                                 :col, :row,
                                 :size_x, :size_y  int     — optional, default 0/0/1/1
       :collection_id string — optional; entity-id of containing collection")

  (resolve-collection [this entity-id]
    "Resolve a collection by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id            any    — required; opaque to checker
       :name          string — required
       :parent_id     string — optional; entity-id of parent collection
       :collection_id string — optional; same as :parent_id in some contexts")

  (resolve-document [this entity-id]
    "Resolve a document by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id            any    — required; opaque to checker
       :name          string — required
       :document      map    — required; ProseMirror content tree
                               cardEmbed nodes have :attrs.id with serdes refs
                               text nodes may have :marks with link hrefs
       :collection_id string — optional; entity-id of containing collection")

  (resolve-measure [this entity-id]
    "Resolve a measure by entity-id. Returns a map or nil.

     Returned map keys (snake_case):
       :id   any    — required; opaque to checker
       :name string — required"))
