(ns metabase.metrics.dimension
  "API-layer functions for fetching dimension values from the metrics API endpoints."
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
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
;;; The conversion is schema-driven: the wire rules are declared as transformer properties on the
;;; schemas below and applied with compiled `malli.core/encode`/`decode` transformers (the same
;;; pattern as `:encode/serialize` in [[metabase.lib.serialize]]):
;;;
;;;   * the `:api-case` step renames map keys — snake_case on encode, kebab-case on decode. An
;;;     individual map schema opts out with an `{:encode/api-case {:leave identity}}` property
;;;     (`:sources` entries keep their kebab `field-id` key on the wire).
;;;   * the `:api` step handles value-level rules via `:encode/api` properties: qualified keyword
;;;     types (`:effective-type` & co.) become strings, `:display-name` falls back to `:name`,
;;;     always-on-the-wire keys are ensured present and nil-valued optional keys dropped.
;;;   * `strip-extra-keys-transformer` (encode only) drops keys not in the schema — internal keys
;;;     like `:lib/source` and Field columns annotated by [[annotate-dimensions-with-field-data]]
;;;     (other than `:dimension-interestingness`) — so the schema doubles as the wire whitelist.

(defn- kw->str
  [k]
  (some-> k u/qualified-name))

(defn- drop-nil-keys
  [m ks]
  (reduce (fn [m k]
            (cond-> m
              (nil? (get m k)) (dissoc k)))
          m
          ks))

(defn- encode-dimension-map
  "Map-level `:encode/api` rules for a dimension: `:display-name` falls back to `:name`, the five
   always-on-the-wire keys are present even when nil, nil-valued optional keys are dropped."
  [dim]
  (-> (merge {:id nil :name nil :effective-type nil :semantic-type nil} dim)
      (as-> dim (update dim :display-name #(or % (:name dim))))
      (drop-nil-keys [:has-field-values :status :status-message :dimension-interestingness :group :sources])))

(defn- encode-mapping-map
  "Map-level `:encode/api` rules for a dimension mapping: `:dimension-id` and `:target` are always
   on the wire (even when nil), `:type`/`:table-id` only when non-nil."
  [mapping]
  (-> (merge {:dimension-id nil :target nil} mapping)
      (drop-nil-keys [:type :table-id])))

(mr/def ::source
  "A dimension source annotated with its wire-encoding rules. Quirks preserved from the previous
   hand-rolled shape: entries keep their kebab-case `:field-id` key on the wire, `:field-id` is
   always present (nil when missing), and other keys (e.g. `:binning`) are dropped."
  [:map {:encode/api-case {:leave identity}
         :encode/api      {:enter #(merge {:field-id nil} %)}}
   [:type ::lm.schema/dimension-source.type]
   [:field-id [:maybe :int]]])

(mr/def ::dimension
  "The internal (kebab-case) dimension shape from [[metabase.lib-metric.schema]], annotated with
   its wire-encoding rules. Entries are overridden only where a wire rule applies."
  [:merge
   ::lm.schema/persisted-dimension
   [:map {:encode/api {:enter encode-dimension-map}}
    [:effective-type {:optional true} [:maybe {:encode/api kw->str} :keyword]]
    [:semantic-type {:optional true} [:maybe {:encode/api kw->str} :keyword]]
    [:has-field-values {:optional true} [:maybe {:encode/api kw->str} :keyword]]
    [:dimension-interestingness {:optional true} [:maybe number?]]
    [:sources {:optional true} [:maybe [:sequential ::source]]]]])

(mr/def ::dimension-mapping
  "The internal (kebab-case) dimension-mapping shape annotated with its wire-encoding rules.
   `:target` is re-typed as `:any` so the transformer never walks into the MBQL ref and renames
   its option-map keys — it passes through untouched in both directions."
  [:merge
   ::lm.schema/dimension-mapping
   [:map {:encode/api {:enter encode-mapping-map}}
    [:target :any]]])

(def ^:private rename-keys-transformer
  "Transformer step that renames map keys: snake_case on encode, kebab-case on decode. Named so
   individual map schemas can override it with an `:encode/api-case` property."
  (mtx/transformer
   {:name     :api-case
    :encoders {:map {:leave #(cond-> % (map? %) (update-keys u/->snake_case_en))}}
    :decoders {:map {:enter #(cond-> % (map? %) (update-keys u/->kebab-case-en))}}}))

(def ^:private api-encode-transformer
  (mtx/transformer
   (mtx/strip-extra-keys-transformer)
   {:name :api}
   rename-keys-transformer))

(def ^:private api-decode-transformer
  ;; decode is purely mechanical key renaming: unknown keys are kept (no strip) and values pass
  ;; through untouched (no `:decode/api` rules exist).
  rename-keys-transformer)

(defn- api-encoder [schema]
  (mr/cached ::api-encoder schema #(mc/encoder schema api-encode-transformer)))

(defn- api-decoder [schema]
  (mr/cached ::api-decoder schema #(mc/decoder schema api-decode-transformer)))

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

(defn api->dimension
  "Convert an API-shape (snake_case) dimension object to the internal kebab-case shape.
   Mechanical: kebab-cases map keys (unknown keys included); `:sources` entries and `:target`
   refs are kebab-case on both sides and pass through untouched."
  [dim]
  ((api-decoder ::dimension) dim))

(defn api->dimensions
  "Convert a sequence of API-shape dimensions to the internal shape. nil-safe (returns `[]`)."
  [dims]
  (mapv api->dimension dims))

(defn api->dimension-mapping
  "Convert an API-shape (snake_case) dimension mapping to the internal kebab-case shape.
   `:target` (an MBQL ref) passes through untouched."
  [mapping]
  ((api-decoder ::dimension-mapping) mapping))

(defn api->dimension-mappings
  "Convert a sequence of API-shape dimension mappings to the internal shape. nil-safe (returns `[]`)."
  [mappings]
  (mapv api->dimension-mapping mappings))

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
