(ns metabase.query-processor.middleware.annotate
  "Middleware for annotating (adding type information to) the results of a query, under the `:cols` column.

  TODO -- we should move most of this into a lib namespace -- Cam"
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.driver.common :as driver.common]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.debug :as qp.debug]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(comment metabase.query-processor.middleware.annotate.legacy-helper-fns/keep-me)

(mr/def ::legacy-source
  [:enum :aggregation :fields :breakout :native])

(mr/def ::super-broken-legacy-field-ref
  mbql.s/Reference)

(mr/def ::col
  [:map
   [:source    {:optional true} ::legacy-source]
   [:field-ref {:optional true} ::super-broken-legacy-field-ref]])

(mr/def ::kebab-cased-col
  [:and
   ::col
   [:fn
    {:error/message "column with all kebab-cased keys"}
    (fn [m]
      (every? (fn [k]
                (not (str/includes? k "_")))
              (keys m)))]])

(mr/def ::snake_cased-col
  [:and
   ::col
   [:fn
    {:error/message "column with all snake-cased keys"}
    (fn [m]
      (every? (fn [k]
                (not (str/includes? k "-")))
              (keys m)))]])

(mr/def ::cols
  [:maybe [:sequential ::col]])

(mr/def ::metadata
  [:map
   [:cols {:optional true} ::cols]])

(mu/defn- first-stage-type :- [:enum :mbql.stage/native :mbql.stage/mbql]
  [query :- ::lib.schema/query]
  (get-in query [:stages 0 :lib/type]))

(defmulti expected-cols
  "Return metadata for columns returned by a pMBQL `query`.

  `initial-cols` are (optionally) the initial minimal metadata columns as returned by the driver (usually just column
  name and base type). If provided these are merged with the columns the query is expected to return.

  Note this `initial-cols` is more or less required for native queries unless they have metadata attached."
  {:arglists '([query] [query initial-cols])}
  (fn
    ([query]
     (first-stage-type query))
    ([query _initial-cols]
     (first-stage-type query))))

(defmulti add-column-info
  "Middleware for adding type information about the columns in the query results (the `:cols` key)."
  {:arglists '([query rff])}
  (fn [query _rff]
    (first-stage-type query)))

(mu/defn- restore-original-join-aliases :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (binding [lib.join/*truncate-and-uniqify-join-names* false]
    (let [escaped->original (get-in query [:info :alias/escaped->original])]
      (if (empty? escaped->original)
        query
        (lib.walk/walk-stages
         query
         (mu/fn [query  :- ::lib.schema/query
                 path   :- ::lib.walk/path
                 _stage :- :map]
           (let [joins  (lib.walk/apply-f-for-stage-at-path lib/joins query path)
                 query' (reduce
                         (mu/fn [query :- ::lib.schema/query
                                 join  :- ::lib.schema.join/join]
                           (if-let [original (get escaped->original (lib/current-join-alias join))]
                             (lib.walk/apply-f-for-stage-at-path lib/rename-join query path join original)
                             query))
                         query
                         joins)]
             ;; return updated stage.
             (get-in query' path))))))))

(mu/defn- merge-col :- ::col
  "Merge a map from `:cols` returned by the driver with the column metadata from MLv2. We'll generally prefer the values
  from the driver to values calculated by MLv2."
  [driver-col :- [:maybe ::col]
   lib-col    :- [:maybe ::col]]
  (let [driver-col (update-keys driver-col u/->kebab-case-en)]
    (merge lib-col
           (m/filter-vals some? driver-col)
           ;; Prefer our inferred base type if the driver returned `:type/*` and ours is more specific
           (when (#{nil :type/*} (:base-type driver-col))
             (when-let [lib-base-type (:base-type lib-col)]
               {:base-type lib-base-type}))
           ;; Prefer our `:name` if it's something different that what's returned by the driver (e.g. for named
           ;; aggregations)
           (when-let [lib-name (:name lib-col)]
             {:name lib-name})
           ;; whatever type comes back from the query is by definition the effective type, otherwise fall back to the
           ;; type calculated by MLv2
           {:effective-type (or (:base-type driver-col)
                                (:effective-type lib-col)
                                (:base-type lib-col))})))

(mu/defn- merge-cols :- [:sequential ::kebab-cased-col]
  "Merge our column metadata (`:cols`) from MLv2 with the `initial-cols` metadata returned by the driver.

  It's the responsibility of the driver to make sure the `:cols` are returned in the correct number and order (matching
  the order supposed by MLv2). "
  [initial-cols :- [:maybe [:sequential ::kebab-cased-col]]
   lib-cols     :- [:maybe [:sequential ::kebab-cased-col]]]
  (cond
    (= (count initial-cols) (count lib-cols))
    (mapv merge-col initial-cols lib-cols)

    (empty? initial-cols)
    lib-cols

    (empty? lib-cols)
    initial-cols

    :else
    (throw (ex-info (format (str "column number mismatch between initial metadata columns returned by driver (%d) and"
                                 " those expected by MLv2 (%d). Did the driver return the wrong number of columns? "
                                 " Or is there a bug in MLv2 metadata calculation?")
                            (count initial-cols)
                            (count lib-cols))
                    {:initial-cols (map :name initial-cols)
                     :lib-cols     (map (some-fn :lib/desired-column-alias :name) lib-cols)
                     :type         qp.error-type/driver}))))

(mu/defn- source->legacy-source :- ::legacy-source
  [source :- ::lib.schema.metadata/column-source]
  (case source
    :source/card                :fields
    :source/native              :native
    :source/previous-stage      :fields
    :source/table-defaults      :fields
    :source/fields              :fields
    :source/aggregations        :aggregation
    :source/breakouts           :breakout
    :source/joins               :fields
    :source/expressions         :fields
    :source/implicitly-joinable :fields))

(mu/defn- add-legacy-source :- [:sequential
                                [:merge
                                 ::kebab-cased-col
                                 [:map
                                  [:source ::legacy-source]]]]
  "Add `:source` to result columns. Needed for legacy FE code. See
  https://metaboat.slack.com/archives/C0645JP1W81/p1749064861598669?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [cols :- [:sequential ::kebab-cased-col]]
  (mapv (fn [col]
          (assoc col :source (source->legacy-source (:lib/source col))))
        cols))

(mu/defn- add-converted-timezone :- [:sequential ::kebab-cased-col]
  "Add `:converted-timezone` to columns that are from `:convert-timezone` expressions (or expressions wrapping them) --
  this is used by [[metabase.query-processor.middleware.format-rows/format-rows-xform]].

  TODO -- we should move this into mainline lib metadata calculation -- Cam"
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-col]]
  (mapv (fn [col]
          (let [converted-timezone (when-let [expression-name (:lib/expression-name col)]
                                     (when-let [expr (try
                                                       (lib/resolve-expression query expression-name)
                                                       (catch Throwable e
                                                         (log/error e "Warning: column metadata has invalid :lib/expression-name")
                                                         nil))]
                                       (lib.util.match/match-one expr
                                         [:convert-timezone _opts _expr source-tz _dest-tz]
                                         source-tz)))]
            (cond-> col
              converted-timezone (assoc :converted-timezone converted-timezone))))
        cols))

(mu/defn- fe-friendly-expression-ref :- ::super-broken-legacy-field-ref
  "Apparently the FE viz code breaks for pivot queries if `field_ref` comes back with extra 'non-traditional' MLv2
  info (`:base-type` or `:effective-type` in `:expression`), so we better just strip this info out to be sure. If you
  don't believe me remove this and run `e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js` and you
  will see."
  [a-ref :- ::super-broken-legacy-field-ref]
  (let [a-ref (mbql.u/remove-namespaced-options a-ref)]
    (lib.util.match/replace a-ref
      [:field (id :guard pos-int?) opts]
      [:field id (not-empty (cond-> (dissoc opts :effective-type :inherited-temporal-unit)
                              (:source-field opts) (dissoc :join-alias)))]

      [:expression expression-name (opts :guard (some-fn :base-type :effective-type))]
      (let [fe-friendly-opts (dissoc opts :base-type :effective-type)]
        (if (seq fe-friendly-opts)
          [:expression expression-name fe-friendly-opts]
          [:expression expression-name])))))

(mu/defn- super-broken-legacy-field-ref :- [:maybe ::super-broken-legacy-field-ref]
  "Generate a SUPER BROKEN legacy field ref for backward-compatibility purposes for frontend viz settings usage."
  [col :- ::kebab-cased-col]
  (when (= (:lib/type col) :metadata/column)
    (->> col
         ;; MEGA HACK!!! APPARENTLY THE GENERATED FIELD REFS ALWAYS USE THE ORIGINAL NAME OF THE COLUMN, EVEN IF IT'S NOT
         ;; EVEN THE NAME WE ACTUALLY USE IN THE SOURCE QUERY!! BARF!
         #_(merge
            col
            (when-let [source-column-alias (:lib/source-column-alias col)]
              {:name source-column-alias}))
         #_(dissoc col :lib/desired-column-alias :lib/source-column-alias)
         lib/ref
         lib/->legacy-MBQL
         fe-friendly-expression-ref)))

(mu/defn- add-legacy-field-refs :- [:sequential ::kebab-cased-col]
  "Add legacy `:field_ref` to QP results metadata which is still used in a single place in the FE -- see
  https://metaboat.slack.com/archives/C0645JP1W81/p1749064632710409?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-col]]
  (lib.convert/do-with-aggregation-list
   (lib/aggregations query)
   (fn []
     (mapv (fn [col]
             (let [field-ref (super-broken-legacy-field-ref col)]
               (cond-> col
                 field-ref (assoc :field-ref field-ref))))
           cols))))

(mu/defn- deduplicate-names :- [:sequential ::kebab-cased-col]
  "Needed for legacy FE viz settings purposes for the time being. See
  https://metaboat.slack.com/archives/C0645JP1W81/p1749070704566229?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [cols :- [:sequential ::kebab-cased-col]]
  (map (fn [col unique-name]
         (assoc col :name unique-name))
       cols
       (mbql.u/uniquify-names (map :name cols))))

(mu/defn- merge-model-metadata :- [:sequential ::kebab-cased-col]
  "Merge in `:metadata/model-metadata`. I believe this should be `snake_case` which means this needs to happen AFTER
  `cols` are converted to `snake_case`."
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-col]]
  (let [model-metadata (map (fn [col]
                              (update-keys col u/->kebab-case-en))
                            (get-in query [:info :metadata/model-metadata]))]
    (cond-> cols
      (seq model-metadata)
      (qp.util/combine-metadata model-metadata))))

(mu/defn- add-extra-metadata :- [:sequential ::kebab-cased-col]
  "Add extra metadata to the [[lib/returned-columns]] that only comes back with QP results metadata.

  TODO -- we should probably move all this stuff into lib so it comes back there as well! That's a tech debt problem tho
  I guess. -- Cam"
  [query        :- ::lib.schema/query
   initial-cols :- ::cols]
  (let [lib-cols (binding [lib.metadata.calculation/*display-name-style* :long
                           ;; TODO -- this is supposed to mean `:inherited-temporal-unit` is included in the output
                           ;; but doesn't seem to be working?
                           lib.metadata.calculation/*propagate-binning-and-bucketing* true]
                   (doall (lib/returned-columns query)))]
    (as-> initial-cols cols
      (map (fn [col]
             (update-keys col u/->kebab-case-en))
           cols)
      (cond-> cols
        (seq lib-cols) (merge-cols lib-cols))
      (add-converted-timezone query cols)
      (add-legacy-source cols)
      (add-legacy-field-refs query cols)
      (deduplicate-names cols)
      (merge-model-metadata query cols))))

(mu/defn- col->legacy-metadata :- ::snake_cased-col
  "Convert MLv2-style `:metadata/column` column metadata to the `snake_case` legacy format we've come to know and love
  in QP results metadata (`data.cols`)."
  [col :- ::kebab-cased-col]
  (letfn [(add-unit [col]
            (merge
             ;; TODO -- we also need to 'flow' the unit from previous stage(s) "so the frontend can use the correct
            ;; formatting to display values of the column" according
            ;; to [[metabase.query-processor-test.nested-queries-test/breakout-year-test]]
             (when-let [temporal-unit (:metabase.lib.field/temporal-unit col)]
               {:unit temporal-unit})
             col))
          (add-binning-info [col]
            (merge
             (when-let [binning-info (:metabase.lib.field/binning col)]
               {:binning-info (merge
                               (when-let [strategy (:strategy binning-info)]
                                 {:binning-strategy strategy})
                               binning-info)})
             col))
          ;; remove `:lib/uuid` because it causes way to many test failures. Probably would be better to keep it around
          ;; but I don't have time to update a million tests.
          (remove-lib-uuids [col]
            (dissoc col :lib/uuid :lib/source-uuid))
          (->snake_case [col]
            (as-> col col
              (update-keys col u/->snake_case_en)
              (m/update-existing col :binning_info update-keys u/->snake_case_en)))]
    (-> col
        add-unit
        add-binning-info
        remove-lib-uuids
        ->snake_case)))

(mu/defn- cols->legacy-metadata :- [:sequential ::snake_cased-col]
  "Convert MLv2-style `kebab-case` metadata to legacy QP metadata results `snake_case`-style metadata. Keys are slightly
  different as well. This is mostly for backwards compatibility with old FE code. See this thread
  https://metaboat.slack.com/archives/C0645JP1W81/p1749077302448169?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [cols :- [:sequential ::kebab-cased-col]]
  (mapv col->legacy-metadata cols))

(mu/defmethod expected-cols :mbql.stage/mbql :- [:sequential ::snake_cased-col]
  ([query]
   (expected-cols query []))

  ([query         :- ::lib.schema/query
    initial-cols  :- ::cols]
   (let [query' (restore-original-join-aliases query)]
     (->> initial-cols
          (add-extra-metadata query')
          cols->legacy-metadata))))

(mu/defmethod add-column-info :mbql.stage/mbql :- ::qp.schema/rff
  [query :- ::lib.schema/query
   rff   :- ::qp.schema/rff]
  (mu/fn add-column-info-mbql-rff :- ::qp.schema/rf
    [initial-metadata :- ::metadata]
    (qp.debug/debug> (list `add-column-info query initial-metadata))
    (let [metadata' (update initial-metadata :cols #(expected-cols query %))]
      (qp.debug/debug> (list `add-column-info query initial-metadata '=> metadata'))
      (rff metadata'))))

;;;;
;;;; NATIVE
;;;;

(mu/defn base-type-inferer :- ::qp.schema/rf
  "Native queries don't have the type information from the original `Field` objects used in the query. If the driver
  returned a base type more specific than :type/*, use that; otherwise look at the sample of rows and infer the base
  type based on the classes of the values"
  [{:keys [cols]} :- :map]
  (apply analyze/col-wise
         (for [{driver-base-type :base_type} cols]
           (if (contains? #{nil :type/*} driver-base-type)
             (driver.common/values->base-type)
             (analyze/constant-fingerprinter driver-base-type)))))

(mu/defn- infer-base-type-xform :- ::qp.schema/rf
  "Add an xform to `rf` that will update the final results metadata with `base_type` and an updated `field_ref` based on
  the a sample of values in result rows. This is only needed for drivers that don't return base type in initial metadata
  -- I think Mongo is the only driver where this is the case."
  [metadata :- ::metadata
   rf       :- ::qp.schema/rf]
  (qp.reducible/combine-additional-reducing-fns
   rf
   [(base-type-inferer metadata)]
   (fn combine [result base-types]
     (let [cols' (mapv (fn [col base-type]
                         (assoc col :base_type base-type, :field_ref [:field (:name col) {:base-type base-type}]))
                       (:cols metadata)
                       base-types)]
       (rf (cond-> result
             (map? result)
             (assoc-in [:data :cols] cols')))))))

(mu/defmethod expected-cols :mbql.stage/native :- [:sequential ::snake_cased-col]
  ([query]
   (expected-cols query []))

  ([query        :- ::lib.schema/query
    initial-cols :- ::cols]
   (as-> initial-cols cols
     (for [col cols]
       (merge (let [base-type (or ((some-fn :base-type :base_type) col)
                                  :type/*)]
                {:lib/type       :metadata/column
                 :lib/source     :source/native
                 :display-name   (:name col)
                 :base-type      base-type
                 :effective-type base-type})
              col))
     (add-extra-metadata query cols)
     (cols->legacy-metadata cols))))

(mu/defmethod add-column-info :mbql.stage/native :- ::qp.schema/rff
  [query :- ::lib.schema/query
   rff   :- ::qp.schema/rff]
  (fn add-column-info-native-rff [initial-metadata]
    (let [metadata' (update initial-metadata :cols #(expected-cols query %))]
      (qp.debug/debug> (list `add-column-info query initial-metadata '=> metadata'))
      (infer-base-type-xform metadata' (rff metadata')))))

;;;;
;;;; NONSENSE
;;;;

;;; These are only for convenience for drivers that used to use stuff in annotate directly -- we can remove it once we
;;; convert drivers to MLv2
(p/import-vars
 [metabase.query-processor.middleware.annotate.legacy-helper-fns
  aggregation-name
  merged-column-info])
