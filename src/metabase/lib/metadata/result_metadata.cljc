(ns metabase.lib.metadata.result-metadata
  "Code related to calculating result metadata as returned by the Query Processor. This differs from the normal
  [[metabase.lib.metadata.calculation/returned-columns]] a bit, mostly for historical reasons. Hopefully as time moves
  on we can bring this closer and closer to the metadata returned by `returned-columns`. Unlike `returned-columns`,
  this only works on the last stage of the query.

  Traditionally this code lived in the [[metabase.query-processor.middleware.annotate]] namespace, where it is still
  used today."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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

(mr/def ::cols
  [:maybe [:sequential ::col]])

(mr/def ::metadata
  [:map
   [:cols {:optional true} ::cols]])

;;; TODO -- move into lib, deduplicate with [[metabase.lib.remove-replace/rename-join]]
(mu/defn- rename-join :- ::lib.schema/query
  "Rename all joins with `old-alias` in a query to `new-alias`. Does not currently different between multiple join
  with the same name appearing in multiple locations. Surgically updates only things that are actual join aliases and
  not other occurrences of the string.

  This is meant to use to reverse the join renaming done
  by [[metabase.query-processor.middleware.escape-join-aliases]]."
  [query     :- ::lib.schema/query
   old-alias :- ::lib.schema.join/alias
   new-alias :- ::lib.schema.join/alias]
  (lib.walk/walk
   query
   (letfn [(update-field-refs [x]
             (if (keyword? x)
               x
               (lib.util.match/replace x
                 [:field (opts :guard #(= (:join-alias %) old-alias)) id-or-name]
                 [:field (assoc opts :join-alias new-alias) id-or-name])))]
     (fn [_query path-type _path stage-or-join]
       (case path-type
         :lib.walk/join
         (let [join stage-or-join]
           (-> join
               (update :alias (fn [current-alias]
                                (if (= current-alias old-alias)
                                  new-alias
                                  current-alias)))
               (m/update-existing :fields update-field-refs)
               (update :conditions update-field-refs)))

         :lib.walk/stage
         (let [stage stage-or-join]
           (update-field-refs stage)))))))

(mu/defn- restore-original-join-aliases :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (reduce
   (fn [query [old-alias new-alias]]
     (rename-join query old-alias new-alias))
   query
   (get-in query [:info :alias/escaped->original])))

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
           ;; aggregations). Same for `:lib/source`
           (u/select-non-nil-keys lib-col [:name :lib/source])
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
    (throw (ex-info (lib.util/format (str "column number mismatch between initial metadata columns returned by driver (%d) and"
                                 " those expected by MLv2 (%d). Did the driver return the wrong number of columns? "
                                 " Or is there a bug in MLv2 metadata calculation?")
                            (count initial-cols)
                            (count lib-cols))
                    {:initial-cols (map :name initial-cols)
                     :lib-cols     (map (some-fn :lib/desired-column-alias :name) lib-cols)}))))

(mu/defn- source->legacy-source :- ::legacy-source
  [source :- [:maybe ::lib.schema.metadata/column-source]]
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
    :source/implicitly-joinable :fields
    ;; ???? Not clear why some columns don't have a `:lib/source` at all. But in that case just fall back to `:fields`
    :fields))

(mu/defn- basic-native-col :- ::kebab-cased-col
  "Generate basic column metadata for a column coming back from a native query for which we have only barebones metadata
  coming back from the driver like name and base type."
  [col :- ::col]
  (let [base-type (or ((some-fn :base-type :base_type) col)
                      :type/*)]
    {:lib/type       :metadata/column
     :lib/source     :source/native
     :display-name   (:name col)
     :base-type      base-type
     :effective-type base-type}))

(mu/defn- add-converted-timezone :- [:sequential ::kebab-cased-col]
  "Add `:converted-timezone` to columns that are from `:convert-timezone` expressions (or expressions wrapping them) --
  this is used by [[metabase.query-processor.middleware.format-rows/format-rows-xform]].

  TODO -- we should move this into mainline lib metadata calculation -- Cam"
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-col]]
  (mapv (fn [col]
          (let [converted-timezone (when-let [expression-name (:lib/expression-name col)]
                                     (when-let [expr (try
                                                       (lib.expression/resolve-expression query expression-name)
                                                       (catch #?(:clj Throwable :cljs :default) e
                                                         (log/error e "Warning: column metadata has invalid :lib/expression-name (this was probably incorrectly propagated from a previous stage) (QUE-1342)")
                                                         nil))]
                                       (lib.util.match/match-one expr
                                         [:convert-timezone _opts _expr source-tz _dest-tz]
                                         source-tz)))]
            (cond-> col
              converted-timezone (assoc :converted-timezone converted-timezone))))
        cols))

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

      [:field (field-name :guard string?) opts]
      [:field field-name (not-empty (dissoc opts :inherited-temporal-unit))]

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
         lib.ref/ref
         lib.convert/->legacy-MBQL
         fe-friendly-expression-ref)))

(mu/defn- add-legacy-field-refs :- [:sequential ::kebab-cased-col]
  "Add legacy `:field_ref` to QP results metadata which is still used in a single place in the FE -- see
  https://metaboat.slack.com/archives/C0645JP1W81/p1749064632710409?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-col]]
  (lib.convert/do-with-aggregation-list
   (lib.aggregation/aggregations query)
   (fn []
     (mapv (fn [col]
             (let [field-ref (super-broken-legacy-field-ref col)]
               (cond-> col
                 field-ref (assoc :field-ref field-ref))))
           cols))))

(mu/defn- deduplicate-names :- [:sequential ::kebab-cased-col]
  "Needed for legacy FE viz settings purposes for the time being. See
  https://metaboat.slack.com/archives/C0645JP1W81/p1749070704566229?thread_ts=1748958872.704799&cid=C0645JP1W81

  These should just get `_2` and what not appended to them as needed -- they should not get truncated."
  [cols :- [:sequential ::kebab-cased-col]]
  (map (fn [col unique-name]
         (assoc col :name unique-name))
       cols
       (mbql.u/uniquify-names (map :name cols))))

(def ^:private preserved-keys
  "Keys that can survive merging metadata from the database onto metadata computed from the query. When merging
  metadata, the types returned should be authoritative. But things like semantic_type, display_name, and description
  can be merged on top."
  ;; TODO: ideally we don't preserve :id but some notion of :user-entered-id or :identified-id
  [:id :description :display-name :semantic-type :fk-target-field-id :settings :visibility-type])

(defn- combine-metadata
  "Blend saved metadata from previous runs into fresh metadata from an actual run of the query.

  Ensure that saved metadata from datasets or source queries can remain in the results metadata. We always recompute
  metadata in general, so need to blend the saved metadata on top of the computed metadata. First argument should be
  the metadata from a run from the query, and `pre-existing` should be the metadata from the database we wish to
  ensure survives."
  [fresh pre-existing]
  (let [by-name (m/index-by :name pre-existing)]
    (for [{:keys [source] :as col} fresh]
      (if-let [existing (and (not= :aggregation source)
                             (get by-name (:name col)))]
        (merge col (select-keys existing preserved-keys))
        col))))

(mu/defn- merge-model-metadata :- [:sequential ::kebab-cased-col]
  "Merge in snake-cased `:metadata/model-metadata`."
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-col]]
  (let [model-metadata (map (fn [col]
                              (update-keys col u/->kebab-case-en))
                            (get-in query [:info :metadata/model-metadata]))]
    (cond-> cols
      (seq model-metadata)
      (combine-metadata model-metadata))))

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
                   (doall (lib.metadata.calculation/returned-columns query -1 (lib.util/query-stage query -1) {:unique-name-fn (mbql.u/unique-name-generator)})))
        ;; generate barebones cols if lib was unable to calculate metadata here.
        lib-cols (if (empty? lib-cols)
                   (mapv basic-native-col initial-cols)
                   lib-cols)]
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

(mu/defn- col->legacy-metadata :- ::kebab-cased-col
  "Convert MLv2-style `:metadata/column` column metadata to the `snake_case` legacy format we've come to know and love
  in QP results metadata (`data.cols`)."
  [col :- ::kebab-cased-col]
  (letfn [(add-unit [col]
            (merge
             ;; TODO -- we also need to 'flow' the unit from previous stage(s) "so the frontend can use the correct
            ;; formatting to display values of the column" according
            ;; to [[metabase.query-processor-test.nested-queries-test/breakout-year-test]]
             (when-let [temporal-unit ((some-fn :metabase.lib.field/temporal-unit :inherited-temporal-unit) col)]
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
            (dissoc col :lib/uuid :lib/source-uuid))]
    (-> col
        add-unit
        add-binning-info
        remove-lib-uuids)))

(mu/defn- cols->legacy-metadata :- [:sequential ::kebab-cased-col]
  "Convert MLv2-style `kebab-case` metadata to legacy QP metadata results `snake_case`-style metadata. Keys are slightly
  different as well. This is mostly for backwards compatibility with old FE code. See this thread
  https://metaboat.slack.com/archives/C0645JP1W81/p1749077302448169?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [cols :- [:sequential ::kebab-cased-col]]
  (mapv col->legacy-metadata cols))

(mu/defn expected-cols :- [:sequential ::kebab-cased-col]
  "Return metadata for columns returned by a pMBQL `query`.

  `initial-cols` are (optionally) the initial minimal metadata columns as returned by the driver (usually just column
  name and base type). If provided these are merged with the columns the query is expected to return.

  Note this `initial-cols` is more or less required for native queries unless they have metadata attached."
  ([query]
   (expected-cols query []))

  ([query         :- ::lib.schema/query
    initial-cols  :- ::cols]
   (let [query' (restore-original-join-aliases query)]
     (->> initial-cols
          (add-extra-metadata query')
          cols->legacy-metadata))))
