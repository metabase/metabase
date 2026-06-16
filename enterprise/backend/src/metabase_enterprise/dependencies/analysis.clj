(ns metabase-enterprise.dependencies.analysis
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util.malli :as mu]))

(mu/defn returned-columns
  "Get the returned columns of a `query`"
  [driver :- :keyword
   query :- ::lib.schema/query]
  (if (lib/any-native-stage? query)
    (deps.native/native-result-metadata driver query)
    (lib/returned-columns query)))

;; Analyzing an entity in memory ================================================================
(mu/defn- check-query :- [:set [:ref ::lib.schema.validate/error-with-source]]
  "Find any bad refs in a `query`. Returns errors with source entity information when possible."
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (if (lib/any-native-stage? query)
    (deps.native/validate-native-query driver query)
    (into #{} (remove :soft?) (lib/find-bad-refs-with-source query))))

(defmulti ^:private -check-entity
  "Implementation multimethod for [[check-entity]]. Extend this to add support
   for new entity types."
  {:arglists '([metadata-provider entity-type entity-id])}
  (fn [_metadata-provider entity-type _entity-id]
    entity-type))

(defmethod -check-entity :default
  [_metadata-provider _entity-type _entity-id]
  nil)

(mu/defmethod -check-entity :card :- [:set [:ref ::lib.schema.validate/error-with-source]]
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   card-id           :- ::lib.schema.id/card]
  (let [query  (lib/query metadata-provider (:dataset-query (lib.metadata/card metadata-provider card-id)))
        driver (:engine (lib.metadata/database query))]
    (check-query driver query)))

(mu/defmethod -check-entity :transform :- [:set [:ref ::lib.schema.validate/error-with-source]]
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   transform-id      :- ::lib.schema.id/transform]
  (let [{{query :query} :source
         :as _transform}  (lib.metadata/transform metadata-provider transform-id)
        driver            (:engine (lib.metadata/database metadata-provider))
        query             (lib/query metadata-provider query)
        output-fields     (returned-columns driver query)
        ;; Group by the user-visible column name (the alias when present),
        ;; not the underlying column's `:name` — otherwise `t1.name AS a` and
        ;; `t2.name AS b` look like duplicates because both have `:name "name"`.
        output-name       #(or (:lib/desired-column-alias %) (:name %))
        duplicated-fields (->> output-fields
                               (group-by output-name)
                               vals
                               (keep #(when (> (count %) 1)
                                        (lib/duplicate-column-error (output-name (first %)))))
                               seq)]
    (cond-> (check-query driver query)
      duplicated-fields (into duplicated-fields))))

(mu/defmethod -check-entity :segment :- [:set [:ref ::lib.schema.validate/error-with-source]]
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   segment-id        :- ::lib.schema.id/segment]
  (let [query (->> (lib.metadata/segment metadata-provider segment-id)
                   :definition
                   (lib/query metadata-provider))
        driver (:engine (lib.metadata/database query))]
    (check-query driver query)))

(defn check-entity
  "Check a single entity for bad refs against a MetadataProvider.

   Returns a set of errors with source information, or nil if the entity is clean.
   Dispatches to entity-type-specific analysis (MBQL bad refs, native SQL validation,
   transform duplicate columns, etc.).

   Supported entity types: :card, :transform, :segment. Other types return nil."
  [metadata-provider entity-type entity-id]
  (-check-entity metadata-provider entity-type entity-id))

;; Output identity ==============================================================================
;; The entity-check job analyzes batches of stale entities until a pass turns up nothing new, and
;; re-stales an entity's dependents only when that entity's *output identity* — the part of it a
;; dependent resolves its references against — actually changes. Were propagation unconditional, two
;; failures would follow: a dependency cycle would never finish, and every sync would re-stale an
;; entity's whole transitive set of dependents rather than the few a change can reach. Gating on a
;; real output change forecloses both (#75748); a cycle now drains in one extra pass, since an
;; entity's second analysis reproduces its output and propagates nothing. Termination proper is owed
;; not to the gating but to the per-run `seen` set, which bounds even a non-cyclic entity that can
;; never clear its flag.
;;
;; The token MUST therefore capture every property of an upstream that a dependent's breakage check
;; relies on. Over-inclusion only buys extra re-analysis, itself bounded by that `seen` set;
;; under-inclusion misses breakage. When in doubt, include it.

(def ^:private column-relevance-fns
  "Ordered extractors for the breakage-relevant properties of one output column."
  [:id
   :name
   :lib/desired-column-alias
   :base-type
   (some-fn :effective-type :base-type)   ; missing effective-type reads as base-type, as the resolvers do
   :semantic-type
   :fk-target-field-id
   #(not (false? (:active %)))            ; missing :active reads as active, as the resolvers do
   :visibility-type])

(defn- canonical-column
  "A fixed-order tuple of the breakage-relevant properties of one output column (see
  `column-relevance-fns`)."
  [col]
  ;; normalize first: stored card result-metadata is snake_case; transform columns are kebab
  (let [col (lib/normalize ::lib.schema.metadata/column col)]
    (mapv #(% col) column-relevance-fns)))

(defn- column-identity-with-live-field
  "`canonical-column` for `col`, plus the *live* `:active`/`:visibility-type` of its backing field.
  MBQL drops inactive/hidden columns, so a field retired in the warehouse breaks dependents even
  when the card's stored result-metadata still lists the column unchanged."
  [metadata-provider col]
  (conj (canonical-column col)
        (when-let [field (some->> (:id col) (lib.metadata/field metadata-provider))]
          [(:active field) (:visibility-type field)])))

(defmulti ^:private -output-identity
  "Implementation multimethod for [[output-hash]]."
  {:arglists '([metadata-provider entity-type entity-id])}
  (fn [_metadata-provider entity-type _entity-id] entity-type))

(defmethod -output-identity :default
  [_metadata-provider entity-type entity-id]
  ;; entities we can't characterize an output for still get a stable token
  [entity-type entity-id])

(mu/defmethod -output-identity :card
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   card-id           :- ::lib.schema.id/card]
  ;; Hash the card's STORED `:result-metadata` — that is literally what a native dependent reads
  ;; (`card-column-exists?`), and what an MBQL dependent's source columns are derived from. We do
  ;; NOT use `lib/returned-columns` of the card-as-source here: it live-merges field metadata and
  ;; re-derives column names, which silently masks a stored rename that the native check WOULD see
  ;; (an under-inclusion → missed breakage). Column order is part of the identity (alias dedup and
  ;; duplicate detection are order-sensitive), so keep it.
  (let [card (lib.metadata/card metadata-provider card-id)]
    [:card (mapv #(column-identity-with-live-field metadata-provider %) (:result-metadata card))]))

(mu/defmethod -output-identity :transform
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   transform-id      :- ::lib.schema.id/transform]
  (let [{{query :query} :source target :target} (lib.metadata/transform metadata-provider transform-id)
        driver (:engine (lib.metadata/database metadata-provider))
        query  (lib/query metadata-provider query)]
    [:transform
     (mapv canonical-column (returned-columns driver query))
     ;; native dependents resolve a transform by its target name/schema
     [(:schema target) (:name target)]]))

(mu/defmethod -output-identity :segment
  [_metadata-provider :- ::lib.schema.metadata/metadata-provider
   _entity-type
   segment-id         :- ::lib.schema.id/segment]
  ;; A segment is a filter, not a column producer, and no breakage check resolves a dependent
  ;; against a segment's definition — its floor is empty beyond existence. So the token is a
  ;; constant per segment: it moves only when the segment first gets a finding and never
  ;; re-propagates, which is correct — nothing a dependent reads changes when a segment is edited.
  [:segment segment-id])

(mu/defn output-hash :- :string
  "A stable, bounded token for an entity's output identity. Equal outputs hash equal; the
  entity-check job propagates staleness to dependents only when this changes between analyses
  (#75748). Stable across processes."
  [metadata-provider entity-type entity-id]
  ;; SHA-256 over the identity's `pr-str`. The identity is a deterministic, map-free structure, so
  ;; its `pr-str` is stable; SHA-256 keeps the token a fixed 64 chars and makes a collision — which
  ;; would silently skip a propagation, the dangerous direction — practically impossible.
  (-> (-output-identity metadata-provider entity-type entity-id)
      pr-str
      buddy-hash/sha256
      codecs/bytes->hex))
