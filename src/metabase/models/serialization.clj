;; -*- outline-regexp: "[; ]+#+[[:space:]]+" -*-
(ns metabase.models.serialization
  "TODO (Cam 10/1/25) -- move this into the serialization module or something like that, not all models need this.

  Defines core interfaces for serialization.

  Serialization is an enterprise feature, but in the interest of keeping all the code for an entity in one place,
  these methods are defined here and implemented for all the exported models.

  ## Whether to export a new model

  Export if it's a high-profile user facing entity: Database, Question, Dashboard, Snippet, etc.
  Do not export if it's internal or automatic: Users (created automatically), logs, revisions, cache, permissions.

  ## How to deal with serialization for a new model

  - Add it to the appropriate list in [[metabase-enterprise.serialization.v2.models]]
  - If it is in the `excluded-models` list, then your job is done
  - If it's not, you probably want `entity_id` field autopopulated (that's a most common way to make model
    transportable between instances), add `(derive :model/Model :hook/entity-id)` to your model
  - Define serialization multi-methods on a model (see `Card` and `Collection` for more complex examples or `Action`
    and `Segment` for less involved stuff)
    - `serdes/make-spec` - this is the main entry point. Should list every field in the model (this is checked in
      tests)
    - `serdes/descendants` - if model should be extracted along with some support (like Collection and all its
      children), you need to specify what to fetch - see `Card` for an example (used during export)
    - `serdes/dependencies` - if model references other models, you need to declare which ones, see `Action` for an
      example (used during import)
  - Write tests
    - basic layout (that all entity fields are mentioned, fks are marked as such) is tested automatically
    - see [[metabase-enterprise.serialization.v2.extract-test]] and [[metabase-enterprise.serialization.v2.load-test]]
      for examples
    - basically try to think what special stuff is happening and test for corner cases
    - do you store mbql? some other json structure? See `Card` for examples

  ## Existing transformations

  - `(serdes/fk :model/Card)` or `(serdes/fk :model/Database :name)` - export foreign key in a portable way
  - `(serdes/nested :model/DashboardCard :dashboard_id opts)` - include some entities in your entity export
  - `(serdes/parent-ref)` - symmetrical call for `serdes/nested` to handle parent ids (you'd use it on `:dashboard_id`
    in that case)
  - `(serdes/date)` - format/parse dates with a stable format
  - `(serdes/kw)` - de/keywordize values during de/serialization
  - `(serdes/as :parent_id)` - store value as a different key
  - `(serdes/compose inner outer)` - compose two transformations

  ## Use cases

  ### Skip value depending on data

  See `Database/details`, but overall:
  - Put it in `:skip` if this column shouldn't be synchronized
  - You have to make decisions inside `:transform` column `:export` function (or `:import`)
  - To prevent value being serialized, return `::serdes/skip` instead of `nil` (the reason being that serialization
    format distinguishes between `nil` and absence)
  - If your data is coming in watered down by YAML (like strings instead of keywords), take a look at `:coerce`"
  (:refer-clojure :exclude [descendants])
  (:require
   [clojure.core.match :refer [match]]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   ;; legacy usages -- do not use in new code
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

;; there was no science behind picking 100 as a number
(def ^:private extract-nested-batch-limit "max amount of entities to fetch nested entities for" 100)

;;; # Serialization Overview
;;;
;;; Serialization (or "serdes") is a system for exporting entities (Dashboards, Cards, Collections, etc.) from one
;;; Metabase instance to disk files, and later importing them into 1 or more separate Metabase instances.
;;;
;;; There are two versions of serdes, known as v1 and v2. v2 was built in late 2022 to solve some problems with v1,
;;; especially: accidentally duplicating entities because of a human change like renaming a collection; and that several
;;; newly added models (eg. Timelines) were not added to serdes. v1's code is in `metabase-enterprise.serialization.*`;
;;; v2 is split between infrastructure in `metabase-enterprise.serialization.v2.*` and integration with each model in
;;; `metabase.models.*`.
;;;
;;; There are tests which query the set of Toucan models and ensure that they either support serialization or are
;;; explicitly listed as exempt. Therefore serdes for new models is not forgotten.
;;;
;;; ## More details
;;; This file is probably best not read top to bottom - it's organized in `def` order, not necessarily a good order for
;;; understanding. Probably you want to read below on the "Export process" and "Import process" next.

;;; # Entity IDs
;;; Every serializable entity needs the be identified in a way that is:
;;;
;;; 1. unique, at least among the serialized entities
;;; 2. permanent, even if eg. a collection's `:name` changes
;;; 3. portable between Metabase instances and over time
;;;
;;; Database primary keys fail (3); matching based on the value fails (2) and maybe (1). So there's no easy way to solve
;;; this requirement. We've taken three approaches for different kinds of entities:
;;;
;;; 1. Some have unique names already and we can use those: Databases are uniquely named and don't change.
;;;     - Some are unique within a namespace: Fields are unique in Tables, Tables in Schemas, Schemas in Databases.
;;; 2. Some are "embedded" as part of a parent entity, and don't need to exist independently, eg. the recipients of a
;;;    pulse/dashboard subscription are reduced to a list of email addresses.
;;; 3. For everything else (Dashboards, Cards, etc.)
;;;    - Add an `entity_id` column to the tables
;;;    - Populate it `on-insert` with a randomly-generated NanoID like `"V1StGXR8_Z5jdHi6B-myT"`.
;;;    - For entities that existed before the column was added, have a portable way to rebuild them (see below on
;;;      hashing).

(defmulti entity-id
  "Given the model name and an entity, returns its entity ID (which might be nil).

  This abstracts over the exact definition of the \"entity ID\" for a given entity.
  By default this is a column, `:entity_id`.

  Models that have a different portable ID (`Database`, `Field`, etc.) should override this."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defmethod entity-id :default [_ instance]
  (some-> instance :entity_id str/trim))

(defn eid->id
  "Given model name and its entity id, returns it database-local id.

  Is kind of reverse transformation to `entity-id` function defined here.

  NOTE: Not implemented for `Database`, `Table` and `Field`, since those rely more on `path` than a single id. To be
  done if a need arises."
  [model-name eid]
  (let [model (keyword "model" model-name)
        pk    (first (t2/primary-keys model))
        eid   (cond-> eid
                (str/starts-with? eid "eid:") (subs 4))]
    (t2/select-one-fn pk [model pk] :entity_id eid)))

;;; ## Hashing entities
;;; In the worst case, an entity is already present in two instances linked by serdes, and it doesn't have `entity_id`
;;; set because it existed before we added the column. If we write a migration to just generate random `entity_id`s on
;;; both sides, those entities will get duplicated on the next `import`.
;;;
;;; So every entity implements [[hash-fields]], which determines the set of fields whose values are used to generate the
;;; hash. The 32-bit [[identity-hash]] is then used to seed the PRNG and generate a "random" NanoID. Since this is based
;;; on properties of the entity, it is reproducible on both `export` and `import` sides, so entities are not duplicated.
;;;
;;; Before any `export` or `import`, [[metabase-enterprise.serialization.v2.backfill-ids/backfill-ids]] is called. It
;;; does `SELECT * FROM SomeModel WHERE entity_id IS NULL` and populates all the blanks with this hash-based NanoID.
;;;
;;; <h3>Whoops, two kinds of backfill</h3>
;;; Braden discovered in Nov 2023 that for more than a year, we've had two inconsistent ways to backfill all the
;;; `entity_id` fields in an instance.
;;;
;;; 1. The one described above, [[metabase-enterprise.serialization.v2.backfill-ids/backfill-ids]] which runs before
;;;    any export or import.
;;; 2. A separate JAR command `seed_entity_ids` which is powered by
;;;    [[metabase-enterprise.serialization.v2.entity-ids/seed-entity-ids!]] and uses the [[identity-hash]] hex strings
;;;    directly rather than seeding a NanoID with them.
;;;
;;; Therefore the import machinery has to look out for both kinds of IDs and use them. This is foolish and should be
;;; simplified. We should write a Clojure-powered migration that finds any short 8-character `entity_id`s and generates
;;; NanoIDs from them.

(defn raw-hash
  "Hashes a Clojure value into an 8-character hex string, which is used as the identity hash.

  Don't call this outside a test, use [[identity-hash]] instead. Exception: [[metabase-enterprise.audit-app.audit]]
  uses this because it needs reproducible `:entity_id`s that differ from the usual [[hash-fields]] ones."
  [target]
  (when (sequential? target)
    (assert (seq target) "target cannot be an empty sequence"))
  (format "%08x" (hash target)))

(defmulti hash-fields
  "Returns a seq of functions which will be transformed into a seq of values for hash calculation by calling each
   function on an entity map."
  {:arglists '([model-or-instance])}
  mi/dispatch-on-model)

(defn- increment-hash-values
  "Potentially adds a new value to the list of input seq based on increment.  Used to 'increment' a hash value to avoid duplicates."
  [values increment]
  (if (= increment 0)
    values
    (conj values (str "metabase-increment-" increment))))

(defn identity-hash
  "Returns an identity hash string (8 hex digits) from an `entity` map.

  This string is generated by:
  - calling [[hash-fields]] for the model
  - passing the `entity` to each function it returns
  - calling [[hash]] on that list
  - converting to an 8-character hex string"
  ([entity]
   (identity-hash entity 0))
  ([entity increment]
   {:pre [(some? entity)]}
   (-> (for [f (hash-fields entity)]
         (f entity))
       (increment-hash-values increment)
       raw-hash)))

(defn backfill-entity-id
  "Given an entity with a (possibly empty) `:entity_id` field:
  - Return the `:entity_id` if it's set.
  - Compute the backfill `:entity_id` based on the [[identity-hash]]."
  ([entity]
   (backfill-entity-id entity 0))
  ([entity increment]
   (or (:entity_id entity)
       (:entity-id entity)
       (u/generate-nano-id (identity-hash entity increment)))))

(defn identity-hash?
  "Returns true if s is a valid identity hash string."
  [s]
  (boolean (re-matches #"^[0-9a-fA-F]{8}$" s)))

;; ## Memoizing `hydrated-hash`
;;
;; Hashing a Field requires its Table; hashing a Table requires its Database.
;; Letting each of those hit the appdb for every Field lookup (when it lacks an `entity_id`) is too costly,
;; so we cache any that have to be looked up right here.
;;
;; Memory use is not a serious concern here, for two reasons:
;; 1. This is caching the `hydrated-hash` lookups, so it doesn't cache Fields but only Tables and Databases.
;; 2. This is called only when [[backfill-entity-id]] needs to generate an `entity_id` by hashing. Once the background
;;    job populates that column everywhere, this will always be empty.
;;
;; NOTE: To support Metabase upgrades where the new `entity_id`s might still be blank, this code will have to live on.
;; But in practice once `entity_id`s are populated this cache will never be needed.
(def ^:private hydrated-hash-cache
  (atom {}))

(defn hydrated-hash
  "Returns a function which accepts an entity and returns the identity hash of
   the value of the hydrated property under key k.

  This is a helper for writing [[hash-fields]] implementations."
  ([k]
   (fn [entity]
     (or
      (some-> entity (t2/hydrate k) (get k) identity-hash)
      "<none>")))
  ([hydration-key cache-key]
   (let [inner-fn (hydrated-hash hydration-key)]
     (fn [entity]
       (let [the-key (cache-key entity)
             cached  (swap! hydrated-hash-cache
                            (fn [cache]
                              (cond-> cache
                                (-> cache hydration-key (get the-key) not)
                                (assoc-in [hydration-key the-key] (delay (inner-fn entity))))))]
         (-> cached hydration-key (get the-key) deref))))))

;;; # Serdes paths and <tt>:serdes/meta</tt>
;;; The Clojure maps from extraction and ingestion always include a special key `:serdes/meta` giving some information
;;; about the serialized entity. The value is always a vector of maps that give a "path" to the entity. This is **not**
;;; a filesystem path; rather it defines the nesting of some entities inside others.
;;;
;;; Most paths are a single layer:
;;; `[{:model "ModelName" :id "entity ID" :label "Human-readonly name"}]`
;;; where `:model` and `:id` are required, and `:label` is optional.
;;;
;;; But for some entities, it can be deeper. For example, Fields belong to Tables, which are in Schemas, which are in
;;; Databases. (Schemas don't exist separately in the appdb, but they're used here to keep Table names unique.)
;;; For example:
;;; <pre><code>[{:model "Database" :id "my_db"}
;;;  {:model "Schema"   :id "PUBLIC"}
;;;  {:model "Table"    :id "Users"}
;;;  {:model "Field"    :id "email"}]</code></pre>
;;;
;;; Many of the serdes multimethods are keyed on the `:model` field of the leaf entry (the last).
;;;
;;; ## Two kinds of nesting
;;; To reiterate, `:serdes/meta` paths are not filesystem paths. When `extract`ed entities are stored to disk.

(defmulti generate-path
  "Given the model name and raw entity from the database, returns a vector giving its *path*.
  `(generate-path \"ModelName\" entity)`

  The path is a vector of maps, root first and this entity itself last. Each map looks like:
  `{:model \"ModelName\" :id \"entity ID, identity hash, or custom ID\" :label \"optional human label\"}`

  Nested models with no entity_id need to return nil for generate-path."
  {:arglists '([model-name instance])}
  (fn [model-name _instance] model-name))

(defn infer-self-path
  "Returns `{:model \"ModelName\" :id \"id-string\"}`"
  [model-name entity]
  (let [model (t2.model/resolve-model (symbol model-name))
        pk    (first (t2/primary-keys model))]
    {:model model-name
     :id    (or (entity-id model-name entity)
                (some-> (get entity pk) model identity-hash))}))

(defn maybe-labeled
  "Common helper for defining [[generate-path]] for an entity that is
  (1) top-level, ie. a one layer path;
  (2) labeled by a single field, slugified.

  For example, a Card's or Dashboard's `:name` field."
  [model-name entity slug-key]
  (let [self  (infer-self-path model-name entity)
        label (slug-key entity)]
    [(-> self
         (m/assoc-some :label (some-> label (u/slugify {:unicode? true}))))]))

(defmethod generate-path :default [model-name entity]
  ;; This default works for most models, but needs overriding for those that don't rely on entity_id.
  (maybe-labeled model-name entity :name))

(defn log-path-str
  "Returns a string for logging from a serdes path sequence (i.e. in :serdes/meta)"
  [elements]
  (->> elements
       (map #(str (:model %) " " (:id %)))
       (str/join " > ")))

;;; # Export Process
;;; An *export* (writing a Metabase instance's entities to disk) happens in two stages: *extraction* and *storage*.
;;; These are independent, and deliberately decoupled. The result of extraction is a reducible stream of Clojure maps,
;;; each with `:serdes/meta` keys on them (see below about these paths). In particular, note that extraction happens
;;; inside Clojure, and has nothing to do with file formats or anything of the kind.
;;;
;;; Storage takes the stream of extracted entities and actually stores it to disk or sends it over the network.
;;; Traditionally we serialize to a directory of YAML files, and that's the only storage approach currently implemented.
;;; But since the export process is split into (complicated) extraction and (straightforward) storage, we or a user
;;; could write a new storage layer fairly easily if we wanted to use JSON, protocol buffers, or any other format.
;;;
;;; Both extraction and storage are written as a set of multimethods, with defaults for the common case.
;;;
;;; ## Extraction
;;; Extraction is controlled by a map of options and settings, with details below.
;;;
;;; - [[metabase-enterprise.serialization.v2.models/exported-models]] gives the set of models to be exported.
;;;     - A test enforces that all models are either exported or explicitly excluded, so we can't forget serdes for new
;;;       models.
;;; - [[metabase-enterprise.serialization.v2.extract/extract]] is the entry point for extraction.
;;;     - It can work in a "selective" mode or extract everything; see below on selective serialization.
;;; - It calls `(extract-all "ModelName" opts)` for each model.
;;;     - By default this calls `(extract-query "ModelName" opts)`, getting back a reducible stream of entities.
;;;     - For each entity in that stream, it calls `(extract-one "ModelName" entity)`, which converts the map from the
;;;       database (with instance-specific FKs in it) to a portable map with `:serdes/meta` on it and all FKs replaced
;;;       with portable references.
;;;
;;; The default [[extract-all]] works for nearly all models. Override [[extract-query]] if you need to control which
;;; entities get serialized (eg. to exclude `archived` ones). Every model implements [[extract-one]] to make its
;;; entities portable.
;;;
;;; ## Storage
;;; Storage transforms the reducible stream in some arbitrary way. It returns nothing; storage is expected to have side
;;; effects like writing files to disk or transmitting them over the network.
;;;
;;; Not all storage implementations use directory structure, but for those that do [[storage-path]] should give the path
;;; for an entity as a list of strings: `["foo" "bar" "some_file"]`. Note the lack of a file extension! That is
;;; deliberately left off the shared [[storage-path]] code so it can be set by different implementations to `.yaml`,
;;; `.json`, etc.
;;;
;;; By convention, models are named as *plural* and in *lower case*:
;;; `["collections" "1234ABC_my_collection" "dashboards" "8765def_health_metrics"]`.
;;;
;;; As a final remark, note that some entities have their own directories and some do not. For example, a Field is
;;; simply a file, while a Table has a directory. So a subset of the tree might look something like this:
;;; <pre><code>my-export/
;;; ├── collections
;;; └── databases
;;;     └── Sample Database
;;;         ├── Sample Database.yaml
;;;         └── schemas
;;;             └── PUBLIC
;;;                 └── tables
;;;                     └── ORDERS
;;;                         ├── ORDERS.yaml
;;;                         └── fields
;;;                             ├── CREATED_AT.yaml
;;;                             ├── DISCOUNT.yaml
;;;                             ├── ID.yaml
;;;                             ├── PRODUCT_ID.yaml
;;;                             ├── QUANTITY.yaml
;;;                             ├── SUBTOTAL.yaml
;;;                             ├── TAX.yaml
;;;                             ├── TOTAL.yaml
;;;                             └── USER_ID.yaml
;;; </code></pre>
;;;
;;; ## Selective serialization
;;; It's common to only export certain entities from an instance, rather than everything. We might export a single
;;; Question, or a Dashboard with all its DashboardCards and their Cards.
;;;
;;; There's a relation to be captured here: the *descendants* of an entity are the ones it semantically "contains", or
;;; those it needs in order to be executed. (As when a question depends on another, or a SQL question references a
;;; NativeQuerySnippet.
;;;
;;; [[descendants]] returns a set of such descendants for a given entity; see there for more details.
;;;
;;; *Note:* "descendants" and "dependencies" are quite different things!

(defmulti make-spec
  "Return specification for serialization, should be a map of:

  - `:copy`: a vector of field names, to directly copy from db into output and ingest back with no changes.
  - `:skip`: a vector of field names, used it tests to check if all fields were specified (`:id` and `:updated_at`
    are always skipped, no need to mention them).
  - `:transform`: is a map like `{:field-name {:export (fn [v] ...) :import (fn [v] ...)}}`. For behavior see docs
    on `extract-one` and `xform-one`. There are a number of transformers, see this field for `fk` and similar.
  - `:coerce`: a map like `{:field-name Schema}`; incoming data will be coerced to schema after `:import`/`:copy`.

  Example (search codebase for more examples):

  (defmethod serdes/make-spec \"ModelName\" [_model-name _opts]
    {:copy [:name :description]
     :skip [;; please leave a comment why a field is skipped
            :internal_data]
     :transform {:card_id (serdes/fk :model/Card)}})"
  {:arglists '([model-name opts])}
  (fn [model-name _opts] model-name))

(defmethod make-spec :default [_ _] nil)

(defmulti extract-all
  "Entry point for extracting all entities of a particular model:
  `(extract-all \"ModelName\" {opts...})`
  Keyed on the model name.

  Returns a **reducible stream** of extracted maps (ie. vanilla Clojure maps with `:serdes/meta` keys).

  You probably don't want to implement this directly. The default implementation delegates to [[extract-query]] and
  [[extract-one]], which are usually more convenient to override."
  {:arglists '([model-name opts])}
  (fn [model-name _opts] model-name))

(defmulti extract-query
  "Performs the select query, possibly filtered, for all the entities of this model that should be serialized. Called
  from [[extract-all]]'s default implementation.

  `(extract-query \"ModelName\" opts)`

  Keyed on the model name, the first argument.

  Returns a **reducible stream** of modeled Toucan maps.

  Defaults to using `(t2/select model)` for the entire table.

  You may want to override this to eg. skip archived entities, or otherwise filter what gets serialized."
  {:arglists '([model-name opts])}
  (fn [model-name _opts] model-name))

(defn- assert-one-defined [m k1 k2]
  (if (contains? m k1)
    (assert (not (contains? m k2))
            (format "Transform must not define both %s and %s" k1 k2))
    (assert (contains? m k2)
            (format "Transform must define one of %s or %s" k1 k2))))

(defn extract-one
  "Extracts a single entity retrieved from the database into a portable map with `:serdes/meta` attached.
  `(extract-one \"ModelName\" opts entity)`

  - Convert to a vanilla Clojure map, not a modeled Toucan 2 entity.
  - Drop the numeric database primary key (usually `:id`)
  - Drop the updated_at timestamp, if it exists.
  - Replace any foreign keys with portable values (eg. entity IDs, or a user ID with their email, etc.)"
  [model-name opts instance]
  (try
    (let [spec (make-spec model-name opts)]
      (assert spec (str "No serialization spec defined for model " model-name))
      (-> (select-keys instance (:copy spec))
          ;; won't assoc if `generate-path` returned `nil`
          (m/assoc-some :serdes/meta (generate-path model-name instance))
          (into (for [[k transform] (:transform spec)
                      :let [_         (assert-one-defined transform :export :export-with-context)
                            export-k  (:as transform k)
                            input     (get instance k)
                            f         (:export transform)
                            f-context (:export-with-context transform)
                            res       (if f (f input) (f-context instance k input))]
                      :when (not= res ::skip)]
                  (do
                    (when-not (contains? instance k)
                      (throw (ex-info (format "Key %s not found, make sure it was hydrated" k)
                                      {:model    model-name
                                       :key      k
                                       :instance instance})))

                    [export-k res])))))
    (catch Exception e
      (throw (ex-info (format "Error extracting %s %s" model-name (:id instance))
                      (assoc (ex-data e) :model model-name :id (:id instance))
                      e)))))

(defn log-and-extract-one
  "Extracts a single entity; will replace `extract-one` as public interface once `extract-one` overrides are gone."
  [model opts instance]
  (log/info "Extracting" {:path (log-path-str (generate-path model instance))})
  (try
    (extract-one model opts instance)
    (catch Exception e
      (when-not (or (:skip (ex-data e))
                    (:continue-on-error opts))
        (throw (ex-info (format "Error extracting %s %s" model (:id instance))
                        {:model     model
                         :table     (->> model (keyword "model") t2/table-name)
                         :id        (:id instance)
                         :entity_id (:entity_id instance)
                         :cause     (.getMessage e)}
                        e)))
      (log/warnf "Skipping %s %s because of an error extracting it: %s %s"
                 model (:id instance) (.getMessage e) (dissoc (ex-data e) :skip))
      ;; return error as an entity so it can be used in the report
      e)))

(defmethod extract-all :default [model opts]
  (eduction (map (partial log-and-extract-one model opts))
            (extract-query model opts)))

(defn- transform->nested [transform opts batch]
  (let [backward-fk (:backward-fk transform)
        entities    (-> (extract-query (name (:model transform))
                                       (assoc opts :where [:in backward-fk (map :id batch)]))
                        t2.realize/realize)]
    (group-by backward-fk entities)))

(defn- extract-batch-nested [model-name opts batch]
  (let [spec (make-spec model-name opts)]
    (reduce-kv (fn [batch k transform]
                 (if-not (::nested transform)
                   batch
                   (mi/instances-with-hydrated-data batch k #(transform->nested transform opts batch) :id)))
               batch
               (:transform spec))))

(defn- extract-reducible-nested [model-name opts reducible]
  (eduction (comp (map t2.realize/realize)
                  (partition-all (or (:batch-limit opts)
                                     extract-nested-batch-limit))
                  (map (partial extract-batch-nested model-name opts))
                  cat)
            reducible))

(defn extract-query-collections
  "Helper for the common (but not default) [[extract-query]] case of fetching everything that isn't in a personal
  collection."
  [model {:keys [collection-set where] :as opts}]
  (let [spec (make-spec (name model) opts)]
    (if (or (empty? collection-set)
            (nil? (-> spec :transform :collection_id)))
      ;; either no collections specified or our model has no collection
      (t2/reducible-select model {:where (or where true)})
      (t2/reducible-select model {:where [:and
                                          [:or
                                           [:in :collection_id collection-set]
                                           (when (some nil? collection-set)
                                             [:= :collection_id nil])]
                                          (when where
                                            where)]}))))

(defmethod extract-query :default [model-name opts]
  (let [spec    (make-spec model-name opts)
        nested? (some ::nested (vals (:transform spec)))]
    (cond->> (extract-query-collections (keyword "model" model-name) opts)
      nested? (extract-reducible-nested model-name (dissoc opts :where)))))

(defmulti descendants
  "Returns map of `{[model-name database-id] {initiating-model id}}` for all entities contained or used by this
   entity. e.g. the Dashboard implementation should return pairs for all DashboardCard entities it contains, etc.

   NOTE: This is called during **EXPORT**.

   Dispatched on model-name."
  {:arglists '([model-name db-id opts])}
  (fn [model-name _ _] model-name))

(defmethod descendants :default [_ _ _]
  nil)

(defmulti required
  "Returns map of `{[model-name database-id] {initiating-model id}}` for all entities that are necessary to load this
   entity back. Sort of reverse method for `dependencies`. This method will be called after determining all
   `descendants` to figure out if we're lacking containers etc.

   NOTE: This is called during **EXPORT**.

   Dispatched on model-name."
  {:arglists '([model-name db-id])}
  (fn [model-name _] model-name))

(defmethod required :default [_ _]
  nil)

;;; # Import Process
;;; Deserialization is split into two stages, mirroring serialization. They are called *ingestion* and *loading*.
;;; Ingestion turns whatever serialized form was produced by storage (eg. a tree of YAML files) into Clojure maps with
;;; `:serdes/meta` maps. Loading imports these entities into the appdb, updating and inserting rows as needed.
;;;
;;; ## Ingestion
;;; Ingestion is intended to be a black box, like storage above.
;;; [[metabase-enterprise.serialization.v2.ingest/Ingestable]] is defined as a protocol to allow easy [[reify]] usage
;;; for testing deserialization in memory.
;;;
;;; Factory functions consume some details (like a path to the export) and return an `Ingestable` instance, with its
;;; two methods:
;;;
;;; - `(ingest-list ingestable)` returns a reducible stream of `:serdes/meta` paths in any order.
;;; - `(ingest-one ingestable meta-path)` ingests a single entity into memory, returning it as a map.
;;;
;;; This two-stage design avoids needing all the data in memory at once. (Assuming the underlying storage media is
;;; something like files, and not a network stream that won't wait!)
;;;
;;; ## Loading
;;; Loading tries to find, for each ingested entity, a corresponding entity in the destination appdb, using the entity
;;; IDs. If it finds a match, that row will be `UPDATE`d, rather than `INSERT`ing a duplicate.
;;;
;;; The entry point is [[metabase-enterprise.serialization.v2.load/load-metabase]].
;;;
;;; First, `(ingest-list ingestable)` gets the `:serdes/meta` "path" for every exported entity in arbitrary order.
;;; Then for each ingested entity:
;;;
;;; - `(ingest-one serdes-path opts)` is called to read the value into memory, then
;;; - `(dependencies ingested)` gets a list of other `:serdes/meta` paths need to be loaded first.
;;;     - See below on dependencies.
;;; - Dependencies are loaded recursively in postorder; that is an entity is loaded after all its deps.
;;;     - Circular dependencies will make the load process throw.
;;; - Once an entity's deps are all loaded, we check for an existing one:
;;;     - `(load-find-local serdes-path)` returns the corresponding entity, or nil.
;;; - `(load-one! ingested maybe-local-entity)` is called with the `ingested` map and `nil` or the local match.
;;;     - `load-one!` is a side-effecting black box to the rest of the deserialization process.
;;;     - `load-one! returns the primary key of the new or existing entity, which is necessary to resolve foreign keys.
;;;
;;; `load-one!` has a default implementation that works for most models:
;;;
;;; - Call `(xform-one ingested)` to transform the ingested map as needed.
;;; - Then call either:
;;;     - `(load-update! ingested local-entity)` if the local entity exists, or
;;;     - `(load-insert! ingested)` if it's new.
;;;
;;; Both `load-update!` and `load-insert!` have the obvious defaults of updating or inserting with Toucan, but they
;;; can be overridden if special handling is needed.

(defn- ingested-model
  "The dispatch function for several of the load multimethods: dispatching on the model of the incoming entity."
  [ingested]
  (-> ingested :serdes/meta last :model))

(defn path
  "Given an exported or imported entity with a `:serdes/meta` key on it, return the abstract path (not a filesystem
  path)."
  [entity]
  (:serdes/meta entity))

(defmulti load-find-local
  "Given a path, tries to look up any corresponding local entity.

  Returns nil, or the local Toucan entity that corresponds to the given path.
  Keyed on the model name at the leaf of the path.

  By default, this tries to look up the entity by its `:entity_id` column."
  {:arglists '([path])}
  (fn [path]
    (-> path last :model)))

(declare lookup-by-id)

(defmethod load-find-local :default [path]
  (let [{id :id model-name :model} (last path)
        model                      (t2.model/resolve-model (symbol model-name))]
    (when model
      (lookup-by-id model id))))

;;; ## Dependencies
;;; The files of an export are returned in arbitrary order by [[ingest-list]]. But in order to load any entity,
;;; everything it has a foreign key to must be loaded first. This is the purpose of one of the most complicated parts of
;;; serdes: [[dependencies]].
;;;
;;; This multimethod returns a list (possibly empty) of `:serdes/meta` paths that this entity depends on. A `Card`
;;; depends on the `Table`s it queries, the `Collection` it belongs to, and possibly much else.
;;; Collections depend (recursively) on their parent collections.
;;;
;;; **Think carefully** about the dependencies of any model. Do they have optional fields that sometimes have FKs?
;;; Eg. a DashboardCard can contain custom `click_behavior` which might include linking to a different `Card`!
;;; Missing dependencies will cause flaky deserialization failures, since sometimes the FK target will exist already,
;;; and sometimes not, depending on the arbitrary order of `ingest-list`.

(defmulti dependencies
  "Given an entity map as ingested (not a Toucan entity) returns a (possibly empty) list of its dependencies, where each
  dependency is represented by its abstract path (its `:serdes/meta` value).

  NOTE: This is called during **LOAD**.

  Keyed on the model name for this entity.
  Default implementation returns `nil`, so only models that have dependencies need to implement this."
  {:arglists '([ingested])}
  ingested-model)

(defmethod dependencies :default [_]
  nil)

(defmulti load-update!
  "Called by the default [[load-one!]] if there is a corresponding entity already in the appdb.
  `(load-update! \"ModelName\" ingested-and-xformed local-Toucan-entity)`

  Defaults to a straightforward [[t2/update!]], and you may not need to update it.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the updated entity."
  {:arglists '([model-name ingested local])}
  (fn [model _ _] model))

(defmethod load-update! :default [model-name ingested local]
  (let [model    (t2.model/resolve-model (symbol model-name))
        pk       (first (t2/primary-keys model))
        id       (get local pk)]
    (log/tracef "Upserting %s %d: old %s new %s" model-name id (pr-str local) (pr-str ingested))
    (t2/update! model id ingested)
    (t2/select-one model pk id)))

(defmulti load-insert!
  "Called by the default [[load-one!]] if there is no corresponding entity already in the appdb.
  `(load-insert! \"ModelName\" ingested-and-xformed)`

  Defaults to a straightforward [[(comp first t2/insert-returning-instances!)]] (returning the created object),
  and you probably don't need to implement this.

  Note that any [[t2/insert!]] behavior we don't want to run (like generating an `:entity_id`!) should be skipped based
  on the [[mi/*deserializing?*]] dynamic var.

  Keyed on the model name (the first argument), because the second argument doesn't have its `:serdes/meta` anymore.

  Returns the newly inserted entity."
  {:arglists '([model ingested])}
  (fn [model _] model))

(defmethod load-insert! :default [model-name ingested]
  (log/tracef "Inserting %s: %s" model-name (pr-str ingested))
  (first (t2/insert-returning-instances! (t2.model/resolve-model (symbol model-name)) ingested)))

(defmulti load-one!
  "Black box for integrating a deserialized entity into this appdb.
  `(load-one! ingested maybe-local)`

  `ingested` is the vanilla map from ingestion, with the `:serdes/meta` key on it.
  `maybe-local` is either `nil`, or the corresponding Toucan entity from the appdb.

  Defaults to calling [[xform-one]] to massage the incoming map, then either [[load-update!]] if `maybe-local`
  exists, or [[load-insert!]] if it's `nil`.

  Prefer overriding [[load-update!]] and [[load-insert!]] if necessary, rather than this.

  Keyed on the model name.

  Returns the primary key of the updated or inserted entity."
  {:arglists '([ingested maybe-local])}
  (fn [ingested _]
    (ingested-model ingested)))

(defn- coerce-keys [data schemas]
  (reduce (fn [data [k schema]] (update data k #(mc/coerce schema % mtx/string-transformer)))
          data
          schemas))

(defn- xform-one [model-name ingested]
  (let [spec (make-spec model-name nil)]
    (assert spec (str "No serialization spec defined for model " model-name))
    (-> (select-keys ingested (:copy spec))
        (into (for [[k transform] (:transform spec)
                    :when (and (not (::nested transform))
                               ;; handling circuit-breaking
                               (not (contains? (::strip ingested) k)))
                    :let [_         (assert-one-defined transform :import :import-with-context)
                          import-k  (:as transform k)
                          input     (get ingested import-k)
                          f         (:import transform)
                          f-context (:import-with-context transform)
                          res       (if f (f input) (f-context ingested k input))]
                    :when (and (not= res ::skip)
                               (or (some? res)
                                   (contains? ingested import-k)))]
                [k res]))
        (coerce-keys (:coerce spec)))))

(defn- spec-nested! [model-name ingested instance]
  (let [spec (make-spec model-name nil)]
    (doseq [[k transform] (:transform spec)
            :when (and (::nested transform)
                       ;; handling circuit-breaking
                       (not (contains? (::strip ingested) k)))
            :let [_         (assert-one-defined transform :import :import-with-context)
                  input     (get ingested k)
                  f         (:import transform)
                  f-context (:import-with-context transform)]]
      (if f (f input) (f-context instance k input)))))

(defn default-load-one!
  "Default implementation of `load-one!`"
  [ingested maybe-local]
  (let [model-name (ingested-model ingested)
        adjusted   (xform-one model-name ingested)
        instance   (binding [mi/*deserializing?* true]
                     (if (nil? maybe-local)
                       (load-insert! model-name adjusted)
                       (load-update! model-name adjusted maybe-local)))]
    (spec-nested! model-name ingested instance)
    instance))

(defmethod load-one! :default [ingested maybe-local]
  (default-load-one! ingested maybe-local))

(defn entity-id?
  "Checks if the given string is a 21-character NanoID. Useful for telling entity IDs apart from identity hashes."
  [id-str]
  (boolean (and id-str
                (string? id-str)
                (re-matches #"^[A-Za-z0-9_-]{21}$" id-str))))

;; TODO: Clean up this [[identity-hash]] infrastructure once the `seed_entity_ids` issue is fixed. See above on the
;; details of the two hashing schemes.
(defn- find-by-identity-hash
  "Given a model and a target identity hash, this scans the appdb for any instance of the model corresponding to the
  hash. Does a complete scan, so this should be called sparingly!"
  ;; TODO This should be able to use a cache of identity-hash values from the start of the deserialization process.
  ;; Note that it needs to include either updates (or worst-case, invalidation) at [[load-one!]] time.
  [model id-hash]
  (->> (t2/reducible-select model)
       (into [] (comp (filter #(= id-hash (identity-hash %)))
                      (map t2.realize/realize)
                      (take 1)))
       first))

(defn lookup-by-id
  "Given an ID string, this endeavours to find the matching entity, whether it's an entity ID or identity hash.
  This is useful when writing [[xform-one]] to turn a foreign key from a portable form to an appdb ID.
  Returns a Toucan entity or nil."
  [model id-str]
  (if (entity-id? id-str)
    (t2/select-one model :entity_id id-str)
    (find-by-identity-hash model id-str)))

(def ^:private max-label-length 100)
(def ^:private max-label-bytes 200) ;; 255 is a limit in ext4

(defn- truncate-label [^String s]
  (-> s
      (u.str/limit-bytes max-label-bytes)
      (u.str/limit-chars max-label-length)))

(defn- lower-plural [s]
  (-> s u/lower-case-en (str "s")))

(defn storage-leaf-file-name
  "Captures the common pattern for leaf file names as `entityID_label`."
  ([id]       (str id))
  ([id label] (if (nil? label)
                (storage-leaf-file-name id)
                (str id "_" (truncate-label label)))))

(defn storage-default-collection-path
  "Implements the most common structure for [[storage-path]] - `collections/c1/c2/c3/models/entityid_label.ext`"
  [entity {:keys [collections]}]
  (let [{:keys [model id label]} (-> entity path last)]
    (concat ["collections"]
            (get collections (:collection_id entity)) ;; This can be nil, but that's fine - that's the root collection.
            [(lower-plural model) (storage-leaf-file-name id label)])))

(defmulti storage-path
  "Returns a seq of storage path components for a given entity. Dispatches on model name."
  {:arglists '([entity ctx])}
  (fn [entity _] (ingested-model entity)))

(defmethod storage-path :default [entity ctx]
  (storage-default-collection-path entity ctx))

(defn storage-base-context
  "Creates the basic context for storage. This is a map with a single entry: `:collections` is a map from collection ID
  to the path of collections."
  []
  (let [colls      (t2/select ['Collection :id :entity_id :location :slug])
        coll-names (into {} (for [{:keys [id entity_id slug]} colls]
                              [(str id) (storage-leaf-file-name entity_id slug)]))
        coll->path (into {} (for [{:keys [entity_id id location]} colls
                                  :let [parents (rest (str/split location #"/"))]]
                              [entity_id (map coll-names (concat parents [(str id)]))]))]
    {:collections coll->path}))

;;; # Utilities for implementing serdes
;;; Note that many of these use `^::cache` to cache their lookups during deserialization. This greatly reduces the
;;; number of database lookups, since many entities might belong to eg. a single collection.

;;; ## General foreign keys

(defn ^:dynamic ^::cache *export-fk*
  "Given a numeric foreign key and its model (symbol, name or IModel), looks up the entity by ID and gets its entity ID
  or identity hash.
  Unusual parameter order means this can be used as `(update x :some_id export-fk 'SomeModel)`.

  NOTE: This works for both top-level and nested entities. Top-level entities like `Card` are returned as just a
  portable ID string.. Nested entities are returned as a vector of such ID strings."
  [id model]
  (when id
    (let [model-name (name model)
          entity     (t2/select-one model (first (t2/primary-keys model)) id)
          path       (when entity
                       (mapv :id (generate-path model-name entity)))]
      (cond
        (nil? entity)      (throw (ex-info "FK target not found" {:model model
                                                                  :id    id
                                                                  :skip  true
                                                                  ::type :target-not-found}))
        (= (count path) 1) (first path)
        :else              path))))

(defmacro ^:private fk-elide
  "If a call to `*export-fk*` inside of this fails, do not export the whole data structure"
  [& body]
  `(try
     ~@body
     (catch clojure.lang.ExceptionInfo e#
       (when-not (= (::type (ex-data e#)) :target-not-found)
         (throw e#))
       nil)))

(defn ^:dynamic ^::cache *import-fk*
  "Given an identifier, and the model it represents (symbol, name or IModel), looks up the corresponding
  entity and gets its primary key.

  The identifier can be a single entity ID string, a single identity-hash string, or a vector of entity ID and hash
  strings. If the ID is compound, then the last ID is the one that corresponds to the model. This allows for the
  compound IDs needed for nested entities like `DashboardCard`s to get their [[dependencies]].

  Throws if the corresponding entity cannot be found.

  Unusual parameter order means this can be used as `(update x :some_id import-fk 'SomeModel)`."
  [eid model]
  (when eid
    (let [eid    (if (vector? eid)
                   (last eid)
                   eid)
          entity (lookup-by-id model eid)]
      (if entity
        (get entity (first (t2/primary-keys model)))
        (throw (ex-info "Could not find foreign key target - bad serdes dependencies or other serialization error"
                        {:entity_id eid :model (name model)}))))))

(defn ^:dynamic ^::cache *export-fk-keyed*
  "Given a numeric ID, look up a different identifying field for that entity, and return it as a portable ID.
  Eg. `Database.name`.
  [[import-fk-keyed]] is the inverse.
  Unusual parameter order lets this be called as, for example, `(update x :db_id export-fk-keyed :model/Database :name)`.

  Note: This assumes the primary key is called `:id`."
  [id model field]
  (t2/select-one-fn field model :id id))

(defn ^:dynamic ^::cache *import-fk-keyed*
  "Given a single, portable, identifying field and the model it refers to, this resolves the entity and returns its
  numeric `:id`.
  Eg. `Database.name`.

  Unusual parameter order lets this be called as, for example,
  `(update x :creator_id import-fk-keyed :model/Database :name)`."
  [portable model field]
  (t2/select-one-pk model field portable))

;;; ## Users
(defn ^:dynamic ^::cache *export-user*
  "Exports a user as the email address.
  This just calls [[export-fk-keyed]], but the counterpart [[import-user]] is more involved. This is a unique function
  so they form a pair."
  [id]
  (when id (*export-fk-keyed* id 'User :email)))

(defn ^:dynamic ^::cache *import-user*
  "Imports a user by their email address.
  If a user with that email address exists, returns its primary key.
  If no such user exists, creates a dummy inactive one with the default settings, blank name, and randomized password.
  Does not send any invite emails."
  [email]
  (when email
    (or (*import-fk-keyed* email 'User :email)
        ;; Need to break a circular dependency here.
        (:id ((resolve 'metabase.users.models.user/serdes-synthesize-user!) {:email email :is_active false})))))

;;; ## Tables

(defn ^:dynamic ^::cache *export-table-fk*
  "Given a numeric `table_id`, return a portable table reference.
  If the `table_id` is `nil`, return `nil`. This is legal for a native question.
  That has the form `[db-name schema table-name]`, where the `schema` might be nil.
  [[import-table-fk]] is the inverse."
  [table-id]
  (when table-id
    (let [{:keys [db_id name schema]} (t2/select-one :model/Table :id table-id)
          db-name                     (t2/select-one-fn :name :model/Database :id db_id)]
      [db-name schema name])))

(defn ^:dynamic ^::cache *import-table-fk*
  "Given a `table_id` as exported by [[export-table-fk]], resolve it back into a numeric `table_id`.
  The input might be nil, in which case so is the output. This is legal for a native question."
  [[db-name schema table-name :as table-id]]
  (when table-id
    (if-let [db-id (t2/select-one-fn :id :model/Database :name db-name)]
      (or (t2/select-one-fn :id :model/Table :name table-name :schema schema :db_id db-id)
          (throw (ex-info (format "table id present, but no table found: %s" table-id)
                          {:table-id table-id})))
      (throw (ex-info (format "table id present, but database not found: %s" table-id)
                      {:table-id table-id
                       :database-names (sort (t2/select-fn-vec :name :model/Table))})))))

(defn table->path
  "Given a `table_id` as exported by [[export-table-fk]], turn it into a `[{:model ...}]` path for the Table.
  This is useful for writing [[dependencies]] implementations."
  [[db-name schema table-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}]))

(def ^:private storage-dirs {"Database" "databases"
                             "Schema"   "schemas"
                             "Table"    "tables"
                             "Field"    "fields"})

(defn storage-path-prefixes
  "The [[serdes/storage-path]] for Table is a bit tricky, and shared with Fields and FieldValues, so it's
  factored out here.
  Takes the :serdes/meta value for a `Table`!
  The return value includes the directory for the Table, but not the file for the Table itself.

  With a schema: `[\"databases\" \"db_name\" \"schemas\" \"public\" \"tables\" \"customers\"]`
  No schema:     `[\"databases\" \"db_name\" \"tables\" \"customers\"]`"
  [path]
  (into [] cat
        (for [entry path]
          [(or (get storage-dirs (:model entry))
               (throw (ex-info "Could not find dir name" {:entry entry})))
           (:id entry)])))

;;; ## Fields

(defn- field-hierarchy [id]
  (reverse
   (t2/select :model/Field
              {:with-recursive [[[:parents {:columns [:id :name :parent_id :table_id]}]
                                 {:union-all [{:from   [[:metabase_field :mf]]
                                               :select [:mf.id :mf.name :mf.parent_id :mf.table_id]
                                               :where  [:= :id id]}
                                              {:from   [[:metabase_field :pf]]
                                               :select [:pf.id :pf.name :pf.parent_id :pf.table_id]
                                               :join   [[:parents :p] [:= :p.parent_id :pf.id]]}]}]]
               :from           [:parents]
               :select         [:name :table_id]})))

(defn recursively-find-field-q
  "Build a query to find a field among parents (should start with bottom-most field first), i.e.:

  `(recursively-find-field-q 1 [\"inner\" \"outer\"])`"
  [table-id [field & rest]]
  (when field
    {:from   [:metabase_field]
     :select [:id]
     :where  [:and
              [:= :table_id table-id]
              [:= :name field]
              [:= :parent_id (recursively-find-field-q table-id rest)]]}))

(defn ^:dynamic ^::cache *export-field-fk*
  "Given a numeric `field_id`, return a portable field reference.
  That has the form `[db-name schema table-name field-name]`, where the `schema` might be nil.
  [[*import-field-fk*]] is the inverse."
  [field-id]
  (when field-id
    (let [fields                      (field-hierarchy field-id)
          [db-name schema field-name] (*export-table-fk* (:table_id (first fields)))]
      (into [db-name schema field-name] (map :name fields)))))

(defn ^:dynamic ^::cache *import-field-fk*
  "Given a `field_id` as exported by [[*export-field-fk*]], resolve it back into a numeric `field_id`."
  [[db-name schema table-name & fields :as field-id]]
  (when field-id
    (let [table-id (*import-table-fk* [db-name schema table-name])
          field-q  (recursively-find-field-q table-id (reverse fields))]
      (t2/select-one-pk :model/Field field-q))))

(defn field->path
  "Given a `field_id` as exported by [[export-field-fk]], turn it into a `[{:model ...}]` path for the Field.
  This is useful for writing [[dependencies]] implementations."
  [[db-name schema table-name field-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}
                  {:model "Field" :id field-name}]))

;;; ## MBQL Fields

(defn- mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  [form]
  (mbql.normalize/is-clause? #{:field :field-id :fk-> :dimension :metric :segment :measure} form))

(defn- normalize [mbql]
  (if-not (mbql-entity-reference? mbql)
    mbql
    (into [(keyword (first mbql))] (map normalize) (rest mbql))))

(defn- mbql-id->fully-qualified-name
  [mbql]
  (-> mbql
      normalize
      (lib.util.match/replace
        ;; `integer?` guard is here to make the operation idempotent
        [:field (id :guard integer?) opts]
        [:field (*export-field-fk* id) (mbql-id->fully-qualified-name opts)]

        ;; `integer?` guard is here to make the operation idempotent
        [:field (id :guard integer?)]
        [:field (*export-field-fk* id)]

        ;; field-id is still used within parameter mapping dimensions
        ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
        [:field-id (id :guard integer?)]
        [:field-id (*export-field-fk* id)]

        {:source-table (id :guard integer?)}
        (assoc &match :source-table (*export-table-fk* id))

        ;; source-field is also used within parameter mapping dimensions
        ;; example relevant clause - [:field 2 {:source-field 1}]
        {:source-field (id :guard integer?)}
        (assoc &match :source-field (*export-field-fk* id))

        [:dimension (dim :guard vector?)]
        [:dimension (mbql-id->fully-qualified-name dim)]

        [:metric (id :guard integer?)]
        [:metric (*export-fk* id 'Card)]

        [:segment (id :guard integer?)]
        [:segment (*export-fk* id 'Segment)]

        [:measure (id :guard integer?)]
        [:measure (*export-fk* id 'Measure)])))

(defn- export-source-table
  [source-table]
  (if (and (string? source-table)
           (str/starts-with? source-table "card__"))
    (*export-fk* (-> source-table
                     (str/split #"__")
                     second
                     Integer/parseInt)
                 'Card)
    (*export-table-fk* source-table)))

(defn- ids->fully-qualified-names
  [entity]
  (lib.util.match/replace entity
    mbql-entity-reference?
    (mbql-id->fully-qualified-name &match)

    sequential?
    (mapv ids->fully-qualified-names &match)

    map?
    (reduce-kv
     (fn [entity k _v]
       (let [f (case k
                 :database                     (fn [db-id]
                                                 (if (= db-id lib.schema.id/saved-questions-virtual-database-id)
                                                   "database/__virtual"
                                                   (t2/select-one-fn :name :model/Database :id db-id)))
                 (:card_id :card-id)           #(*export-fk* % :model/Card) ; attributes that refer to db fields use `_`; template-tags use `-`
                 (:source_table :source-table) export-source-table
                 ::mb.viz/param-mapping-source *export-field-fk*
                 :segment                      #(*export-fk* % :model/Segment)
                 :snippet-id                   #(*export-fk* % :model/NativeQuerySnippet)
                 #_else                        ids->fully-qualified-names)]
         (update entity k f)))
     &match
     &match)))

(defn export-mbql
  "Given an MBQL expression, convert it to an EDN structure and turn the non-portable Database, Table and Field IDs
  inside it into portable references."
  [encoded]
  (let [encoded (cond-> encoded
                  ;; temporary usage until we port SerDes to Lib / MBQL 5
                  (:lib/type encoded) #_{:clj-kondo/ignore [:discouraged-var]} lib/->legacy-MBQL)]
    (ids->fully-qualified-names encoded)))

(defn- portable-id?
  "True if the provided string is either an Entity ID or identity-hash string."
  [s]
  (and (string? s)
       (or (entity-id? s)
           (identity-hash? s))))

(defn- mbql-fully-qualified-names->ids*
  [entity]
  (lib.util.match/replace entity
    ;; handle legacy `:field-id` forms encoded prior to 0.39.0
    ;; and also *current* expression forms used in parameter mapping dimensions
    ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
    [(:or :field-id "field-id") fully-qualified-name]
    (mbql-fully-qualified-names->ids* [:field fully-qualified-name])

    [(:or :field "field") (fully-qualified-name :guard vector?) opts]
    [:field (*import-field-fk* fully-qualified-name) (mbql-fully-qualified-names->ids* opts)]
    [(:or :field "field") (fully-qualified-name :guard vector?)]
    [:field (*import-field-fk* fully-qualified-name)]

    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
    {:source-field (fully-qualified-name :guard vector?)}
    (assoc &match :source-field (*import-field-fk* fully-qualified-name))

    {:database (fully-qualified-name :guard string?)}
    (-> &match
        (assoc :database (if (= fully-qualified-name "database/__virtual")
                           lib.schema.id/saved-questions-virtual-database-id
                           (t2/select-one-pk :model/Database :name fully-qualified-name)))
        mbql-fully-qualified-names->ids*) ; Process other keys

    {:card-id (entity-id :guard portable-id?)}
    (-> &match
        (assoc :card-id (*import-fk* entity-id 'Card))
        mbql-fully-qualified-names->ids*) ; Process other keys

    [(:or :metric "metric") (entity-id :guard portable-id?)]
    [:metric (*import-fk* entity-id 'Card)]

    [(:or :segment "segment") (fully-qualified-name :guard portable-id?)]
    [:segment (*import-fk* fully-qualified-name 'Segment)]

    [(:or :measure "measure") (fully-qualified-name :guard portable-id?)]
    [:measure (*import-fk* fully-qualified-name 'Measure)]

    (_ :guard (every-pred map? #(vector? (:source-table %))))
    (-> &match
        (assoc :source-table (*import-table-fk* (:source-table &match)))
        mbql-fully-qualified-names->ids*)

    (_ :guard (every-pred map? #(vector? (:source_table %))))
    (-> &match
        (assoc :source_table (*import-table-fk* (:source_table &match)))
        mbql-fully-qualified-names->ids*)

    (_ :guard (every-pred map? (comp portable-id? :source-table)))
    (-> &match
        (assoc :source-table (str "card__" (*import-fk* (:source-table &match) 'Card)))
        mbql-fully-qualified-names->ids*)

    (_ :guard (every-pred map? (comp portable-id? :source_table)))
    (-> &match
        (assoc :source_table (str "card__" (*import-fk* (:source_table &match) 'Card)))
        mbql-fully-qualified-names->ids*) ;; process other keys

    (_ :guard (every-pred map? (comp portable-id? :snippet-id)))
    (-> &match
        (assoc :snippet-id (*import-fk* (:snippet-id &match) 'NativeQuerySnippet))
        mbql-fully-qualified-names->ids*)))

(defn- mbql-fully-qualified-names->ids
  [entity]
  (mbql-fully-qualified-names->ids* entity))

(defn import-mbql
  "Given an MBQL expression as an EDN structure with portable IDs embedded, convert the IDs back to raw numeric IDs."
  [exported]
  (mbql-fully-qualified-names->ids exported))

(declare ^:private mbql-deps-map)

(defn- mbql-deps-vector [entity]
  (match entity
    [:field     (field :guard vector?)]      #{(field->path field)}
    ["field"    (field :guard vector?)]      #{(field->path field)}
    [:field-id  (field :guard vector?)]      #{(field->path field)}
    ["field-id" (field :guard vector?)]      #{(field->path field)}
    [:field     (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    ["field"    (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    [:field-id  (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    ["field-id" (field :guard vector?) tail] (into #{(field->path field)} (mbql-deps-map tail))
    [:metric    (field :guard portable-id?)] #{[{:model "Card" :id field}]}
    ["metric"   (field :guard portable-id?)] #{[{:model "Card" :id field}]}
    [:segment   (field :guard portable-id?)] #{[{:model "Segment" :id field}]}
    ["segment"  (field :guard portable-id?)] #{[{:model "Segment" :id field}]}
    [:measure   (field :guard portable-id?)] #{[{:model "Measure" :id field}]}
    ["measure"  (field :guard portable-id?)] #{[{:model "Measure" :id field}]}
    :else (reduce #(cond
                     (map? %2)    (into %1 (mbql-deps-map %2))
                     (vector? %2) (into %1 (mbql-deps-vector %2))
                     :else %1)
                  #{}
                  entity)))

(defn- mbql-deps-map [entity]
  (assert (not (:lib/type entity))
          "SerDes v2 does not currently work on MBQL 5, please convert to legacy first")
  (->> (for [[k v] entity]
         (cond
           (and (= k :database)
                (string? v)
                (not= v "database/__virtual"))        #{[{:model "Database" :id v}]}
           (and (= k :source-table) (vector? v))      #{(table->path v)}
           (and (= k :source-table) (portable-id? v)) #{[{:model "Card" :id v}]}
           (and (= k :source-field) (vector? v))      #{(field->path v)}
           (and (= k :snippet-id)   (portable-id? v)) #{[{:model "NativeQuerySnippet" :id v}]}
           (and (= k :card_id)      (string? v))      #{[{:model "Card" :id v}]}
           (and (= k :card-id)      (string? v))      #{[{:model "Card" :id v}]}
           (map? v)                                   (mbql-deps-map v)
           (vector? v)                                (mbql-deps-vector v)))
       (reduce set/union #{})))

(defn mbql-deps
  "Given an MBQL expression as exported, with qualified names like `[\"some-db\" \"schema\" \"table_name\"]` instead of
  raw IDs, return the corresponding set of serdes dependencies. The query can't be imported until all the referenced
  databases, tables and fields are loaded."
  [entity]
  (cond
    (map? entity)     (mbql-deps-map entity)
    (seqable? entity) (mbql-deps-vector entity)
    :else             (mbql-deps-vector [entity])))

;;; ## Dashboard/Question Parameters

(defn- export-parameter-mapping [mapping]
  (ids->fully-qualified-names mapping))

(defn export-parameter-mappings
  "Given the :parameter_mappings field of a `Card` or `DashboardCard`, as a vector of maps, converts
  it to a portable form with the field IDs replaced with `[db schema table field]` references."
  [mappings]
  (map export-parameter-mapping mappings))

(defn import-parameter-mappings
  "Given the :parameter_mappings field as exported by serialization convert its field references
  (`[db schema table field]`) back into raw IDs."
  [mappings]
  (->> mappings
       (map mbql-fully-qualified-names->ids)
       (map #(m/update-existing % :card_id *import-fk* 'Card))))

(defn export-parameters
  "Given the :parameter field of a `Card` or `Dashboard`, as a vector of maps, converts
  it to a portable form with the CardIds/FieldIds replaced with `[db schema table field]` references."
  [parameters]
  (map ids->fully-qualified-names parameters))

(defn import-parameters
  "Given the :parameter field as exported by serialization convert its field references
  (`[db schema table field]`) back into raw IDs."
  [parameters]
  (for [param parameters]
    (-> param
        mbql-fully-qualified-names->ids
        (m/update-existing-in [:values_source_config :card_id] *import-fk* 'Card))))

(defn parameters-deps
  "Given the :parameters (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [parameters]
  (reduce set/union #{}
          (for [parameter parameters
                :when (= (keyword (:values_source_type parameter)) :card)
                :let  [config (:values_source_config parameter)]]
            (set/union #{[{:model "Card" :id (:card_id config)}]}
                       (mbql-deps-vector (:value_field config))))))

;;; ## Viz settings

(def link-card-model->toucan-model
  "A map from model on linkcards to its corresponding toucan model.

  Link cards are dashcards that link to internal entities like Database/Dashboard/... or an url.

  It's here instead of [[metabase.dashboards.models.dashboard-card]] to avoid cyclic deps."
  {"card"       :model/Card
   "dataset"    :model/Card
   "collection" :model/Collection
   "database"   :model/Database
   "dashboard"  :model/Dashboard
   "question"   :model/Card
   "table"      :model/Table})

(defn- export-viz-link-card
  [settings]
  (m/update-existing-in
   settings
   [:link :entity]
   (fn [{:keys [id model] :as entity}]
     (merge entity
            {:id (case model
                   "table"    (*export-table-fk* id)
                   "database" (*export-fk-keyed* id :model/Database :name)
                   (*export-fk* id (link-card-model->toucan-model model)))}))))

(defn- json-ids->fully-qualified-names
  "Converts IDs to fully qualified names inside a JSON string.
  Returns a new JSON string with the IDs converted inside."
  [json-str]
  (-> json-str
      json/decode+kw
      ids->fully-qualified-names
      json/encode))

(defn- json-mbql-fully-qualified-names->ids
  "Converts fully qualified names to IDs in MBQL embedded inside a JSON string.
  Returns a new JSON string with the IDs converted inside."
  [json-str]
  (-> json-str
      json/decode+kw
      mbql-fully-qualified-names->ids
      json/encode))

(defn- export-viz-click-behavior-link
  [{:keys [linkType type] :as click-behavior}]
  (fk-elide
   (cond-> click-behavior
     (= type "link") (-> (update :targetId *export-fk* (link-card-model->toucan-model linkType))
                         (u/update-some :tabId *export-fk* :model/DashboardTab)))))

(defn- import-viz-click-behavior-link
  [{:keys [linkType type] :as click-behavior}]
  (cond-> click-behavior
    (= type "link") (-> (update :targetId *import-fk* (link-card-model->toucan-model linkType))
                        (u/update-some :tabId *import-fk* :model/DashboardTab))))

(defn- export-viz-click-behavior-mapping [mapping]
  (-> mapping
      (m/update-existing    :id                  json-ids->fully-qualified-names)
      (m/update-existing-in [:target :id]        json-ids->fully-qualified-names)
      (m/update-existing-in [:target :dimension] ids->fully-qualified-names)))

(defn- import-viz-click-behavior-mapping [mapping]
  (-> mapping
      (m/update-existing    :id                  json-mbql-fully-qualified-names->ids)
      (m/update-existing-in [:target :id]        json-mbql-fully-qualified-names->ids)
      (m/update-existing-in [:target :dimension] mbql-fully-qualified-names->ids)))

(defn- export-viz-click-behavior-mappings
  "The `:parameterMapping` on a `:click_behavior` viz settings is a map of... IDs turned into JSON strings which have
  been keywordized. Therefore the keys must be converted to strings, parsed, exported, and JSONified. The values are
  ported by [[export-viz-click-behavior-mapping]]."
  [mappings]
  (into {} (for [[kw-key mapping] mappings
                 ;; Mapping keyword shouldn't been a keyword in the first place, it's just how it's processed after
                 ;; being selected from db. In an ideal world we'd either have different data layout for
                 ;; click_behavior or not convert it's keys to a keywords. We need its full content here.
                 :let [k (u/qualified-name kw-key)]]
             (if (mb.viz/dimension-param-mapping? mapping)
               [(json-ids->fully-qualified-names k)
                (export-viz-click-behavior-mapping mapping)]
               [k mapping]))))

(defn- import-viz-click-behavior-mappings
  "The exported form of `:parameterMapping` on a `:click_behavior` viz settings is a map of JSON strings which contain
  fully qualified names. These must be parsed, imported, JSONified and then turned back into keywords, since that's the
  form used internally."
  [mappings]
  (into {} (for [[json-key mapping] mappings]
             (if (mb.viz/dimension-param-mapping? mapping)
               [(keyword (json-mbql-fully-qualified-names->ids json-key))
                (import-viz-click-behavior-mapping mapping)]
               [json-key mapping]))))

(defn- export-viz-click-behavior [settings]
  (some-> settings
          (u/update-some :click_behavior export-viz-click-behavior-link)
          (m/update-existing-in [:click_behavior :parameterMapping] export-viz-click-behavior-mappings)))

(defn- import-viz-click-behavior [settings]
  (some-> settings
          (m/update-existing    :click_behavior import-viz-click-behavior-link)
          (m/update-existing-in [:click_behavior :parameterMapping] import-viz-click-behavior-mappings)))

(defn- export-pivot-table [settings]
  (some-> settings
          (m/update-existing-in [:pivot_table.column_split :rows] ids->fully-qualified-names)
          (m/update-existing-in [:pivot_table.column_split :columns] ids->fully-qualified-names)))

(defn- import-pivot-table [settings]
  (some-> settings
          (m/update-existing-in [:pivot_table.column_split :rows] mbql-fully-qualified-names->ids)
          (m/update-existing-in [:pivot_table.column_split :columns] mbql-fully-qualified-names->ids)))

(defn- export-visualizations [entity]
  (lib.util.match/replace
    entity
    ["field-id" (id :guard number?)]      ["field-id" (*export-field-fk* id)]
    [:field-id  (id :guard number?)]      [:field-id  (*export-field-fk* id)]
    ["field-id" (id :guard number?) tail] ["field-id" (*export-field-fk* id) (export-visualizations tail)]
    [:field-id  (id :guard number?) tail] [:field-id  (*export-field-fk* id) (export-visualizations tail)]
    ["field"    (id :guard number?)]      ["field"    (*export-field-fk* id)]
    [:field     (id :guard number?)]      [:field     (*export-field-fk* id)]
    ["field"    (id :guard number?) tail] ["field"    (*export-field-fk* id) (export-visualizations tail)]
    [:field     (id :guard number?) tail] [:field     (*export-field-fk* id) (export-visualizations tail)]

    (_ :guard map?)
    (m/map-vals export-visualizations &match)

    (_ :guard vector?)
    (mapv export-visualizations &match)))

(defn- export-column-settings
  "Column settings use a JSON-encoded string as a map key, and it contains field numbers.
  This function parses those keys, converts the IDs to portable values, and serializes them back to JSON."
  [settings]
  (when settings
    (-> settings
        (update-keys #(-> % json/decode export-visualizations json/encode))
        (update-vals export-viz-click-behavior))))

(defn- export-card-dimension-ref
  [s]
  (if-let [[_ card-id] (and (string? s) (re-matches #"^\$_card:(\d+)_name$" s))]
    (str "$_card:" (*export-fk* (parse-long card-id) :model/Card) "_name")
    s))

(defn- export-visualizer-source-id
  [source-id]
  (when (string? source-id)
    (if-let [card-id (second (re-matches #"^card:(\d+)$" source-id))]
      (str "card:" (*export-fk* (parse-long card-id) :model/Card))
      source-id)))

(defn export-visualizer-settings
  "Update embedded card ids to entity ids in visualizer dashcard settings"
  [settings]
  (m/update-existing-in
   settings
   [:visualization :columnValuesMapping]
   (fn [mapping]
     (into {}
           (for [[k cols] mapping]
             (let [updated-cols (cond
                                  ;; e.g. [{:sourceId "card:119"} ...]
                                  (and (coll? cols) (map? (first cols)))
                                  (mapv #(update % :sourceId export-visualizer-source-id) cols)

                                  ;; e.g. ["$_card:119_name"] for funnel dimensions
                                  (and (coll? cols) (string? (first cols)))
                                  (mapv export-card-dimension-ref cols)

                                  :else cols)]
               [k updated-cols]))))))

(defn export-visualization-settings
  "Given the `:visualization_settings` map, convert all its field-ids to portable `[db schema table field]` form."
  [settings]
  (when settings
    (-> settings
        export-visualizations
        export-viz-link-card
        export-viz-click-behavior
        export-visualizer-settings
        export-pivot-table
        (update :column_settings export-column-settings))))

(defn- import-viz-link-card
  [settings]
  (m/update-existing-in
   settings
   [:link :entity]
   (fn [{:keys [id model] :as entity}]
     (merge entity
            {:id (case model
                   "table"    (*import-table-fk* id)
                   "database" (*import-fk-keyed* id :model/Database :name)
                   (*import-fk* id (link-card-model->toucan-model model)))}))))

(defn- import-visualizations [entity]
  (lib.util.match/replace
    entity
    [(:or :field-id "field-id") (fully-qualified-name :guard vector?) tail]
    [:field-id (*import-field-fk* fully-qualified-name) (import-visualizations tail)]
    [(:or :field-id "field-id") (fully-qualified-name :guard vector?)]
    [:field-id (*import-field-fk* fully-qualified-name)]

    [(:or :field "field") (fully-qualified-name :guard vector?) tail]
    [:field (*import-field-fk* fully-qualified-name) (import-visualizations tail)]
    [(:or :field "field") (fully-qualified-name :guard vector?)]
    [:field (*import-field-fk* fully-qualified-name)]

    (_ :guard map?)
    (m/map-vals import-visualizations &match)

    (_ :guard vector?)
    (mapv import-visualizations &match)))

(defn- import-column-settings [settings]
  (when settings
    (-> settings
        (update-keys #(-> % name json/decode import-visualizations json/encode))
        (update-vals import-viz-click-behavior))))

(defn- import-card-dimension-ref
  [s]
  (if-let [[_ card-id] (and (string? s) (re-matches #"^\$_card:([A-Za-z0-9_\-]{21})_name$" s))]
    (str "$_card:" (*import-fk* card-id :model/Card) "_name")
    s))

(defn- import-visualizer-source-id
  [source-id]
  (when (string? source-id)
    (if-let [card-entity-id (second (re-matches #"^card:([A-Za-z0-9_\-]{21})$" source-id))]
      (str "card:" (*import-fk* card-entity-id :model/Card))
      source-id)))

(defn import-visualizer-settings
  "Update embedded entity ids to card ids in visualizer dashcard settings"
  [settings]
  (m/update-existing-in
   settings
   [:visualization :columnValuesMapping]
   (fn [mapping]
     (into {}
           (for [[k cols] mapping]
             (let [updated-cols (cond
                                   ;; e.g. [{:sourceId "card:..."} ...]
                                  (and (coll? cols) (map? (first cols)))
                                  (mapv #(update % :sourceId import-visualizer-source-id) cols)

                                   ;; e.g. ["$_card:<id>_name"] for funnel dimensions
                                  (and (coll? cols) (string? (first cols)))
                                  (mapv import-card-dimension-ref cols)

                                  :else cols)]
               [k updated-cols]))))))

(defn import-visualization-settings
  "Given an EDN value as exported by [[export-visualization-settings]], convert its portable `[db schema table field]`
  references into Field IDs."
  [settings]
  (when settings
    (-> settings
        import-visualizations
        import-viz-link-card
        import-viz-click-behavior
        import-visualizer-settings
        import-pivot-table
        (update :column_settings import-column-settings))))

(defn- viz-link-card-deps
  [settings]
  (when-let [{:keys [model id]} (get-in settings [:link :entity])]
    #{(case model
        "table" (table->path id)
        [{:model (name (link-card-model->toucan-model model))
          :id    id}])}))

(defn- viz-click-behavior-deps
  [settings]
  (let [{:keys [linkType targetId type]} (:click_behavior settings)
        model (when linkType (link-card-model->toucan-model linkType))]
    (case type
      "link" (when model
               #{[{:model (name model)
                   :id    targetId}]})
      ;; TODO: We might need to handle the click behavior that updates dashboard filters? I can't figure out how get
      ;; that to actually attach to a filter to check what it looks like.
      nil)))

(defn visualization-settings-deps
  "Given the :visualization_settings (possibly nil) for an entity, return any embedded serdes-deps as a set.
  Always returns an empty set even if the input is nil."
  [viz]
  (let [column-settings-keys-deps (some->> viz
                                           :column_settings
                                           keys
                                           (map (comp mbql-deps json/decode name)))
        column-settings-vals-deps (some->> viz
                                           :column_settings
                                           vals
                                           (map viz-click-behavior-deps))
        link-card-deps            (viz-link-card-deps viz)
        click-behavior-deps       (viz-click-behavior-deps viz)]
    (->> (concat column-settings-keys-deps
                 column-settings-vals-deps
                 [(mbql-deps viz) link-card-deps click-behavior-deps])
         (filter some?)
         (reduce set/union #{}))))

(defn- viz-click-behavior-descendants [{:keys [click_behavior]} src]
  (let [{:keys [linkType targetId type]} click_behavior
        model (when linkType (link-card-model->toucan-model linkType))]
    (case type
      "link" (when (and model
                        (fk-elide (*export-fk* targetId model)))
               {[(name model) targetId] src})
      ;; TODO: We might need to handle the click behavior that updates dashboard filters? I can't figure out how get
      ;; that to actually attach to a filter to check what it looks like.
      nil)))

(defn- viz-column-settings-descendants [{:keys [column_settings]} src]
  (when column_settings
    (->> (vals column_settings)
         (mapcat #(viz-click-behavior-descendants % src))
         set)))

(defn visualization-settings-descendants
  "Given the :visualization_settings (possibly nil) for an entity, return anything that should be considered a
  descendant. Always returns an empty set even if the input is nil."
  [viz src]
  (set/union (viz-click-behavior-descendants  viz src)
             (viz-column-settings-descendants viz src)))

;;; Common transformers

(defn fk "Export Foreign Key" [model & [field-name]]
  (cond
    ;; this `::fk` is used in tests to determine that foreign keys are handled
    (= model :model/User)  {::fk true :export *export-user* :import *import-user*}
    (= model :model/Table) {::fk true :export *export-table-fk* :import *import-table-fk*}
    (= model :model/Field) {::fk true :export *export-field-fk* :import *import-field-fk*}
    field-name             {::fk    true
                            :export #(*export-fk-keyed* % model field-name)
                            :import #(*import-fk-keyed* % model field-name)}
    :else                  {::fk true :export #(*export-fk* % model) :import #(*import-fk* % model)}))

(defn nested "Nested entities" [model backward-fk opts]
  (let [model-name (name model)
        sorter     (:sort-by opts :created_at)
        key-field  (:key-field opts :entity_id)]
    {::nested             true
     :model               model
     :backward-fk         backward-fk
     :opts                opts
     :export-with-context (fn [current _ data]
                            (assert (every? #(t2/instance-of? model %) data)
                                    (format "Nested data is expected to be a %s, not %s" model (t2/model (first data))))
                            ;; `nil? data` check is for `extract-one` case in tests; make sure to add empty vectors in
                            ;; `extract-query` implementations for nested collections
                            (try
                              (->> (sort-by sorter data)
                                   (mapv #(extract-one model-name opts %)))
                              (catch Exception e
                                (throw (ex-info (format "Error extracting nested %s" model)
                                                {:model     model
                                                 :parent-id (:id current)}
                                                e)))))
     :import-with-context (fn [current _ lst]
                            (let [parent-id (:id current)
                                  first-eid (some->> (first lst)
                                                     (entity-id model-name))
                                  enrich    (fn [ingested]
                                              (-> ingested
                                                  (assoc backward-fk parent-id)
                                                  (update :serdes/meta #(or % [{:model model-name :id (get ingested key-field)}]))))]
                              (cond
                                (nil? first-eid)            ; no entity id, just drop existing stuff
                                (do (t2/delete! model backward-fk parent-id)
                                    (doseq [ingested lst]
                                      (load-one! (enrich ingested) nil)))

                                (entity-id? first-eid)      ; proper entity id, match by them
                                (do (t2/delete! model backward-fk parent-id :entity_id [:not-in (map :entity_id lst)])
                                    (doseq [ingested lst
                                            :let [ingested (enrich ingested)
                                                  local    (lookup-by-id model (entity-id model-name ingested))]]
                                      (load-one! ingested local)))

                                :else                       ; identity hash
                                (let [incoming  (set (map #(entity-id model-name %) lst))
                                      local     (->> (t2/reducible-select model backward-fk parent-id)
                                                     (into [] (map t2.realize/realize))
                                                     (m/index-by identity-hash))
                                      to-delete (into [] (comp (filter #(contains? incoming (key %)))
                                                               (map #(:id (val %))))
                                                      local)]
                                  (t2/delete! model :id [:in (map :id to-delete)])
                                  (doseq [ingested lst]
                                    (load-one! (enrich ingested) (get local (entity-id model-name ingested))))))))}))

(def parent-ref "Transformer for parent id for nested entities."
  (constantly
   {::fk true :export (constantly ::skip) :import identity}))

(def date "Transformer to parse the dates."
  (constantly
   {:export u.date/format :import #(if (string? %) (u.date/parse %) %)}))

(def kw "Transformer for keywordized values.

  Used so various comparisons in hooks work, like `t2/changes` will not indicate a changed property."
  (constantly
   {:export name :import keyword}))

(def optional-kw "Transformer for optional keywordized values.

  Used so various comparisons in hooks work, like `t2/changes` will not indicate a changed property."
  (constantly
   {:export #(when % (name %)) :import #(when % (keyword %))}))

(defn as
  "Serialize this field under the given key instead, typically because it has been logically transformed."
  [k xform]
  (assoc xform :as k))

(def backfill-entity-id-transformer
  "Backfills a missing `:entity_id` before export, and imports it as-is."
  (constantly
   {:export-with-context (fn [instance _key _eid]
                           (backfill-entity-id instance))
    :import              identity}))

(defn- compose*
  "Given two functions that transform the value at `k` within `x`, return their composition."
  [f g]
  (fn [m k x]
    (let [y (g m k x)]
      (f (assoc m k y) k y))))

(defn- maybe-lift [m k k-context]
  (let [f         (m k)
        f-context (m k-context)]
    (or f-context (fn [_ _ x] (f x)))))

(defn compose
  "Compose two transformations."
  [inner-xform outer-xform]
  {:export-with-context (compose* (maybe-lift inner-xform :export :export-with-context)
                                  (maybe-lift outer-xform :export :export-with-context))
   :import-with-context (compose* (maybe-lift outer-xform :import :import-with-context)
                                  (maybe-lift inner-xform :import :import-with-context))})

;;; ## Memoizing appdb lookups

(defmacro with-cache
  "Runs body with all functions marked with ::cache re-bound to memoized versions for performance."
  [& body]
  (let [ns* 'metabase.models.serialization]
    `(binding ~(reduce into []
                       (for [[var-sym var] (ns-interns ns*)
                             :when (::cache (meta var))
                             :let [fq-sym (symbol (name ns*) (name var-sym))]]
                         [fq-sym `(memoize ~fq-sym)]))
       ~@body)))
