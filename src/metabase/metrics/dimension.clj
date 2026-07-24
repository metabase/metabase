(ns metabase.metrics.dimension
  "API-layer functions for fetching dimension values from the metrics API endpoints."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [malli.util :as mut]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.schema :as lm.schema]
   [metabase.parameters.core :as parameters]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- API Shape -------------------------------------------------
;;; Convert internal (kebab) dimensions to the snake_case shape the frontend expects, and back.
;;; Mirrors the metric-dimensions branch's `->api-dimension` layer so the two converge.
;;;
;;; The conversion is schema-driven: the wire rules are declared as `:encode/api` / `:decode/api`
;;; transformer properties on the schemas below — the transformer name [[metabase.api.macros]]
;;; applies to every request and response schema. That means an endpoint schema that references
;;; `::dimension` or `::dimension-mapping` gets the conversion automatically at the `defendpoint`
;;; edge: responses are validated against the internal shape, then encoded to the wire shape;
;;; request params are decoded to the internal shape, then validated against it.
;;;
;;; Decoding is therefore only ever reached through `defendpoint`; there are deliberately no
;;; standalone `api->*` helpers, because an `:api`-only decode does not match the full decode
;;; chain the edge applies (see [[api-transformer]]). The `->api-*` fns below do have callers
;;; outside `defendpoint` — the `add_research_groups` metabot tool and [[metabase.measures.api]]
;;; — and for encoding the standalone transformer is faithful to the edge.
;;;
;;; Per map schema, [[wire-map]] declares: strip keys not in the schema and apply the map's
;;; defaulting policy on encode-enter, snake_case the keys on encode-leave, and kebab-case the
;;; keys on decode-enter. `::source` opts out of key renaming — entries keep their kebab
;;; `field-id` key on the wire (a quirk preserved from the previous hand-rolled shape).

(defn- kw->str
  [k]
  (some-> k u/qualified-name))

(defn- snake-case-keys [m] (cond-> m (map? m) (update-keys u/->snake_case_en)))
(defn- kebab-case-keys [m] (cond-> m (map? m) (update-keys u/->kebab-case-en)))

(defn- drop-nil-keys
  [m ks]
  (reduce (fn [m k]
            (cond-> m
              (nil? (get m k)) (dissoc k)))
          m
          ks))

(defn- encode-dimension-map
  "Encode-time defaulting policy for a dimension: `:display-name` falls back to `:name`, the five
   always-on-the-wire keys are present even when nil, nil-valued optional keys are dropped."
  [dim]
  (-> (merge {:id nil :name nil :effective-type nil :semantic-type nil} dim)
      (as-> dim (update dim :display-name #(or % (:name dim))))
      (drop-nil-keys [:has-field-values :status :status-message :dimension-interestingness :group :sources])))

(defn- encode-mapping-map
  "Encode-time defaulting policy for a dimension mapping: `:dimension-id` and `:target` are always
   on the wire (even when nil), `:type`/`:table-id` only when non-nil."
  [mapping]
  (-> (merge {:dimension-id nil :target nil} mapping)
      (drop-nil-keys [:type :table-id])))

(defn- wire-map
  "Annotate the map schema `base` (optionally merged with `overrides`) with the standard
   wire-conversion rules, keyed to the `:api` transformer applied by `defendpoint` (and by the
   `->api-*` fns below). On encode: keys not in the schema are stripped and `enter` (the
   defaulting policy) runs before child entries encode, then map keys are renamed to snake_case.
   On decode: map keys are kebab-cased before child entries decode; unknown keys are kept and
   values pass through untouched.

   Uses [[mut/merge]] rather than [[mr/resolve-schema]] deliberately: it derefs only the top-level
   schema, so entries keep their registry references (`::group`, `::lm.schema/dimension-id`, …)
   instead of being inlined. That keeps the annotated schema a live view of the schemas it builds
   on — redefining one propagates — and keeps the names in OpenAPI and validation errors.
   [[mr/resolve-schema]] is REPL/documentation tooling and inlines the whole tree."
  ([base]
   (wire-map base nil identity))
  ([base overrides enter]
   (let [schema (mut/merge base overrides)
         ks     (into #{} (map first) (mc/entries schema))]
     (mut/update-properties
      schema assoc
      :encode/api {:enter (fn [m] (if (map? m) (enter (select-keys m ks)) m))
                   :leave snake-case-keys}
      :decode/api {:enter kebab-case-keys}))))

(mr/def ::source
  "A dimension source annotated with its wire-encoding rules. Quirks preserved from the previous
   hand-rolled shape: entries keep their kebab-case `:field-id` key on the wire (no key renaming),
   `:field-id` is always present (nil when missing), and other keys (e.g. `:binning`) are dropped."
  [:map {:encode/api {:enter #(merge {:field-id nil} (select-keys % [:type :field-id]))}}
   [:type ::lm.schema/dimension-source.type]
   [:field-id {:optional true} [:maybe :int]]])

(mr/def ::group
  "The internal dimension-group shape annotated with wire-conversion rules."
  (wire-map ::lm.schema/dimension-group))

(mr/def ::dimension
  "The internal (kebab-case) dimension shape from [[metabase.lib-metric.schema]], annotated with
   its wire-conversion rules. Entries are overridden only where a wire rule applies; `:id` keeps
   the strict uuid schema the model boundary enforces."
  (wire-map
   ::lm.schema/persisted-dimension
   [:map
    [:effective-type {:optional true} [:maybe {:encode/api kw->str} :keyword]]
    [:semantic-type {:optional true} [:maybe {:encode/api kw->str} :keyword]]
    [:has-field-values {:optional true} [:maybe {:encode/api kw->str} :keyword]]
    [:dimension-interestingness {:optional true} [:maybe number?]]
    [:group {:optional true} [:maybe ::group]]
    [:sources {:optional true} [:maybe [:sequential ::source]]]]
   encode-dimension-map))

(mr/def ::dimension-mapping
  "The internal (kebab-case) dimension-mapping shape annotated with its wire-conversion rules.
   `:target` is re-typed as `:any` so the transformer never walks into the MBQL ref and renames
   its option-map keys — it passes through untouched in both directions. `:type` is optional on
   the wire (FE payloads may omit it); `:dimension-id` keeps the strict uuid schema."
  (wire-map
   ::lm.schema/dimension-mapping
   [:map
    [:type {:optional true} ::lm.schema/dimension-mapping.type]
    [:target :any]]
   encode-mapping-map))

(def ^:private api-transformer
  "The `:api`-named step of the transformers `defendpoint` applies, on its own.

   For *encoding* this reproduces the `defendpoint` edge exactly: the only other step in
   [[metabase.api.macros]]'s encode chain is `default-value-transformer`, which is inert on schemas
   that declare no `:default`. It is deliberately not used for decoding — `defendpoint`'s decode
   chain also runs the string, json, and `:normalize` transformers, so a standalone `:api`-only
   decode would *not* match what a request actually goes through (e.g. `\"type/Text\"` stays a
   string here but arrives as `:type/Text` at the edge)."
  (mtx/transformer {:name :api}))

(defn- api-encoder [schema]
  (mr/cached ::api-encoder schema #(mc/encoder schema api-transformer)))

(defn ->api-dimension
  "Convert an internal (kebab) persisted or computed dimension to the API shape consumed by the
   frontend: snake_case top-level keys, fully-qualified type strings, and a `:sources` list
   whose entries keep the kebab `field-id` key."
  [dim]
  ((api-encoder ::dimension) dim))

(defn ->api-dimensions
  "Convert a sequence of internal dimensions to the API shape. nil-safe (returns `[]`)."
  [dims]
  (mapv ->api-dimension dims))

(defn ->api-dimension-mapping
  "Convert an internal (kebab) dimension mapping to the API shape: snake_case keys, with the
   MBQL `:target` ref passing through untouched."
  [mapping]
  ((api-encoder ::dimension-mapping) mapping))

(defn ->api-dimension-mappings
  "Convert a sequence of internal dimension mappings to the API shape. nil-safe (returns `[]`)."
  [mappings]
  (mapv ->api-dimension-mapping mappings))

(defn- dimension-field-id
  "Field id behind `dim` on `metric`, or nil when it can't be resolved — the dimension is
   missing from the metric, orphaned, or mapped to a column name rather than a Field id.
   Logged rather than swallowed outright: the caller's only signal is a dimension annotated
   with nil columns, which is otherwise indistinguishable from a Field that has no value."
  [metric dim]
  (try
    (lib-metric/resolve-dimension-to-field-id
     (:dimensions metric)
     (:dimension_mappings metric)
     (:id dim))
    (catch Exception e
      (log/debugf e "Could not resolve dimension %s to a field id; annotating it with nil columns"
                  (:id dim))
      nil)))

(mu/defn annotate-dimensions-with-field-data :- [:sequential :map]
  "Given a vector of `:model/Field` columns and a seq of metrics (each carrying
   `:dimensions` and optional `:dimension_mappings`), batch-load those columns from
   the underlying Field row for each dimension and assoc them onto the dimension.
   Useful for pulling Field-stored metadata (e.g. the `dimension_interestingness`
   column, annotated onto dimensions as `:dimension-interestingness`) onto API
   responses without round-tripping per dimension. Column names are snake_case
   (they address the Field table); the keys merged onto the dimension are their
   kebab-case forms, matching the canonical dimension shape.

   Dimensions whose field-id can't be resolved get the columns assoc'd as nil.
   Returns the metrics seq with `:dimensions` updated in place. `metrics` is the
   last arg so this composes cleanly with `->>` pipelines."
  [field-cols :- [:sequential :keyword]
   metrics    :- [:sequential :map]]
  ;; Resolve each (metric, dimension) pair exactly once and carry the field id alongside its
  ;; dimension, so the merge pass below reads it instead of resolving all over again.
  (let [dims+fids  (mapv (fn [metric]
                           (mapv (fn [dim] [dim (dimension-field-id metric dim)])
                                 (:dimensions metric)))
                         metrics)
        field-ids  (into #{} (comp cat (keep second)) dims+fids)
        field->row (when (seq field-ids)
                     (t2/select-pk->fn #(update-keys (select-keys % field-cols) u/->kebab-case-en)
                                       (into [:model/Field :id] field-cols)
                                       :id [:in field-ids]))
        nil-cols   (zipmap (map u/->kebab-case-en field-cols) (repeat nil))]
    (mapv (fn [metric pairs]
            (cond-> metric
              (seq pairs) (assoc :dimensions
                                 (mapv (fn [[dim fid]]
                                         (merge dim nil-cols (get field->row fid)))
                                       pairs))))
          metrics
          dims+fids)))

(mu/defn dimension-values :- ms/FieldValuesResult
  "Fetch values for a dimension given its UUID.
   Uses the same logic as the field values API."
  [dimensions         :- [:maybe [:sequential :map]]
   dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string]
  (let [field-id (lib-metric/resolve-dimension-to-field-id dimensions dimension-mappings dimension-id)
        field    (t2/select-one :model/Field :id field-id)]
    (parameters/field->values field)))

(mu/defn dimension-search-values :- [:sequential [:vector :string]]
  "Search for values of a dimension that contain the query string."
  [dimensions         :- [:maybe [:sequential :map]]
   dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string
   query-string       :- ms/NonBlankString]
  (let [field-id (lib-metric/resolve-dimension-to-field-id dimensions dimension-mappings dimension-id)]
    (:values (parameters/search-values-from-field-id field-id query-string))))

(mu/defn dimension-remapped-value :- [:or [:tuple :any] [:tuple :any :string]]
  "Get the remapped value for a specific dimension value.
   Returns a pair like [value display-name] if remapping exists, or just [value] otherwise."
  [dimensions         :- [:maybe [:sequential :map]]
   dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string
   value              :- :string]
  (let [field-id        (lib-metric/resolve-dimension-to-field-id dimensions dimension-mappings dimension-id)
        field           (t2/select-one :model/Field :id field-id)
        parsed-value    (parameters/parse-query-param-value-for-field field value)
        remapped-fid    (parameters/remapped-field-id field-id)]
    (if remapped-fid
      (let [remapped-field (t2/select-one :model/Field :id remapped-fid)]
        (parameters/remapped-value field remapped-field parsed-value))
      ;; No remapping - return the value as-is
      [parsed-value])))
