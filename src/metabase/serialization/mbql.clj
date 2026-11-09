(ns metabase.serialization.mbql
  "Export and import of MBQL, and of any form that holds it, in bulk.

  On export, Database, Table, Field and content ids become references; on import, the references become this
  instance's ids. [[walk-export-refs]] and [[walk-import-refs]] only swap references; [[walk-export]] and
  [[walk-import]] add what serialization needs around that: queries prepared for serialization with only the
  `:lib/uuid`s that `:aggregation` refs point at kept, and imported forms normalized, validated, and converted from
  legacy MBQL. Card template tags embed card ids in their names, so both directions rename them too."
  (:require
   [clojure.string :as str]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.serialization.resolve :as resolve]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

(defn serialized-query-source-table
  "The reference of the table `serialized-query`, an exported MBQL query, is based on."
  [serialized-query]
  (mu/disable-enforcement
    (lib/primary-source-table-id serialized-query)))

(defn entity-id?
  "Whether `x` is an entity id, a 21-character NanoID."
  [x]
  (boolean (and (string? x) (re-matches #"^[A-Za-z0-9_-]{21}$" x))))

(defn- content-ref?
  "Whether `x` refers to a card, metric, segment, or measure for `visit`: an entity id, or a bare numeric id when its
  walk has `:numeric-ids-allowed?`. A numeric id still goes through the store, which on agent paths checks that the
  caller can read it, so every content reference must take this predicate rather than [[entity-id?]] alone. Snippets
  are referred to by entity id only, since no agent store resolves them."
  [visit x]
  (or (entity-id? x)
      (and (pos-int? x) (boolean (:numeric-ids-allowed? (resolve/options visit))))))

;;; ------------------------------------------------- Swapping references --------------------------------------------

(mr/def ::mbql-node
  "Any node reached while walking an MBQL form, which may or may not be an MBQL clause."
  [:schema {::mr/deliberately-open true, :description "an MBQL form node"} :any])

(mu/defn mbql-clause-tag :- [:maybe [:enum :field :field-id :dimension :metric :segment :measure]]
  "The tag of `form` when it is an MBQL entity reference clause, else nil."
  [form :- [:ref ::mbql-node]]
  (when (and (vector? form)
             (#{:field :field-id :dimension :metric :segment :measure} (keyword (first form))))
    (keyword (first form))))

(mr/def ::field-ref
  "MBQL 5 or legacy `:field` clause. Registered under a keyword so [[lib/normalize]] reuses one cached coercer; an
  inline literal with a fresh dispatch fn misses the registry cache on every call."
  [:multi
   {:dispatch #(and (vector? %)
                    (map? (second %)))}
   [true  :mbql.clause/field]
   [false ::mbql.s/field]])

(mr/def ::mbql-3-field-id-ref
  "Ultra-legacy MBQL 3 `:field-id` ref, which (allegedly) can show up in viz settings."
  [:tuple
   [:= {:decode/normalize lib.schema.common/normalize-keyword} :field-id]
   pos-int?])

(defn normalize-mbql-ref
  "`mbql`, an MBQL entity reference clause, normalized by the schema of its tag."
  [mbql]
  (let [schema (case (mbql-clause-tag mbql)
                 :field-id  ::mbql-3-field-id-ref
                 :field     ::field-ref
                 :dimension ::lib.schema.parameter/dimension
                 :metric    :mbql.clause/metric
                 :segment   :mbql.clause/segment
                 :measure   :mbql.clause/measure
                 nil)]
    (cond->> mbql
      schema (lib/normalize schema mbql))))

(def ^:private ref-tag->model
  {:metric :model/Card, :segment :model/Segment, :measure :model/Measure})

(declare walk-export-refs)

(defn- export-mbql-map [visit m]
  (reduce-kv
   (fn [m k v]
     (case k
       :lib/metadata
       (dissoc m k)

       :database
       (assoc m k (cond
                    (= v lib.schema.id/saved-questions-virtual-database-id) "database/__virtual"
                    (pos-int? v)                                            (visit :model/Database v)
                    :else                                                   v))

       (:card_id :card-id :source_card :source-card)
       (cond-> m (pos-int? v) (assoc k (visit :model/Card v)))

       (:source_table :source-table :table-id)
       (cond-> m (pos-int? v) (assoc k (visit :model/Table v)))

       (:source-field :metabase.models.visualization-settings/param-mapping-source)
       (cond-> m (pos-int? v) (assoc k (visit :model/Field v)))

       :segment
       (cond-> m (pos-int? v) (assoc k (visit :model/Segment v)))

       :snippet-id
       (cond-> m (pos-int? v) (assoc k (visit :model/NativeQuerySnippet v)))

       (assoc m k (walk-export-refs visit v))))
   m
   m))

(defn- export-mbql-clause [visit [tag a b :as clause]]
  (let [walk #(walk-export-refs visit %)]
    (case tag
      (:field :field-id)
      (cond
        (and (= 2 (count clause)) (pos-int? a))     [tag (visit :model/Field a)]
        (and (map? a) (pos-int? b))                 [tag (walk a) (visit :model/Field b)]
        (and (pos-int? a) (or (map? b) (nil? b)))   [tag (visit :model/Field a) (walk b)]
        :else                                       (mapv walk clause))

      (:metric :segment :measure)
      (if (and (= 3 (count clause)) (pos-int? b))
        [tag (walk a) (visit (ref-tag->model tag) b)]
        (mapv walk clause))

      (mapv walk clause))))

(defn walk-export-refs
  "`x`, any form that may hold MBQL, with the Database, Table, Field and content ids in it replaced by what `visit`
  returns for them (see [[resolve/walk-in-bulk]])."
  [visit x]
  (cond
    (mbql-clause-tag x) (export-mbql-clause visit (normalize-mbql-ref x))
    (sequential? x)     (mapv #(walk-export-refs visit %) x)
    (map? x)            (export-mbql-map visit x)
    :else               x))

(declare walk-import-refs)

(defn- import-mbql-map [visit m]
  (reduce-kv
   (fn [m k v]
     (case k
       :database
       (cond-> m
         (string? v) (assoc k (if (= v "database/__virtual")
                                lib.schema.id/saved-questions-virtual-database-id
                                (visit :model/Database v))))

       (:source-table :source_table)
       (cond
         (vector? v)      (assoc m k (visit :model/Table v))
         (entity-id? v) (assoc m k (str "card__" (visit :model/Card v)))
         :else            m)

       (:table-id)
       (cond-> m (vector? v) (assoc k (visit :model/Table v)))

       :source-field
       (cond-> m (vector? v) (assoc k (visit :model/Field v)))

       (:source-card :card-id)
       (cond-> m (content-ref? visit v) (assoc k (visit :model/Card v)))

       :snippet-id
       (cond-> m (entity-id? v) (assoc k (visit :model/NativeQuerySnippet v)))

       (assoc m k (walk-import-refs visit v))))
   m
   m))

(defn- import-mbql-clause [visit [tag a b :as clause]]
  (let [walk #(walk-import-refs visit %)
        kw   (keyword tag)]
    (case kw
      (:field :field-id)
      (cond
        (and (= 2 (count clause)) (vector? a))                       [:field (visit :model/Field a) nil]
        (and (= :field kw) (map? a) (vector? b))                     [:field (walk a) (visit :model/Field b)]
        (and (= :field kw) (vector? a) (or (map? b) (nil? b)))       [:field (visit :model/Field a) (some->> b walk)]
        :else                                                        (mapv walk clause))

      (:metric :segment :measure)
      (cond
        (and (= 3 (count clause)) (content-ref? visit b)) [kw (walk a) (visit (ref-tag->model kw) b)]
        (and (= 2 (count clause)) (content-ref? visit a)) [kw (visit (ref-tag->model kw) a)]
        :else                                       (mapv walk clause))

      (mapv walk clause))))

(defn walk-import-refs
  "`x`, any form that may hold MBQL with references, with those references replaced by what `visit` returns for them
  (see [[resolve/walk-in-bulk]])."
  [visit x]
  (cond
    (and (vector? x) (some-> (first x) keyword #{:field :field-id :metric :segment :measure}))
    (import-mbql-clause visit x)

    (map? x)        (import-mbql-map visit x)
    (vector? x)     (mapv #(walk-import-refs visit %) x)
    (sequential? x) (doall (map #(walk-import-refs visit %) x))
    :else           x))

;;; ----------------------------------------------- Serialization of MBQL ---------------------------------------------

(defn- mbql-query?
  "Whether `x` is an MBQL 5 query."
  [x]
  (and (map? x) (= :mbql/query (:lib/type x))))

(mu/defn- required-lib-uuids :- [:set ::lib.schema.common/uuid]
  "The `:lib/uuid`s that the `:aggregation` refs of `x` point at."
  [x :- [:ref ::mbql-node]]
  (set
   (match/match-many x
     [:aggregation #'map? (uuid :guard string?)]
     uuid)))

(defn- strip-lib-uuids
  "`x` without the `:lib/uuid`s of its maps, except the `required` ones."
  [required x]
  (cond
    (map? x)        (reduce-kv (fn [m k v]
                                 (if (and (= k :lib/uuid) (not (contains? required v)))
                                   (dissoc m k)
                                   (assoc m k (strip-lib-uuids required v))))
                               x
                               x)
    (vector? x)     (mapv #(strip-lib-uuids required %) x)
    (sequential? x) (doall (map #(strip-lib-uuids required %) x))
    :else           x))

(defn- update-queries
  "`x` with `f` applied to each MBQL 5 query in it, outermost first, skipping `:lib/metadata`."
  [f x]
  (let [x (cond-> x (mbql-query? x) f)]
    (cond
      (map? x)        (reduce-kv (fn [m k v]
                                   (cond-> m
                                     (not= k :lib/metadata) (assoc k (update-queries f v))))
                                 x
                                 x)
      (vector? x)     (mapv #(update-queries f %) x)
      (sequential? x) (doall (map #(update-queries f %) x))
      :else           x)))

(defn card-entity-id
  "What `visit` returns for the entity id of the Card with `card-id`, or nil when there is no such Card."
  [visit card-id]
  (resolve/found-or-nil #(visit :model/Card card-id)))

(defn recording-card-entity-ids
  "`[visit' card-id->entity-id]`: `visit'` visits like `visit` and records the Card ids it resolves, and
  `card-id->entity-id` returns the entity id that a recorded Card id was resolved from."
  [visit]
  (let [card-eids (volatile! {})]
    [(with-meta (fn [model x]
                  (let [v (visit model x)]
                    (when (and (= :model/Card model) (some? v))
                      (vswap! card-eids assoc v x))
                    v))
                (meta visit))
     #(get @card-eids %)]))

(defn card-template-tag-export-rename
  "The exported name of a card template tag whose `#<id>-slug` name embeds a local card id: the id swapped for the
  entity id of the tag's card, which `card-id->entity-id` returns, and the slug kept verbatim. Nil when the name doesn't
  embed an id."
  [card-id->entity-id {tag-type :type, :keys [card-id], tag-name :name}]
  (when (and (= tag-type :card) (pos-int? card-id) (string? tag-name))
    (when-let [[_ _embedded-id suffix] (re-matches #"#(\d+)(-.*)?" tag-name)]
      (when-let [card-eid (card-id->entity-id card-id)]
        (str "#" card-eid suffix)))))

(defn card-template-tag-import-rename
  "The imported name of a card template tag whose name embeds the entity id of its already imported `:card-id`, which
  `card-id->entity-id` returns, a different local id, or another entity id: the embedded value swapped for the id, and
  the slug kept verbatim. Nil when they already agree or the name doesn't embed an id."
  [card-id->entity-id {tag-type :type, :keys [card-id], tag-name :name}]
  (when (and (= tag-type :card) (pos-int? card-id) (string? tag-name))
    (let [entity-id-prefix (some->> (card-id->entity-id card-id) (str "#"))
          entity-id-suffix (when (and entity-id-prefix (str/starts-with? tag-name entity-id-prefix))
                             (subs tag-name (count entity-id-prefix)))]
      (if (and entity-id-suffix (or (= "" entity-id-suffix) (str/starts-with? entity-id-suffix "-")))
        (str "#" card-id entity-id-suffix)
        (if-let [[_ embedded-id suffix] (re-matches #"#(\d+)(-.*)?" tag-name)]
          (when (not= (parse-long embedded-id) card-id)
            (str "#" card-id suffix))
          (when-let [[_ suffix] (re-matches #"#[A-Za-z0-9_-]{21}(-.*)?" tag-name)]
            (str "#" card-id suffix)))))))

(defn card-template-tag-renames
  "The `{old-name new-name}` map of the `tags` that `rename`, a fn of one tag, gives a new name."
  [rename tags]
  (into {}
        (keep (fn [{tag-name :name, :as tag}]
                (some->> (rename tag) (vector tag-name))))
        tags))

(defn- rename-card-template-tags
  "`query` with its template tags, and the `{{#id-slug}}` refs in its native text, renamed by `rename`."
  [query rename]
  (lib/replace-template-tag-names query (card-template-tag-renames rename (lib/all-template-tags query))))

(defn walk-export
  "`x`, any form that may hold MBQL, with each query in it prepared for serialization, its ids replaced by what
  `visit` returns for their references, and only the `:lib/uuid`s that `:aggregation` refs point at kept."
  [visit x]
  (let [x (update-queries #(-> %
                               (rename-card-template-tags (partial card-template-tag-export-rename
                                                                   (partial card-entity-id visit)))
                               lib/prepare-for-serialization)
                          x)]
    (strip-lib-uuids (required-lib-uuids x) (walk-export-refs visit x))))

(defn- validate-imported-query
  "`query`, throwing when it is a full MBQL 5 query that this instance's query schema rejects. Anything else, like
  bare refs, the MBQL fragments of visualization settings, or legacy MBQL 4 queries, passes. The message names two
  causes, since `mu/defn` is not instrumented in prod and an app DB can hold MBQL that the QP tolerates but this
  schema rejects."
  [query]
  (when (and (mbql-query? query)
             (not (mr/validate ::lib.schema/query query)))
    (throw (ex-info (str "Refusing to import a query that does not match this Metabase's query schema. It was "
                         "either exported by a newer Metabase whose query shape this version cannot represent, "
                         "or stored by an instance that never validated it. Pass continue_on_error to skip just "
                         "this entity, or set MB_SERIALIZATION_SKIP_SCHEMA_VALIDATION=true to skip this check "
                         "for the whole import.")
                    {:schema-errors (mu.humanize/humanize (mr/explain ::lib.schema/query query))})))
  query)

(defn- normalize-imported
  "`x` normalized into this instance's representation, or unchanged when it doesn't normalize, as many structures
  that hold MBQL don't."
  [x]
  (try
    (if (mbql-clause-tag x)
      (normalize-mbql-ref x)
      (lib/normalize x))
    (catch Throwable e
      (log/warnf "Error normalizing imported MBQL: %s" (ex-message e))
      x)))

(defn- legacy-query->mbql5
  "`x` converted to MBQL 5 when it is a legacy MBQL query, or unchanged when it isn't one or doesn't convert. Export
  writes every Field id as a reference, so a raw integer left in an imported query is a literal, which converting
  with `{:legacy-int-field-ids? false}` keeps."
  [x]
  (if (and (map? x) (= (lib/normalized-query-type x) :query))
    (try
      (binding [lib.schema.expression/*suppress-expression-type-check?* true]
        (lib/->mbql5 (lib/normalize :metabase.legacy-mbql.schema/Query x {:legacy-int-field-ids? false})))
      (catch Throwable e
        (log/warnf "Error converting imported legacy MBQL query: %s" (ex-message e))
        x))
    x))

(defn walk-import
  "`x`, any form that may hold MBQL with references, with those references replaced by what `visit` returns for them,
  normalized, its card template tags renamed after the imported card ids, and a legacy query converted to MBQL 5.
  Throws when a query doesn't match this instance's query schema, unless the walk has `:skip-schema-validation?`."
  [visit x]
  (if (resolve/collecting? visit)
    (walk-import-refs visit x)
    (let [[visit' card-id->entity-id] (recording-card-entity-ids visit)]
      (some->> (walk-import-refs visit' x)
               normalize-imported
               (#(cond-> % (not (:skip-schema-validation? (resolve/options visit))) validate-imported-query))
               (#(cond-> % (mbql-query? %) (rename-card-template-tags (partial card-template-tag-import-rename
                                                                               card-id->entity-id))))
               legacy-query->mbql5))))

(defn export-mbql
  "Each of `xs`, forms that may hold MBQL, exported by [[walk-export]] with the database ids of all of them resolved in
  `store` at once."
  [store xs]
  (resolve/export-in-bulk store xs walk-export))

(defn import-mbql
  "Each of `xs`, exported forms that may hold MBQL, imported by [[walk-import]] with the references of all of them
  resolved in `store` with `opts` at once."
  [store xs opts]
  (resolve/import-in-bulk store xs opts walk-import))

(def mbql-transform
  "A spec transform of forms that may hold MBQL, by [[export-mbql]] and [[import-mbql]]."
  {:export (fn [store _ xs _] (export-mbql store xs))
   :import (fn [store _ xs opts] (import-mbql store xs opts))})
