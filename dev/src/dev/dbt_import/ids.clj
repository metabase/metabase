(ns dev.dbt-import.ids
  "Every id the converter writes, derived from the input rather than generated, so that re-running the converter on the
  same project writes the same ids and a re-import updates what is there instead of duplicating it. Each fn hashes one
  string:

  | id                       | hashed input                                        | hash                           |
  |--------------------------|-----------------------------------------------------|--------------------------------|
  | [[metric-entity-id]]     | `dbt-import/metric/<db name>/<metric unique_id>`    | sha256 → NanoID                |
  | [[collection-entity-id]] | `dbt-import/collection/<db names>/<project name>`   | sha256 → NanoID                |
  | [[dimension-id]]         | `dbt-import/dimension/<metric unique_id>/<path>`    | name UUID (v3)                 |
  | [[group-id]]             | `<group type>/<group display name>`                 | name UUID (v3), Metabase's own |

  `<db name>` is the name of the Metabase Database the metric's semantic model is mapped to; `<db names>` the sorted,
  comma-joined names of every Metabase Database the run writes cards for.

  The two entity ids are the `entity_id` serdes writes for a Card and a Collection (see [[entity-id]]); the two UUIDs
  are the ids of a metric's curated dimensions and of the groups they sit in, which the instance persists and compares
  on refresh. The entity ids carry the Metabase Database the cards run against (the config's `:databases` values), so
  one project converted for two databases (a `dev` and a `prod` warehouse) is two sets of cards in two collections,
  and two projects that share a name collide only when they also share a database. Changing any input here changes
  every id a re-import looks up, so none of these may change without a migration of what earlier runs wrote."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [dev.dbt-import.schemas.ir :as ir]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn entity-id :- ms/NanoIdString
  "A deterministic `entity_id` for the string `s`: a NanoID seeded from the sha256 of `s`, so the same string always
  gives the same id. The fns below prefix `s` with what kind of thing it names, so a metric and a collection of the same
  name never share an id."
  [s :- :string]
  ;; generate-nano-id seeds a java.util.Random from a hex string parsed as a long, so hand it 15 hex chars (60 bits) of
  ;; the hash; Random keeps the low 48 of them
  (u/generate-nano-id (subs (codecs/bytes->hex (buddy-hash/sha256 s)) 0 15)))

(mu/defn metric-entity-id :- ms/NanoIdString
  "The `entity_id` of the Card the metric becomes: [[entity-id]] of `dbt-import/metric/<database-name>/<unique_id>`.
  `database-name` is the name of the Metabase Database the metric's semantic model is mapped to (see
  [[dev.dbt-import.metadata/database-name]]), so the same project converted for two databases gives two cards; the
  `unique_id` (`metric.<project>.<name>`) is dbt's own stable name for the metric, and carries the project, so the
  same metric name in two projects gets two ids. Renaming the Metabase Database re-keys every card."
  [database-name       :- :string
   {:keys [unique-id]} :- ::ir/metric]
  (entity-id (str "dbt-import/metric/" database-name "/" unique-id)))

(mu/defn collection-entity-id :- ms/NanoIdString
  "The `entity_id` of the Collection the metrics are written into: [[entity-id]] of
  `dbt-import/collection/<database names>/<project>`, `database-names` being the names of the Metabase Databases the
  run writes cards for (the config's `:databases` values the manifest's semantic models map to), sorted and joined
  with commas, and `project` the dbt project's name (nil when the manifest does not record one). So each project gets
  a collection of its own per set of databases, re-runs find it again, and renaming a Metabase Database re-keys it."
  [database-names :- [:sequential :string]
   project        :- [:maybe :string]]
  (entity-id (str "dbt-import/collection/" (str/join "," (sort (distinct database-names))) "/" project)))

(mu/defn dimension-id :- ::lib-metric.schema/dimension-id
  "The id of the curated dimension at `dimension-path` (`<entity>__<dimension>`, or a bare name for the metric's own
  semantic model) of the metric `metric-unique-id`: the name UUID of
  `dbt-import/dimension/<metric unique_id>/<dimension path>`. Scoped to the metric, as Metabase scopes the ids it
  computes (see [[metabase.lib-metric.dimension.jvm/dimension-id]]), so a re-import updates each dimension in place."
  [metric-unique-id :- :string
   dimension-path   :- :string]
  (u/name-uuid (str "dbt-import/dimension/" metric-unique-id "/" dimension-path)))

(mu/defn group-id :- ::lib.schema.common/non-blank-string
  "The id of the dimension group of `group-type` (`main` or `connection`) named `group-name`: the name UUID of
  `<type>/<name>`, exactly as Metabase derives a group's id from its display name (see [[lib-metric/group-id]]), so a
  re-run writes the same ids. It is not the id the instance computes for the same table: the instance names the main
  group after the table's display name and a connection group after the foreign key's, so a dimension added later in
  the UI lands in a group of its own next to the imported one."
  [group-type :- [:enum "main" "connection"]
   group-name :- :string]
  (lib-metric/group-id group-type group-name))
