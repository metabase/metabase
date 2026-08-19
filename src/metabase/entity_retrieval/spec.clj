(ns metabase.entity-retrieval.spec
  "Declarative membership and projection layer for library entities.

  Layer 1, [[define-source]]: per model, one, shared — the raw fields a library entity carries.
  Layer 2, [[define-projection]]: per consumer per model — membership, hydrations, the projection fn, and
  (for `:osi-context`) the invalidation `:basis`.
  Both layers live next to the models (`warehouse_schema/models/table.clj` etc.), exactly as
  `metabase.search.spec/define-spec` calls do; this namespace holds the registry and the functions that
  consume it.

  Two consumers are declared today:

  - `:library-index` — the pgvector `library_entity_index` document set, consumed by EE
    `metabase-enterprise.entity-retrieval.reconcile`.
  - `:osi-context` — the LLM prompt input for OSI metadata generation, consumed by the EE generation job.

  Membership here is headless: [[member-entities]] and [[member-entity]] must NOT permission-filter — the
  reconcile and generation jobs run with no current user. Callers surfacing results post-filter."
  (:require
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.error :as me]
   [metabase.collections.core :as collections]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.string :as u.str]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Registry ---------------------------------------------------

(def source-models
  "Models declaring a library source, in declaration-load order.
  Used to force-load the declaring namespaces (via [[toucan2.core/resolve-model]], the way
  `metabase.search.spec/specifications` does) before enumerating the registry."
  [:model/Table :model/Card :model/Measure :model/Segment])

;; {:sources {model decl}, :projections {projection-key {model decl}}}. defonce so reloading this namespace
;; alone doesn't orphan declarations registered by already-loaded model namespaces.
(defonce ^:private declarations
  (atom {}))

(def ^:private projection-keys
  "The declared consumers. A projection key outside this set is a typo, not an extension point."
  #{:library-index :osi-context})

(def ^:private SourceDeclaration
  [:map {:closed true}
   [:model :keyword]
   [:entity-type [:or :string [:map {:closed true} [:column :keyword]]]]
   [:fields [:sequential {:min 1} :keyword]]
   [:label {:optional true} [:fn var?]]])

(def ^:private MembershipDeclaration
  [:map {:closed true}
   [:where {:optional true} vector?]
   [:via-parent {:optional true} [:map {:closed true}
                                  [:model :keyword]
                                  [:fk :keyword]]]])

(def ^:private ProjectionDeclaration
  [:map {:closed true}
   [:membership MembershipDeclaration]
   [:project [:fn var?]]
   [:hydrate {:optional true} [:map-of :keyword [:fn var?]]]
   [:basis {:optional true} [:vector {:min 1} :keyword]]])

(defn- validate-source! [decl]
  (when-let [explanation (mr/explain SourceDeclaration decl)]
    (throw (ex-info (str "Invalid source declaration for " (:model decl) ": "
                         (pr-str (me/humanize explanation)))
                    {:decl decl, :errors (me/humanize explanation)}))))

(defn- assert-projection-key!
  "Throw on a projection key outside the declared set.
  Silently returning nothing for a typo would feed an empty desired set to a destructive reconcile and
  wipe the store, so an unknown key is an error everywhere, never an empty result."
  [projection-key]
  (when-not (contains? projection-keys projection-key)
    (throw (ex-info (str "Unknown projection key " projection-key)
                    {:projection projection-key, :known projection-keys}))))

(defn- validate-projection! [projection-key model decl]
  (assert-projection-key! projection-key)
  (when-let [explanation (mr/explain ProjectionDeclaration decl)]
    (throw (ex-info (str "Invalid " projection-key " projection declaration for " model ": "
                         (pr-str (me/humanize explanation)))
                    {:projection projection-key, :model model, :errors (me/humanize explanation)})))
  ;; An empty :membership map passes the schema (both keys are optional) but formats to `WHERE TRUE`, so
  ;; every row in the table would be reported as a library member — silently, and at LLM prices on the
  ;; :osi-context path. Same rule as an empty :basis: declare something or the declaration is a mistake.
  (let [{:keys [where via-parent]} (:membership decl)]
    (when-not (or where via-parent)
      (throw (ex-info ":membership declares neither :where nor :via-parent — that selects every row"
                      {:projection projection-key, :model model}))))
  (let [src (get-in @declarations [:sources model])]
    (when-not src
      (throw (ex-info (str "No source declared for " model " — define-source must precede define-projection")
                      {:projection projection-key, :model model})))
    (let [allowed (into (set (:fields src)) (keys (:hydrate decl)))]
      (when-let [bad (not-empty (into [] (remove allowed) (:basis decl)))]
        (throw (ex-info (str ":basis keys outside the source fields and hydrations: " (pr-str bad))
                        {:projection projection-key, :model model, :bad-keys bad}))))))

(defn register-source!
  "Validate and register a per-model source declaration."
  [model decl]
  (validate-source! decl)
  (swap! declarations assoc-in [:sources model] decl)
  model)

(defmacro define-source
  "Register `model`'s library source declaration — layer 1, one per model, shared by every projection.
  Lives next to the model, like `search.spec/define-spec`.

  Declaration keys:
  - `:entity-type` — the entity_type string member entities carry: a constant (\"table\"), or
    `{:column :type}` to derive it per row (Card's metric/model flavors).
  - `:fields` — columns selected onto every member entity.
  - `:label` (optional) — var of entity -> display name, used by [[entity-summary]]; defaults to `:name`."
  [model decl]
  `(register-source! ~model (assoc ~decl :model ~model)))

(defn register-projection!
  "Validate and register a per-consumer-per-model projection declaration."
  [projection-key model decl]
  (validate-projection! projection-key model decl)
  (swap! declarations assoc-in [:projections projection-key model] decl)
  [projection-key model])

(defmacro define-projection
  "Register a projection declaration for `model` — layer 2, one per consumer per model, next to the model.
  The model's [[define-source]] must already be registered.

  Declaration keys:
  - `:membership` — `{:where honeysql}` over the source's table, where the `:library/collection-ids`
    placeholder resolves to the library root + descendant collection ids; and/or
    `{:via-parent {:model m, :fk k}}` for entities that are members iff their parent row is a member
    (measure/segment via their table).
  - `:project` — var applied to one hydrated entity by [[project]].
  - `:hydrate` (optional) — `{key batch-fn-var}`; see [[hydrate]] for the batch contract.
  - `:basis` (optional, `:osi-context` only) — the field/hydration keys whose change schedules
    regeneration; each must be a declared source field or hydration key. Deterministic, bounded values
    only — an unstable basis input schedules every entity for regeneration on every run."
  [projection-key model decl]
  `(register-projection! ~projection-key ~model ~decl))

(defn source
  "The registered source declaration for `model`, loading its namespace if needed; nil when undeclared."
  [model]
  (t2/resolve-model model)
  (get-in @declarations [:sources model]))

(defn projection
  "The registered `projection-key` declaration for `model`, loading its namespace if needed; nil when
  undeclared."
  [projection-key model]
  (t2/resolve-model model)
  (get-in @declarations [:projections projection-key model]))

(defn projections
  "Map of model -> declaration for every model declaring `projection-key`, force-loading [[source-models]]
  first."
  [projection-key]
  (doseq [model source-models]
    (t2/resolve-model model))
  (get-in @declarations [:projections projection-key]))

(defn entity-type->model
  "Toucan model for an `entity_type` string the CRUD/tool APIs speak; nil for an unknown type.
  Card flavors (question/metric/model, and the stored `card` bucket) all resolve to `:model/Card`."
  [entity-type]
  (cond
    (entity-retrieval/card-entity-type? entity-type) :model/Card
    (= "table" entity-type)                          :model/Table
    (= "measure" entity-type)                        :model/Measure
    (= "segment" entity-type)                        :model/Segment))

;;; ------------------------------------------------- Membership --------------------------------------------------
;;;
;;; The per-model membership selects are the single source of membership truth, shared by the full-scan
;;; [[member-entities]] and the point [[member-entity]]. Headless: the reconcile and generation jobs run
;;; with no current user, so these selects must NOT permission-filter.

(defn- library-collection-ids
  "Collection ids that count as library content — the Library root and its descendants — or nil when no
  library collection exists. Content usually lives in the Data/Metrics sub-collections, but an entity
  placed directly in the root is library content too, so the root id is included."
  []
  (when-let [lib (collections/library-collection)]
    (vec (distinct (cons (:id lib) (collections/descendant-ids lib))))))

(defn- resolve-membership-where
  "Substitute the `:library/collection-ids` placeholder in a membership `:where` with the resolved ids."
  [where lib-ids]
  (walk/postwalk (fn [form] (if (= :library/collection-ids form) lib-ids form)) where))

(defn- row-entity-type [{:keys [entity-type]} row]
  (if (string? entity-type)
    entity-type
    ;; column-derived (Card): the column value may be keywordized by the model's transforms.
    (name (get row (:column entity-type)))))

(defn- member-rows
  "One model's membership select for `projection-key`: entity maps of the declared source fields plus
  `:entity_type`/`:entity_local_id`.
  `:id` restricts to one entity; `:parent-ids` restricts a `:via-parent` model to member parents."
  [projection-key model lib-ids {:keys [id parent-ids]}]
  (let [{:keys [fields] :as src}   (source model)
        ;; No declaration means no membership clauses, which formats to `WHERE TRUE` — every row a member.
        ;; Callers must check first; reaching here undeclared is a bug, not an empty result.
        {:keys [membership]}       (or (projection projection-key model)
                                       (throw (ex-info (str "No " projection-key " projection declared for " model)
                                                       {:projection projection-key, :model model})))
        {:keys [where via-parent]} membership
        clauses                    (cond-> []
                                     where      (conj (resolve-membership-where where lib-ids))
                                     via-parent (conj [:in (:fk via-parent) parent-ids])
                                     id         (conj [:= :id id]))]
    (mapv (fn [row]
            (assoc row
                   :entity_type     (row-entity-type src row)
                   :entity_local_id (:id row)))
          (t2/select (into [model] fields)
                     {:where (if (= 1 (count clauses)) (first clauses) (into [:and] clauses))}))))

(defn member-entities
  "Every entity currently in the library under `projection-key`'s membership, as maps of the declared
  source fields plus `:entity_type`/`:entity_local_id`; `[]` when no library collection exists.
  One select per declaring model; `:via-parent` models select after their parent model, restricted to
  member parent ids.
  No hydration (see [[hydrate]]), no ordering guarantee, and no permission filtering — the reconcile and
  generation jobs run headless, so callers surfacing these to a user must post-filter themselves.
  Throws on an unknown projection key, and on a known key with no registered declarations — either fed to
  a destructive reconcile would delete the store."
  [projection-key]
  (assert-projection-key! projection-key)
  (let [lib-ids (library-collection-ids)]
    (if (nil? lib-ids)
      []
      (let [decls        (projections projection-key)
            _            (when (empty? decls)
                           (throw (ex-info (str "No projections registered for " projection-key
                                                " — declaring namespaces not loaded?")
                                           {:projection projection-key})))
            models       (filterv #(contains? decls %) source-models)
            root?        (fn [model] (nil? (get-in decls [model :membership :via-parent])))
            root-results (into {}
                               (map (fn [model] [model (member-rows projection-key model lib-ids nil)]))
                               (filter root? models))
            via-results  (for [model models
                               :when (not (root? model))
                               :let  [{parent :model} (get-in decls [model :membership :via-parent])
                                      parent-ids      (not-empty (mapv :entity_local_id (root-results parent)))]
                               :when parent-ids]
                           (member-rows projection-key model lib-ids {:parent-ids parent-ids}))]
        (into [] cat (concat (map root-results (filter root? models)) via-results))))))

(defn member-entity
  "The entity map for one entity when it is a library member under `projection-key`; nil otherwise.
  Uses the same per-model membership selects as [[member-entities]].

  `entity-type` may be any Card flavor (`question`, `metric`, `model`, or `card`). The returned entity
  carries the Card's current database type. Card flavors share an entity class, so hydration and
  reconciliation continue to match the entity across relabels.

  A `:via-parent` entity is a member only when its parent is. Throws for an unknown projection key; nil
  always means \"not a member\", never \"unknown projection\"."
  [projection-key entity-type entity-local-id]
  (assert-projection-key! projection-key)
  (when-let [model (entity-type->model entity-type)]
    (when-let [lib-ids (library-collection-ids)]
      (when-let [decl (projection projection-key model)]
        (if-let [{parent :model, fk :fk} (get-in decl [:membership :via-parent])]
          ;; A parent that declares no projection has no members, so neither does this model — the same
          ;; answer [[member-entities]] gives, which skips a via-parent model with no parent results.
          (when (projection projection-key parent)
            (when-let [parent-id (t2/select-one-fn fk model :id entity-local-id)]
              (when (seq (member-rows projection-key parent lib-ids {:id parent-id}))
                (first (member-rows projection-key model lib-ids {:id entity-local-id, :parent-ids [parent-id]})))))
          (first (member-rows projection-key model lib-ids {:id entity-local-id})))))))

;;; ------------------------------------------------- Hydration ---------------------------------------------------

(defn hydration-key
  "The key a batch hydration fn's result map must use for an entity:
  [[metabase.entity-retrieval.core/entity-class]], so a Card's hydrations are found across a
  metric<->model relabel (its `osi_ai_context` row is stored under the canonical `card` type)."
  ([entity]
   (hydration-key (:entity_type entity) (:entity_local_id entity)))
  ([entity-type entity-local-id]
   (entity-retrieval/entity-class entity-type entity-local-id)))

(def hydration-query-chunk-size
  "IDs per `:in` clause in a hydration query, shared by every batch hydration fn so none of them can put an
  unbounded id list into one statement. Well under the app db's bind-parameter ceiling (Postgres: 65,535).
  It bounds one query, and nothing else: [[hydrate]] hands each batch fn the whole entity collection and
  holds its whole result map, so a hydration with many child rows per entity has to stream them and bound
  each entity's value itself (as the Table `:field-names` one does)."
  500)

(defn- raw-ai-context-rows
  "Select only the requested entity classes without invoking model transforms. Reading raw JSON lets one
  corrupt row become an entity-scoped hydration error instead of aborting the entire batch inside Toucan."
  [entities]
  (let [ids-by-type (reduce (fn [acc entity]
                              (let [[entity-type entity-id] (hydration-key entity)]
                                (update acc entity-type (fnil conj #{}) entity-id)))
                            {}
                            entities)]
    (into []
          (mapcat (fn [[entity-type ids]]
                    (mapcat (fn [id-chunk]
                              (t2/query {:select [:entity_type :entity_local_id :ai_context]
                                         :from   [:osi_ai_context]
                                         :where  [:and
                                                  [:= :entity_type entity-type]
                                                  [:in :entity_local_id (vec id-chunk)]]}))
                            (partition-all hydration-query-chunk-size ids))))
          ids-by-type)))

(def ^:private IndexedAiContextSlice
  "The slice of a stored `ai_context` the index projection consumes, checked structurally only.
  Deliberately laxer than the write-side `entity-retrieval/AiContext`: an oversized `:instructions`
  (the read side that serves instructions truncates anyway) or an unknown forward-compatible key is
  safely recoverable, and rejecting the row would stale or drop the entity's whole
  name/description/synonym slice on rebuild. A row is corrupt only when `:synonyms`/`:examples` are not
  even sequential — individual non-string or blank items are skipped by [[library-index-docs]], which
  also caps how many it consumes, so a malformed item never rejects the row."
  [:map
   [:synonyms {:optional true} [:maybe [:sequential :any]]]
   [:examples {:optional true} [:maybe [:sequential :any]]]])

(defn ai-context-by-entity
  "Batch `:ai-context` hydration shared by every model's `:library-index` declaration:
  [[hydration-key]] -> decoded `ai_context` for the requested entities only.

  Queries are grouped by normalized entity type and chunked for app-db parameter limits. Only the
  fields the index projection consumes are validated ([[IndexedAiContextSlice]]) — a legacy or
  forward-compatible row that would fail the write-side schema still hydrates. A malformed JSON value,
  a non-map, or structurally unusable `:synonyms`/`:examples` is returned as a Throwable under that
  entity's hydration key; [[project]] turns it into a contextual projection failure so callers can
  retain that entity's existing documents and continue with the rest."
  [entities]
  (into {}
        (map (fn [{:keys [entity_type entity_local_id ai_context]}]
               [(entity-retrieval/entity-class entity_type entity_local_id)
                (try
                  (let [decoded (cond-> ai_context
                                  (string? ai_context) json/decode+kw)]
                    (mu/validate-throw IndexedAiContextSlice decoded))
                  (catch Throwable e
                    (ex-info "Invalid osi_ai_context.ai_context"
                             {::data-defect true :entity-type entity_type :entity-local-id entity_local_id}
                             e)))]))
        (raw-ai-context-rows entities)))

(defn data-defect?
  "Whether `e` (or anything it wraps) reports an unusable stored value rather than an unforeseen error.
  The distinction is what a caller needs to decide whether to retry: a bad `ai_context` blob stays bad
  until a person repairs the row, so treating it as transient means retrying forever, while an unforeseen
  error may well be gone on the next run."
  [e]
  (loop [e e]
    (cond
      (nil? e)                    false
      (::data-defect (ex-data e)) true
      :else                       (recur (ex-cause e)))))

(defn hydrate
  "Apply `projection-key`'s batch hydrations to a collection of entities.

  Each distinct `[hydration-key batch-fn]` pair is invoked once with all entities whose model declares it.
  The batch fn returns a map of [[hydration-key]] to value and may issue multiple chunked queries. Every
  declared hydration key is added to each entity, using nil when the batch result has no entry.

  Call this with the whole collection: repeatedly hydrating individual entities defeats batching and can
  create N+1 queries. Split from [[member-entities]] so membership-only callers avoid hydration."
  [projection-key entities]
  (let [entities (vec entities)]
    (if (empty? entities)
      entities
      (let [declared (fn [entity]
                       (:hydrate (projection projection-key (entity-type->model (:entity_type entity)))))
            ;; group entities under each (key, fn) their model declares, so a fn shared across models
            ;; (e.g. :ai-context) still runs once over all of them.
            by-kf    (reduce (fn [acc entity]
                               (reduce-kv (fn [acc k f] (update acc [k f] (fnil conj []) entity))
                                          acc
                                          (declared entity)))
                             {}
                             entities)
            results  (into {} (map (fn [[[k f] es]] [[k f] (f es)])) by-kf)]
        (mapv (fn [entity]
                (reduce-kv (fn [entity k f]
                             (assoc entity k (get (results [k f]) (hydration-key entity))))
                           entity
                           (declared entity)))
              entities)))))

;;; ------------------------------------------------- Projection --------------------------------------------------

(defn- projection-for-entity [projection-key entity]
  (or (projection projection-key (entity-type->model (:entity_type entity)))
      (throw (ex-info (str "No " projection-key " projection declared for entity_type "
                           (pr-str (:entity_type entity)))
                      {:projection  projection-key
                       :entity-type (:entity_type entity)}))))

(defn- assert-hydrated!
  "Throw unless every hydration key `decl` declares is present on `entity`.
  Projecting — or stamping a basis from — an unhydrated entity must be loud, not silently wrong."
  [projection-key decl entity]
  (when-let [missing (not-empty (into [] (remove #(contains? entity %)) (keys (:hydrate decl))))]
    (throw (ex-info (str "Entity is missing declared hydration keys " (pr-str missing)
                         " — pass it through spec/hydrate first")
                    {:projection      projection-key
                     :entity-type     (:entity_type entity)
                     :entity-local-id (:entity_local_id entity)
                     :missing         missing}))))

(defn- assert-hydrations-valid!
  [decl entity]
  (doseq [k (keys (:hydrate decl))
          :let [value (get entity k)]
          :when (instance? Throwable value)]
    (throw value)))

(def max-osi-description-len
  "Maximum source-description length sent to OSI generation and stamped in its basis. The same normalized
  entity feeds both values, so a long description converges after one generation instead of producing a
  permanent prompt/basis mismatch. Retrieval-index descriptions keep their independent document cap."
  5000)

(defn- normalize-projection-entity
  [projection-key entity]
  (cond-> entity
    (and (= projection-key :osi-context) (string? (:description entity)))
    (update :description u.str/limit-chars max-osi-description-len)))

(defn project
  "Apply `projection-key`'s `:project` var to one hydrated entity.

  For `:library-index`, returns a realized vector of documents; for `:osi-context`, returns the prompt-input
  map. The function performs no hydration itself and throws when a declared hydration key is absent.

  Sequential results are realized inside the entity-scoped error handler. Any projection failure is
  rethrown as ex-info carrying the entity identity, allowing batch callers to count and isolate one bad
  entity."
  [projection-key entity]
  (try
    (let [entity (normalize-projection-entity projection-key entity)
          decl   (projection-for-entity projection-key entity)
          _      (assert-hydrated! projection-key decl entity)
          _      (assert-hydrations-valid! decl entity)
          result ((:project decl) entity)]
      ;; Projection declarations that return documents promise a collection. Realize it while the entity-scoped
      ;; catch is active so errors in lazy synonym/example processing keep their identity.
      (if (sequential? result) (vec result) result))
    (catch Throwable e
      (throw (ex-info (str projection-key " :project threw for " (:entity_type entity)
                           " " (:entity_local_id entity) ": " (ex-message e))
                      {:projection      projection-key
                       :entity-type     (:entity_type entity)
                       :entity-local-id (:entity_local_id entity)}
                      e)))))

(defn entity-summary
  "Uniform `{:entity_type :entity_local_id :name :description}` map for a member entity — the four-key
  shape EE reconcile's public API speaks.
  `:name` is the source's `:label` (Table: display_name falling back to name; default: the raw `:name`)."
  [entity]
  (let [{:keys [label]} (source (entity-type->model (:entity_type entity)))]
    {:entity_type     (:entity_type entity)
     :entity_local_id (:entity_local_id entity)
     :name            (if label (label entity) (:name entity))
     :description     (:description entity)}))

;;; --------------------------------------------------- Basis -----------------------------------------------------

(defn- canonical-basis-value
  "Canonical form of one basis value, or an ex-info throw.
  JSON-native scalars (nil, strings, booleans, integers, finite doubles) pass through; maps must have
  keyword keys and become sorted maps; sequential collections become vectors. Everything else — sets,
  keyword or date values, non-finite doubles, ratios — throws: a value that would not survive a JSON
  encode/decode round-trip `=`-unchanged makes every run report a phantom diff and pay to regenerate the entity."
  [ctx path v]
  (let [fail (fn [reason]
               (throw (ex-info (str "Basis value at " (pr-str path) " is not JSON-native: " reason)
                               (assoc ctx :path path, :value v, :reason reason))))]
    (cond
      (nil? v)        v
      (string? v)     v
      (boolean? v)    v
      (int? v)        v
      (double? v)     (if (Double/isFinite (double v)) v (fail "non-finite double"))
      (keyword? v)    (fail "keyword — decode keywordizes keys, not values; use a string")
      (set? v)        (fail "set — no stable order; sort into a vector in the hydration/projection fn")
      (map? v)        (into (sorted-map)
                            (map (fn [[k child]]
                                   (when-not (keyword? k)
                                     (fail (str "map key " (pr-str k) " is not a keyword")))
                                   [k (canonical-basis-value ctx (conj path k) child)]))
                            v)
      (sequential? v) (into []
                            (map-indexed (fn [i child] (canonical-basis-value ctx (conj path i) child)))
                            v)
      :else           (fail (str "unsupported type " (.getName (class v)))))))

(defn entity-basis
  "Deterministic projection of `entity`'s source fields named by `projection-key`'s `:basis` — the map the
  generation job stamps into `osi_ai_context.basis` and diffs against on later runs.
  Pure over an already-hydrated entity: loads nothing, and throws when a declared hydration key is absent —
  a basis stamped without `:field-names` would silently poison the diff forever.
  Returns a canonical value: a sorted map of JSON-native values (see [[canonical-basis-value]], which
  throws on anything that would not survive a JSON encode/decode round-trip `=`-unchanged), so comparison
  stays plain `=` against the keywordized read of the stored blob.
  Safe to call per entity inside a batch loop: every failure is an ex-info carrying the entity identity.
  Throws when the projection declares no `:basis` (only `:osi-context` does)."
  [projection-key entity]
  (let [entity (normalize-projection-entity projection-key entity)
        decl (projection-for-entity projection-key entity)
        ctx  {:projection      projection-key
              :entity-type     (:entity_type entity)
              :entity-local-id (:entity_local_id entity)}]
    (when-not (seq (:basis decl))
      (throw (ex-info (str projection-key " declares no :basis for entity_type "
                           (pr-str (:entity_type entity)))
                      ctx)))
    (assert-hydrated! projection-key decl entity)
    (into (sorted-map)
          (map (fn [k] [k (canonical-basis-value ctx [k] (get entity k))]))
          (:basis decl))))

(defn basis-diff
  "What changed between a stored basis `old` and a freshly built `new`; nil when nothing the projection
  cares about changed.
  nil is the empty diff: the generation job restamps and skips the LLM on it; a non-nil map names the
  changed keys with before/after values for the prompt.
  Keys absent from `new` are ignored — shrinking or renaming a `:basis` declaration must not regenerate
  the library; keys new in `new` count as changed.
  Never called with a nil `old`: a row with no stored basis carries `:diff nil` for fresh generation, not
  an everything-changed diff."
  [old new]
  (let [changed (into (sorted-set)
                      (keep (fn [[k new-value]]
                              (when (or (not (contains? old k))
                                        (not= new-value (get old k)))
                                k)))
                      new)]
    (when (seq changed)
      {:changed changed
       :from    (select-keys old changed)
       :to      (select-keys new changed)})))

;;; ---------------------------------------------- Index documents ------------------------------------------------

(defn doc-id
  "Content-addressed primary key for an index document.
  `instructions` is intentionally not an input: editing it must not re-embed an entity's name/synonyms."
  [entity-type entity-local-id doc-type doc-text]
  (u/encode-base64-bytes
   (buddy-hash/sha1 (str entity-type "|" entity-local-id "|" doc-type "|" doc-text))))

(def ^:private max-doc-chars
  "Char cap on a doc's text, applied before [[doc-id]] and embedding.
  The embedding layer skips a single text over the per-item token budget, which drops the doc and
  under-indexes the entity; truncating keeps it indexed."
  8000)

(def ^:private max-values-per-kind
  "Cap on synonym docs (and, separately, example docs) derived per entity, mirroring the API's per-list
  cap. Bounds index bloat from rows that bypass the API schema — SerDes, direct appdb writes, or rows
  predating the cap."
  50)

(defn- usable-index-value?
  "A synonym/example item the index can hold: a non-blank string. Non-strings (a corrupt or
  forward-compatible legacy row) and blanks are skipped rather than rejecting the whole slice."
  [v]
  (and (string? v) (not (str/blank? v))))

(defn- make-doc [entity-type entity-local-id doc-type doc-text]
  (let [doc-text (cond-> doc-text
                   (and (string? doc-text) (> (count doc-text) max-doc-chars)) (subs 0 max-doc-chars))]
    {:doc_id          (doc-id entity-type entity-local-id doc-type doc-text)
     :entity_type     entity-type
     :entity_local_id entity-local-id
     :doc_type        doc-type
     :doc_text        doc-text}))

(defn base-index-docs
  "The docs an entity has regardless of its `ai_context`: a `name` doc (always) and a `description` doc
  (non-blank).
  Split out so a caller can still index an entity whose enrichment is unusable. Retaining an entity's
  existing docs only helps when it has some; on a first build or a full rebuild it has none, so without
  this a bad `ai_context` blob would leave the entity unfindable even by its own name.
  Pure over an unhydrated entity — it reads nothing the `:ai-context` hydration provides."
  [entity]
  (let [{:keys [entity_type entity_local_id name description]} (entity-summary entity)
        doc #(make-doc entity_type entity_local_id %1 %2)]
    (cond-> [(doc "name" name)]
      (not (str/blank? description)) (conj (doc "description" description)))))

(defn library-index-docs
  "All desired index docs for one hydrated library entity: [[base-index-docs]] plus a `synonym`/`example`
  doc per hydrated `:ai-context` value.
  Instructions are never indexed — the tool reads them live from `osi_ai_context`.
  The shared derivation behind every model's `:library-index` `:project` var, so the doc format stays
  single while the declarations stay per-model."
  [entity]
  (let [{:keys [entity_type entity_local_id]} (entity-summary entity)
        ai-context (:ai-context entity)
        doc        #(make-doc entity_type entity_local_id %1 %2)]
    (concat
     (base-index-docs entity)
     ;; Keep only the non-blank string values, capped: a legacy or forward-compatible row may hold a
     ;; non-string item, and a row that skipped the API's bounds could otherwise bloat the index with an
     ;; unbounded number of synonym/example docs. A malformed item is skipped, never fatal to the slice.
     (map #(doc "synonym" %) (take max-values-per-kind (filter usable-index-value? (:synonyms ai-context))))
     (map #(doc "example" %) (take max-values-per-kind (filter usable-index-value? (:examples ai-context)))))))
