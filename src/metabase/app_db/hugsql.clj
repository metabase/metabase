(ns metabase.app-db.hugsql
  "Execute HugSQL-authored queries against the app-db as a small middleware stack, reusing the
  pure map transforms a model already declares with `t2/deftransforms`.

  A HugSQL `.sql` file is loaded with `hugsql.core/def-sqlvec-fns`; each generated fn turns a
  param map into a `[sql & params]` vector. This ns wraps such a builder into a
  `params -> rows` executor whose stages are:

    in-transform  -> execute (bare sqlvec, via Toucan 2) -> out-transform + instance

  The in/out transforms are lifted straight out of the model's `t2/deftransforms` registry, so
  the model definition stays the single declaration of which columns transform how, and nothing
  is re-stated here. Execution is `t2/query` on a compiled sqlvec vector -- connection handling
  and nothing more; it does NOT go through `t2/select`'s polymorphic queryable, so request data
  can never reach query *structure* on this path.

  ## Raw-splice param types are disarmed process-wide

  HugSQL's `:sql`/`:snip`/`:sqlvec`/`:i`(dentifier) params splice unescaped text (identifiers are
  unquoted by default) -- each a SQL injection hole. Requiring this ns overrides
  `apply-hugsql-param` for those types to throw at query-build time, so Metabase `.sql` files use
  `:value`/`:value*` only and anything else fails loudly rather than relying on review. Re-arming
  a type means deleting it from `disarmed-param-types` -- a global, loud diff."
  (:require
   [hugsql.parameters :as hugsql.params]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]
   [toucan2.tools.transformed :as t2.transformed]))

(set! *warn-on-reflection* true)

(def disarmed-param-types
  "HugSQL param types that splice raw/unquoted text and are therefore forbidden in Metabase SQL
  files. Building a query with one throws."
  [:sql :snip :snip* :sqlvec :sqlvec* :i :identifier :i* :identifier*])

(doseq [param-type disarmed-param-types]
  (defmethod hugsql.params/apply-hugsql-param param-type
    [param _data _options]
    (throw (ex-info (str "Raw-splice HugSQL param " (pr-str param-type)
                         " is not allowed in Metabase SQL files; use :value/:value*")
                    {:param param}))))

(defn- model-transforms
  "The model's `t2/deftransforms` map, or `{}` when it declares none. `deftransforms` derives the
  model from `::transformed.model`; without that marker `transforms` has no matching method and
  throws, so only call it when the marker is present."
  [model]
  (if (isa? model :toucan2.tools.transformed/transformed.model)
    (t2.transformed/transforms model)
    {}))

(defn- direction-fns
  "`{column transform-fn}` for one `direction` (`:in` or `:out`) of `model`'s declared transforms."
  [model direction]
  (into {} (keep (fn [[col fns]] (when-let [f (direction fns)] [col f])))
        (model-transforms model)))

(defn- apply-transforms
  "Apply `col->fn` to the matching non-nil keys of `m`. nil values are skipped -- NULL needs no
  wire representation, matching Toucan's own transform behavior."
  [col->fn m]
  (reduce-kv (fn [m col f] (cond-> m (some? (get m col)) (update col f))) m col->fn))

;;; The registry is populated when the *model* ns loads, which is after this ns; so each stage
;;; resolves its transform map on first call (via `delay`), never at wrap time.

(defn wrap-in-transforms
  "Middleware: apply `model`'s `:in` transforms to the param map before `handler` sees it."
  [handler model]
  (let [ins (delay (direction-fns model :in))]
    (fn [params] (handler (apply-transforms @ins params)))))

(defn wrap-out-transforms
  "Middleware: apply `model`'s `:out` transforms to each row `handler` returns, and tag it as a
  Toucan instance of `model` (so `t2/hydrate` and instance-based logic compose downstream)."
  [handler model]
  (let [outs (delay (direction-fns model :out))]
    (fn [params]
      (map #(t2.instance/instance model (apply-transforms @outs %)) (handler params)))))

(defn reducible-executor
  "Innermost handler: build a sqlvec from `params` and execute it, returning raw rows. Bare
  `t2/query` on a vector -- connection handling only, no model, no build pipeline, no queryable
  that request data could poison."
  [builder]
  (fn [params] (t2/query (builder params))))

(defn select-executor
  "A `params -> [instance]` fn for a read query: in-transforms, execute, out-transforms + instance.
  `builder` is a `def-sqlvec-fns`-generated fn (turns a param map into a sqlvec)."
  [model builder]
  (-> (reducible-executor builder)
      (wrap-in-transforms model)
      (wrap-out-transforms model)))

(defn execute!
  "Run a write/DML `builder` with `params`: in-transforms applied, then a single `t2/query-one`.
  Returns whatever the statement returns (an update count for UPDATE/DELETE). No out-transform --
  DML returns counts, not rows."
  [model builder params]
  (let [ins (direction-fns model :in)]
    (t2/query-one (builder (apply-transforms ins params)))))

(defn scalar
  "Run a read `builder` returning a single aggregate/value row (`:? :1`), out-transforming it and
  returning the map. No instance wrapper -- these rows aren't model instances (COUNT(*), a single
  column). `nil` when there is no row."
  [model builder params]
  (let [ins  (direction-fns model :in)
        outs (direction-fns model :out)]
    (some->> (t2/query-one (builder (apply-transforms ins params)))
             (apply-transforms outs))))

(defn rows
  "Run a read `builder` returning plain maps (aggregations, projections that aren't model rows).
  In-transforms the params; does NOT out-transform or instance the results, since these rows are
  not model instances. Use [[select-executor]] when you want instances."
  [model builder params]
  (let [ins (direction-fns model :in)]
    (t2/query (builder (apply-transforms ins params)))))

(defn insert-returning-pk!
  "Insert one `row` (in-transformed) via a `builder`, returning the generated primary key. Uses
  the `insert.pks` query type so generated-key handling stays cross-db."
  [model builder row]
  (let [ins (direction-fns model :in)]
    (first (t2/query nil :toucan.query-type/insert.pks model
                     (builder (apply-transforms ins row))))))
