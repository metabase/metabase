(ns dev.dbt-import.emit
  "Stage 3 of the converter: turn resolved metrics into Metabase serdes entities and write them as a YAML tree.

  Each metric becomes a Card of `type: metric` whose query is the resolve stage's Lib query. The entities are what
  serdes' own [[serdes/extract-one]] makes of a Card row and a Collection row built here, with the Card and Collection
  specs' transforms turning the row's ids into portable refs (see [[with-portable-refs]]) and leaving out the columns
  at their default value, exactly as [[metabase-enterprise.serialization.v2.extract]] does with a row from the app DB:
  the keys written are the specs', and a column the spec starts to export fails the run until the row carries it. The
  query is written with no clause UUIDs (import regenerates them) and no `result_metadata` (import infers it). The
  layout matches a real export,

      collections/main/<collection>.yaml
      collections/main/<collection>/<metric>.yaml

  so `clojure -M:run:ee import <dir> -e` loads it. Only knows the resolve stage's output."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.dbt-import.metadata :as metadata]
   [dev.dbt-import.schemas.resolved :as resolved]
   [metabase-enterprise.serialization.dump :as dump]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io File)
   (java.nio.file Files StandardCopyOption)
   (java.nio.file.attribute FileAttribute)
   (java.text Normalizer Normalizer$Form)
   (org.apache.commons.io FileUtils)))

(set! *warn-on-reflection* true)

(def card-schema
  "The `card_schema` the emitted cards declare: 24, the version whose `:dimensions` and `:dimension_mappings` shape
  the resolve stage builds by hand and [[card-entity]] puts on the Card row. It is a constant rather than
  [[metabase.queries.models.card/current-card-schema-version]] on purpose: an instance whose current version is newer
  upgrades a card that declares 24 when it reads it, where a card declaring the current version is taken to have the
  current shape already, so a hand-built shape that lagged behind would be stored as it is. The rest of the card is
  the Card spec's own export, so only the dimension shape is at stake. When the current version moves past 24, check
  that shape against what changed and bump this; the test [[dev.dbt-import.emit-test/card-schema-test]] fails until
  then."
  24)

(mr/def ::entity
  "A serdes entity: a map carrying `:serdes/meta`, as [[serdes/storable]] writes it, and whatever else its model's
  serdes spec exports."
  [:map {::mr/deliberately-open true, :description "a serdes entity, whose keys are its model's"}
   [:serdes/meta [:sequential [:map [:model :string]]]]])

(mr/def ::file
  "One YAML file to write: its path relative to the export root, the entity it holds, and for a card the resolved
  metric it came from."
  [:map {:closed true}
   [:path :string]
   [:entity ::entity]
   [:metric {:optional true} ::resolved/metric]])

(mu/defn- portable-fk :- [:maybe :string]
  "What [[serdes/*export-fk*]] returns under [[with-portable-refs]]: for a ratio or derived metric's `[:metric id]`
  reference, the referenced metric's `entity_id` from the provider; for a card's `collection_id`, which is the
  collection's `entity_id` already, the id as it is; nothing for a nil id (a card's `dashboard_id`, say)."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   id                :- [:maybe [:or ::lib.schema.id/card :string]]
   model             :- [:or :symbol :keyword]]
  (cond
    (nil? id)                    nil
    (#{'Card :model/Card} model) (metadata/portable-card-ref metadata-provider id)
    (= :model/Collection model)  id
    :else                        (throw (ex-info (format "unexpected foreign key to %s" model)
                                                 {:id id, :model model}))))

(mu/defn- with-portable-refs :- :map
  "Run `thunk` with serdes' id lookups bound to `metadata-provider`, so what it exports names the provider's made-up
  database, table, field and metric card ids the way a real export names an instance's. The two references the
  provider does not number, a card's creator and its collection, are put on the Card row in their portable form
  already, the creator's email and the collection's `entity_id`, and come out as they went in."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   thunk             :- ifn?]
  (binding [serdes/*export-database-fk* (fn [_id] (metadata/database-name metadata-provider))
            serdes/*export-table-fk*    (fn [table-id] (metadata/portable-table-ref metadata-provider table-id))
            serdes/*export-field-fk*    (fn [field-id] (metadata/portable-field-ref metadata-provider field-id))
            serdes/*export-user*        identity
            serdes/*export-fk*          (fn [id model] (portable-fk metadata-provider id model))]
    (thunk)))

(mu/defn dataset-query :- :map
  "A resolved metric's query as serdes writes it in the card's `dataset_query`: [[serdes/export-mbql]] strips the
  clause ids and turns the provider's ids into names, and a `[:metric id]` reference into the referenced metric's
  `entity_id`."
  [{:keys [metadata-provider query]} :- ::resolved/metric]
  (with-portable-refs metadata-provider #(serdes/export-mbql query)))

(mu/defn- collection-entity :- ::entity
  "The serdes entity for the collection the metrics go in: a top-level Collection row, as the app DB would hold one,
  through [[serdes/extract-one]]. Its only references, the parent collection and the personal owner, are nil, so
  nothing is looked up."
  [{collection-name :name, :keys [entity-id]} :- ::resolved/collection]
  (serdes/extract-one "Collection" {}
                      {:name                collection-name
                       :entity_id           entity-id
                       :slug                (u/slugify collection-name)
                       :description         "Metrics imported from dbt."
                       :location            "/"
                       :personal_owner_id   nil
                       :namespace           nil
                       :type                nil
                       :authority_level     nil
                       :archive_operation_id nil
                       :archived            false
                       :archived_directly   false
                       :is_sample           false
                       :is_remote_synced    false}))

(mu/defn- card-entity :- ::entity
  "The serdes entity for a metric: a Card row, as the app DB would hold one, with every column the Card spec exports,
  through [[serdes/extract-one]] with the row's ids made portable by [[with-portable-refs]]. The query is the resolve
  stage's Lib query against the provider, and the curated dimensions and mappings are the shape the resolve stage
  built (see [[card-schema]]); `result_metadata` is nil, since the import infers it."
  [config     :- ::resolved/config
   collection :- ::resolved/collection
   {:keys [ir entity-id metadata-provider query dimension-mappings], persisted-dimensions :dimensions}
   :- ::resolved/metric]
  (with-portable-refs metadata-provider
    #(serdes/extract-one "Card" {}
                         {:name                   (:label ir)
                          :description            (:description ir)
                          :entity_id              entity-id
                          :type                   :metric
                          :display                :scalar
                          :collection_id          (:entity-id collection)
                          :creator_id             (:creator-email config)
                          :made_public_by_id      nil
                          :dashboard_id           nil
                          :document_id            nil
                          :database_id            (:database query)
                          :dataset_query          query
                          :result_metadata        nil
                          :parameters             []
                          :parameter_mappings     []
                          :visualization_settings {}
                          :dimensions             persisted-dimensions
                          :dimension_mappings     dimension-mappings
                          :archived               false
                          :archived_directly      false
                          :enable_embedding       false
                          :collection_preview     true
                          :card_schema            card-schema})))

(mu/defn- slugify :- :string
  "`s`, a collection name or a metric label, as a file name: slugified the way a real export does it, after Unicode
  NFC normalization, so that a label written with combining marks and the same label precomposed (`é` either way)
  become one slug, which the name deduplication then tells apart, rather than two files for what reads as one name.
  A name that slugifies to nothing would be a file called `.yaml`; the parse stage falls back to the metric name
  for a blank label, so there is none, and one is refused rather than written."
  [kind :- :string
   s    :- :string]
  (let [slug (storage.util/slugify-name (Normalizer/normalize s Normalizer$Form/NFC))]
    (when (str/blank? slug)
      (throw (ex-info (format "%s %s slugifies to nothing, so it has no file name" kind (pr-str s))
                      {kind s})))
    slug))

(mu/defn- collection-slug :- :string
  "The collection's directory and file name (see [[slugify]]). [[storage.util/slugify-name]] leaves `.` and `..` as
  they are, and `..` would put the cards, and the delete of the previous run, one level up from `collections/main/`."
  [collection-name :- :string]
  (let [slug (slugify "collection name" collection-name)]
    (when (#{"." ".."} slug)
      (throw (ex-info (format "%s is not a usable collection name" (pr-str collection-name))
                      {:collection-name collection-name})))
    slug))

(mu/defn files :- [:sequential ::file]
  "The files of the serdes tree for a resolved manifest: the collection first, then one card per metric. Card file
  names are slugified labels, deduplicated the way a real export does it."
  [config :- ::resolved/config
   {:keys [collection metrics]} :- ::resolved/manifest]
  (let [slug        (collection-slug (:name collection))
        unique-name (lib/non-truncating-unique-name-generator)]
    (into [{:path   (str "collections/main/" slug ".yaml")
            :entity (collection-entity collection)}]
          (map (fn [{:keys [entity-id ir] :as resolved-metric}]
                 (let [file-name (unique-name entity-id (slugify "label" (:label ir)))]
                   {:path   (str "collections/main/" slug "/" file-name ".yaml")
                    :entity (card-entity config collection resolved-metric)
                    :metric resolved-metric})))
          metrics)))

(mr/def ::rendered
  "A file rendered and ready to write: its path relative to the export root and its YAML."
  [:map {:closed true}
   [:path :string]
   [:yaml :string]])

(mu/defn- render :- [:sequential ::rendered]
  "`entries` as the YAML serdes export writes, rendered before anything is written so that an entity that cannot be
  rendered fails the run with the output directory untouched."
  [entries :- [:sequential ::file]]
  (mapv (fn [{:keys [path entity]}]
          {:path path, :yaml (dump/yaml-content (serdes/storable entity))})
        entries))

(mu/defn- owned-paths :- [:sequential :string]
  "What a run owns under the export root: for each collection among `entries`, its own YAML and the directory of its
  cards (the layout [[files]] writes). Anything else under the root is somebody else's."
  [entries :- [:sequential ::file]]
  (vec (for [{:keys [path entity]} entries
             :when (= "Collection" (-> entity :serdes/meta last :model))
             owned [path (str/replace path #"\.yaml$" "")]]
         owned)))

(mu/defn- delete! :- :nil
  "Delete `file`, a regular file or a directory with everything in it; nothing when there is no such file."
  [^File file :- (ms/InstanceOfClass File)]
  (when (.exists file)
    (FileUtils/forceDelete file)))

(mu/defn- write-file! :- :nil
  "Write `content` to `file`, creating its parent directories."
  [^File file :- (ms/InstanceOfClass File)
   content    :- :string]
  (io/make-parents file)
  (spit file content))

(mu/defn- write-rendered! :- :nil
  "Write `rendered` under `dir`. A failure is rethrown with the paths written so far and the one that failed, as
  `:written` and `:failed` in its data."
  [^File dir :- (ms/InstanceOfClass File)
   rendered  :- [:sequential ::rendered]]
  (reduce (fn [written {:keys [path yaml]}]
            (try
              (write-file! (io/file dir path) yaml)
              (catch Exception e
                (throw (ex-info (format "could not write %s: %s" path (ex-message e))
                                {:written written, :failed path}
                                e))))
            (conj written path))
          []
          rendered)
  nil)

(mu/defn- move! :- :nil
  "Move `from` to `to`, atomically when the file system can (both are under the same output directory, so it can)."
  [^File from :- (ms/InstanceOfClass File)
   ^File to   :- (ms/InstanceOfClass File)]
  (io/make-parents to)
  (Files/move (.toPath from) (.toPath to) (into-array [StandardCopyOption/ATOMIC_MOVE]))
  nil)

(mu/defn- swap-in! :- :nil
  "Replace what an earlier run wrote under `out-dir` for the paths this run owns (see [[owned-paths]]) with what this
  run wrote under `staging`. Without the replacement a metric renamed since the last run leaves two files with the
  same `entity_id`, and a metric removed from the project survives as a file and is imported again, since serdes
  import never deletes. Something that is not a directory where a run's card directory goes is deleted too: it is
  in the collection's way."
  [^File out-dir :- (ms/InstanceOfClass File)
   ^File staging :- (ms/InstanceOfClass File)
   owned         :- [:sequential :string]]
  (doseq [path owned]
    (delete! (io/file out-dir path)))
  (doseq [path  owned
          :let  [staged (io/file staging path)]
          :when (.exists staged)]
    (move! staged (io/file out-dir path))))

(mu/defn write! :- [:sequential :string]
  "Write `entries` under `out-dir` with the same YAML formatting serdes export uses, replacing what a previous run
  wrote for the same collections (see [[swap-in!]]). Returns the paths written, relative to `out-dir`.

  Everything is rendered first, then written to a staging directory under `out-dir`, and only then swapped into
  place, so a failure part-way leaves the previous run's files as they were; it is rethrown with the paths written
  so far and the one that failed in its data, and the staging directory is removed. A run in which no metric
  converted writes nothing and leaves `out-dir` alone: there is no collection worth writing without cards, and the
  previous run's files should not go for a manifest that produced nothing."
  [out-dir :- :string
   entries :- [:sequential ::file]]
  (if-not (some :metric entries)
    (do (log/infof "No metric converted, so nothing was written and %s was left as it is" out-dir)
        [])
    (let [rendered (render entries)
          out      (io/file out-dir)
          _        (.mkdirs out)
          staging  (.toFile (Files/createTempDirectory (.toPath out) ".dbt-import-" (make-array FileAttribute 0)))]
      (try
        (write-rendered! staging rendered)
        (swap-in! out staging (owned-paths entries))
        (mapv :path rendered)
        (finally
          (delete! staging))))))
