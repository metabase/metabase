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
   [metabase.lib.card :as lib.card]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
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

(mr/def ::super-broken-legacy-field-ref.options
  [:and
   [:map
    {:closed? true}
    [:base-type     {:optional true} keyword?]
    [:temporal-unit {:optional true} keyword?]
    [:binning       {:optional true} map?]
    [:join-alias    {:optional true} string?]
    [:source-field  {:optional true} pos-int?]]
   [:fn
    {:error/message "options map cannot be empty"}
    seq]])

(mr/def ::super-broken-legacy-field-ref
  [:and
   mbql.s/Reference
   [:multi
    {:dispatch first}
    [:field [:tuple
             [:= :field]
             [:or pos-int? string?]
             [:maybe ::super-broken-legacy-field-ref.options]]]
    [:expression [:cat
                  [:= :expression]
                  string?
                  [:? ::super-broken-legacy-field-ref.options]]]
    [:aggregation [:cat
                   [:= :aggregation]
                   int?
                   [:? ::super-broken-legacy-field-ref.options]]]]])

(mr/def ::col
  [:map
   [:source    {:optional true} ::legacy-source]
   [:field-ref {:optional true} ::super-broken-legacy-field-ref]])

(mr/def ::kebab-cased-map
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

(defn- distinct-by-schema [k]
  [:fn
   (let [message (str k " should be distinct")]
     {:error/message message
      :error/fn      (fn [{:keys [value]} _]
                       (str message ", got: " (pr-str (map k value))))})
   (fn [xs]
     (or (empty? xs)
         (apply distinct? (map k xs))))])

(mr/def ::distinct-names (distinct-by-schema :name))
(mr/def ::distinct-field-refs (distinct-by-schema :field-ref))

(mr/def ::expected-cols
  [:and
   [:sequential ::kebab-cased-map]
   ;; ensures this is a `:metabase.lib.schema.metadata/column` with a `:lib/desired-column-alias` that is present and
   ;; unique
   lib.metadata.calculation/ColumnsWithUniqueAliases
   ;; make sure `:name` and `:field-ref` are present and unique as well.
   ::distinct-names
   ::distinct-field-refs])

;;; NOCOMMIT
;;;
;;; TODO -- deduplicate with [[metabase.lib.remove-replace/rename-join]]
#_(mu/defn- rename-join :- ::lib.schema/query
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

;;; NOCOMMIT
#_(mu/defn- restore-original-join-aliases :- ::lib.schema/query
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

(mu/defn- merge-cols :- [:sequential ::kebab-cased-map]
  "Merge our column metadata (`:cols`) from MLv2 with the `initial-cols` metadata returned by the driver.

  It's the responsibility of the driver to make sure the `:cols` are returned in the correct number and order (matching
  the order supposed by MLv2)."
  [initial-cols :- [:maybe [:sequential ::kebab-cased-map]]
   lib-cols     :- [:maybe [:sequential ::kebab-cased-map]]]
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
                    (letfn [(select-relevant-keys [m]
                              (select-keys m [:id :metabase.lib.join/join-alias :lib/desired-column-alias :lib/deduplicated-name :lib/original-name :name]))]
                      {:initial-cols (map select-relevant-keys initial-cols)
                       :lib-cols     (map select-relevant-keys lib-cols)})))))

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

(mu/defn- basic-native-col :- ::kebab-cased-map
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

(mu/defn- add-converted-timezone :- [:sequential ::kebab-cased-map]
  "Add `:converted-timezone` to columns that are from `:convert-timezone` expressions (or expressions wrapping them) --
  this is used by [[metabase.query-processor.middleware.format-rows/format-rows-xform]].

  TODO -- we should move this into mainline lib metadata calculation -- Cam"
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-map]]
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

(mu/defn- add-source-alias :- [:sequential ::kebab-cased-map]
  "`:source-alias` (`:source_alias`) is still needed
  for [[metabase.query-processor.middleware.remove-inactive-field-refs]]
  and [[metabase.lib.equality/column-join-alias]] to work correctly. Why? Not 100% sure -- we should theoretically be
  able to use `:metabase.lib.join/join-alias` for this purpose -- but that doesn't seem to work. Until I figure that
  out, include the `:source-alias` key.

  Note that this is no longer used on the FE -- see QUE-1355"
  [cols :- [:sequential ::kebab-cased-map]]
  (for [col cols]
    (merge
     (when-let [join-alias ((some-fn lib.join.util/current-join-alias :source-alias :lib/previous-stage-join-alias) col)]
       {:source-alias join-alias})
     col)))

(mu/defn- add-legacy-source :- [:sequential
                                [:merge
                                 ::kebab-cased-map
                                 [:map
                                  [:source ::legacy-source]]]]
  "Add `:source` to result columns. Needed for legacy FE code. See
  https://metaboat.slack.com/archives/C0645JP1W81/p1749064861598669?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [cols :- [:sequential ::kebab-cased-map]]
  (mapv (fn [col]
          (assoc col :source (source->legacy-source (:lib/source col))))
        cols))

(defn- add-traditional-display-names
  "There was some insane (weird) display name logic in the old QP code. Try to match what it did. (Not super important
  since display names generally aren't used as keys outside of tests but I guess we can try to mimic them anyway.)"
  [query cols]
  (for [col cols]
    (let [col' (merge col
                      (when-let [previous-join-alias ((some-fn :lib/previous-stage-join-alias :source-alias) col)]
                        {:metabase.lib.join/join-alias previous-join-alias})
                      (when-let [original-name (:lib/original-name col)]
                        {:name original-name}))]
      (if (= col' col)
        col
        (assoc col :display-name (lib.metadata.calculation/display-name query col'))))))

(mu/defn- fe-friendly-expression-ref :- ::super-broken-legacy-field-ref
  "Apparently the FE viz code breaks for pivot queries if `field_ref` comes back with extra 'non-traditional' MLv2
  info (`:base-type` or `:effective-type` in `:expression`), so we better just strip this info out to be sure. If you
  don't believe me remove this and run `e2e/test/scenarios/visualizations-tabular/pivot_tables.cy.spec.js` and you
  will see."
  [col   :- ::kebab-cased-map
   a-ref :- mbql.s/Reference]
  (let [a-ref (mbql.u/remove-namespaced-options a-ref)]
    (lib.util.match/replace a-ref
      [:field (id :guard pos-int?) opts]
      [:field id (not-empty (cond-> (dissoc opts :effective-type :inherited-temporal-unit)
                              (:source-field opts) (dissoc :join-alias)
                              (:metabase.lib.query/transformation-added-base-type col) (dissoc :base-type)))]

      [:field (field-name :guard string?) opts]
      [:field field-name (not-empty (dissoc opts :inherited-temporal-unit))]

      [:expression expression-name (opts :guard (some-fn :base-type :effective-type))]
      (let [fe-friendly-opts (dissoc opts :base-type :effective-type)]
        (if (seq fe-friendly-opts)
          [:expression expression-name fe-friendly-opts]
          [:expression expression-name])))))

(mu/defn- remove-join-alias-from-broken-field-ref?
  "Following the rules for the old 'annotate' code:

  If the source query is from a saved question, remove the join alias as the caller should not be aware of joins
  happening inside the saved question. The `not join-is-at-current-level?` check is to ensure that we are not removing
  `:join-alias` from fields from the right side of the join."
  [query :- ::lib.schema/query
   col   :- ::kebab-cased-map]
  (let [stage                     (lib.util/query-stage query -1)
        stage-has-source-card?    (:qp/stage-had-source-card stage)
        join-is-in-current-stage? (when-let [join-alias (lib.join.util/current-join-alias col)]
                                    (some #(= (lib.join.util/current-join-alias %) join-alias)
                                          (lib.join/joins query -1)))]
    (and stage-has-source-card?
         (not join-is-in-current-stage?))))

;;; TODO (Cam 6/12/25) -- all this stuff should be moved into the main [[metabase.lib.field]] namespace as and done
;;; automatically when [[lib.ref/*ref-style*]] is `:ref.style/broken-legacy-qp-results`
(mu/defn- super-broken-legacy-field-ref :- [:maybe ::super-broken-legacy-field-ref]
  "Generate a SUPER BROKEN legacy field ref for backward-compatibility purposes for frontend viz settings usage."
  [query :- ::lib.schema/query
   col   :- ::kebab-cased-map]
  (when (= (:lib/type col) :metadata/column)
    (let [remove-join-alias? (remove-join-alias-from-broken-field-ref? query col)]
      (->> (lib.ref/ref col)
           #_(if-let [original-ref (:lib/original-ref col)]
               (cond-> original-ref
                 remove-join-alias? (lib.join/with-join-alias nil))
               (binding [lib.ref/*ref-style* :ref.style/default #_:ref.style/broken-legacy-qp-results] ; NOCOMMIT
                 (let [col (cond-> col
                             remove-join-alias? (lib.join/with-join-alias nil)
                             remove-join-alias? (assoc ::remove-join-alias? true))]
                   (->> (merge
                         col
                         (when-not remove-join-alias?
                           (when-let [previous-join-alias (:lib/previous-stage-join-alias col)]
                             {:metabase.lib.join/join-alias previous-join-alias}))
                         #_(when-let [original-name (:lib/original-name col)]
                             {:name original-name}))
                        lib.ref/ref))))
           #_((fn [a-ref]
              (println "(u/pprint-to-str a-ref):" (u/pprint-to-str a-ref)) ; NOCOMMIT
              a-ref
              ))
           lib.convert/->legacy-MBQL
           (fe-friendly-expression-ref col)))))

(mu/defn- add-legacy-field-refs :- [:and
                                    [:sequential ::kebab-cased-map]
                                    ::distinct-field-refs]
  "Add legacy `:field_ref` to QP results metadata which is still used in a single place in the FE -- see
  https://metaboat.slack.com/archives/C0645JP1W81/p1749064632710409?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [query :- ::lib.schema/query
   cols  :- [:and
             [:sequential ::kebab-cased-map]
             lib.metadata.calculation/ColumnsWithUniqueAliases]]
  #_(println "(map :lib/desired-column-alias cols):" (pr-str (map :lib/desired-column-alias cols))) ; NOCOMMIT
  (lib.convert/do-with-aggregation-list
   (lib.aggregation/aggregations query)
   (fn []
     (mapv (fn [col]
             (let [field-ref (super-broken-legacy-field-ref query col)]
               (cond-> col
                 field-ref (assoc :field-ref field-ref))))
           cols))))

(mu/defn- deduplicate-names :- [:sequential ::kebab-cased-map]
  "Needed for legacy FE viz settings purposes for the time being. See
  https://metaboat.slack.com/archives/C0645JP1W81/p1749070704566229?thread_ts=1748958872.704799&cid=C0645JP1W81

  These should just get `_2` and what not appended to them as needed -- they should not get truncated."
  [cols :- [:sequential ::kebab-cased-map]]
  (for [col (lib.field.util/add-deduplicated-names cols)]
    (assoc col :name (:lib/deduplicated-name col))))

;;; TODO (Cam 6/13/25) -- duplicated/overlapping responsibility with [[metabase.lib.card/merge-model-metadata]] as
;;; well as [[metabase.lib.field/previous-stage-metadata]] -- find a way to deduplicate these
(mu/defn- merge-model-metadata :- [:sequential ::kebab-cased-map]
  "Merge in snake-cased `:metadata/model-metadata`."
  [query :- ::lib.schema/query
   cols  :- [:sequential ::kebab-cased-map]]
  (let [model-metadata (some->> (get-in query [:info :metadata/model-metadata])
                                (lib.card/->card-metadata-columns query))]
    (cond-> cols
      (seq model-metadata)
      (lib.card/merge-model-metadata model-metadata))))

(mu/defn- add-extra-metadata :- [:sequential ::kebab-cased-map]
  "Add extra metadata to the [[lib/returned-columns]] that only comes back with QP results metadata.

  TODO -- we should probably move all this stuff into lib so it comes back there as well! That's a tech debt problem tho
  I guess. -- Cam"
  [query        :- ::lib.schema/query
   initial-cols :- ::cols]
  (let [lib-cols (binding [lib.metadata.calculation/*display-name-style* :long
                           ;; TODO -- this is supposed to mean `:inherited-temporal-unit` is included in the output
                           ;; but doesn't seem to be working?
                           lib.metadata.calculation/*propagate-binning-and-bucketing* true]
                   (doall (lib.metadata.calculation/returned-columns
                           query
                           -1
                           (lib.util/query-stage query -1)
                           ;; TODO (Cam 6/12/25) -- not 100% sure about using different unique name generation logic
                           ;; here versus what is normally done in Lib -- I guess it should mean joins don't get
                           ;; truncated, but don't we want desired column aliases to match what lib generates?
                           {:unique-name-fn (lib.util/non-truncating-unique-name-generator)})))
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
      (add-source-alias cols)
      (add-legacy-source cols)
      (add-traditional-display-names query cols)
      (add-legacy-field-refs query cols)
      (deduplicate-names cols)
      (merge-model-metadata query cols))))

(defn- add-unit [col]
  (merge
   ;; TODO -- we also need to 'flow' the unit from previous stage(s) "so the frontend can use the correct
   ;; formatting to display values of the column" according
   ;; to [[metabase.query-processor-test.nested-queries-test/breakout-year-test]]
   (when-let [temporal-unit ((some-fn :metabase.lib.field/temporal-unit :inherited-temporal-unit) col)]
     {:unit temporal-unit})
   col))

(defn- add-binning-info [col]
  (merge
   (when-let [binning-info (:metabase.lib.field/binning col)]
     {:binning-info (merge
                     (when-let [strategy (:strategy binning-info)]
                       {:binning-strategy strategy})
                     binning-info)})
   col))

;;; TODO (Cam 6/12/25) -- remove `:lib/uuid` because it causes way to many test failures. Probably would be better to
;;; keep it around but I don't have time to update a million tests.
;;;
;;; NOCOMMIT
#_(defn- remove-lib-uuids [col]
  (dissoc col :lib/uuid :lib/source-uuid :lib/original-ref))

(mu/defn- col->legacy-metadata :- ::kebab-cased-map
  "Convert MLv2-style `:metadata/column` column metadata to the `snake_case` legacy format we've come to know and love
  in QP results metadata (`data.cols`)."
  [col :- ::kebab-cased-map]
  (-> col
      add-unit
      add-binning-info))

(mu/defn- cols->legacy-metadata :- [:sequential ::kebab-cased-map]
  "Convert MLv2-style `kebab-case` metadata to legacy QP metadata results `snake_case`-style metadata. Keys are slightly
  different as well. This is mostly for backwards compatibility with old FE code. See this thread
  https://metaboat.slack.com/archives/C0645JP1W81/p1749077302448169?thread_ts=1748958872.704799&cid=C0645JP1W81"
  [cols :- [:sequential ::kebab-cased-map]]
  (mapv col->legacy-metadata cols))

(mu/defn expected-cols :- ::expected-cols
  "Return metadata for columns returned by a pMBQL `query`.

  `initial-cols` are (optionally) the initial minimal metadata columns as returned by the driver (usually just column
  name and base type). If provided these are merged with the columns the query is expected to return.

  Note this `initial-cols` is more or less required for native queries unless they have metadata attached."
  ([query]
   (expected-cols query []))

  ([query         :- ::lib.schema/query
    initial-cols  :- ::cols]
   (let [query' query #_(restore-original-join-aliases query)] ; NOCOMMIT
     (->> initial-cols
          (add-extra-metadata query')
          cols->legacy-metadata))))
