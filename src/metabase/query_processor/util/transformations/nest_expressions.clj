(ns metabase.query-processor.util.transformations.nest-expressions
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def ^:private first-stage-keys
  "Keys from the original stage to keep in the new first stage. Other keys will get moved to the second stage."
  #{:joins :expressions :source-table :source-card :sources #_:lib/stage-metadata})

(mu/defn ^:private first-stage-ref :- [:maybe [:or :mbql.clause/field :mbql.clause/expression]]
  [column-metadata :- ::lib.schema.metadata/column]
  (when-not (#{:source/aggregations} (:lib/source column-metadata))
    (-> column-metadata
        lib/ref
        (lib.options/update-options
         merge
         ;; make sure we specify default date bucketing here so QP preprocessing doesn't try to switch this to day
         ;; bucketing without our knowledge.
         (when (isa? ((some-fn :effective-type :base-type) column-metadata) :type/Temporal)
           {:temporal-unit :default})))))

(mu/defn ^:private new-first-stage :- ::lib.schema/stage
  [stage        :- ::lib.schema/stage
   used-columns :- [:sequential {:min 1} ::lib.schema.metadata/column]]
  (-> stage
      (select-keys (conj first-stage-keys :lib/type))
      (assoc :fields (into []
                           (keep first-stage-ref)
                           used-columns))))

(mu/defn ^:private second-stage-ref :- :mbql.clause/field
  [[_tag opts :as original-ref] :- [:or :mbql.clause/field :mbql.clause/expression]
   column-metadata              :- ::lib.schema.metadata/column
   options                      :- [:maybe :map]]
  (u/prog1 (-> column-metadata
               (assoc :lib/source              :source/previous-stage
                      :lib/source-column-alias (:lib/desired-column-alias column-metadata))
               (lib/with-join-alias nil)
               lib/ref
               (lib.options/update-options merge
                                           (dissoc opts
                                                   :lib/uuid
                                                   :join-alias
                                                   ;; throw out the add-alias info stuff so it has to be recalculated if
                                                   ;; it's present.
                                                   :metabase.query-processor.util.add-alias-info/source-table
                                                   :metabase.query-processor.util.add-alias-info/source-alias
                                                   :metabase.query-processor.util.add-alias-info/desired-alias
                                                   :metabase.query-processor.util.add-alias-info/position)))
    (when (:log? options true)
      (log/tracef "Rewrote\n%s=>\n%s" (u/pprint-to-str original-ref) (u/pprint-to-str <>)))))

(mu/defn ^:private second-stage-ref-using-visible-columns :- [:or :mbql.clause/field :mbql.clause/expression]
  [metadata-providerable   :- ::lib.schema.metadata/metadata-providerable
   [tag, :as original-ref] :- [:or :mbql.clause/field :mbql.clause/expression]
   visible-columns         :- [:sequential ::lib.schema.metadata/column]
   options                 :- [:maybe :map]]
  (if-let [col (or (lib.equality/find-matching-column original-ref visible-columns)
                   ;; workaround busted queries using `:field` clauses with Field ID even when there are source
                   ;; query stages.
                   (do
                     (log/warnf "Failed to find matching column for ref %s, fetching metadata using Field ID"
                                (pr-str original-ref))
                     (when (= tag :field)
                       (let [[_tag _opts id-or-name] original-ref]
                         (when (pos-int? id-or-name)
                           (lib.metadata/field metadata-providerable id-or-name))))))]
    (second-stage-ref original-ref col options)
    (do
      (log/warnf "Error nesting expressions: cannot find match for clause:\n\n%s" (u/pprint-to-str original-ref))
      (log/debugf "Candidates:\n%s" (u/pprint-to-str visible-columns))
      original-ref)))

(mu/defn ^:private new-second-stage :- ::lib.schema/stage
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   stage                 :- ::lib.schema/stage
   visible-columns       :- [:sequential ::lib.schema.metadata/column]
   options               :- [:maybe :map]]
  (let [stage                 (apply dissoc stage first-stage-keys)
        visible-expressions   (filter #(= (:lib/source %) :source/expressions)
                                      visible-columns)
        other-visible-columns (remove #(= (:lib/source %) :source/expressions)
                                      visible-columns)]
    (merge
     (select-keys stage [:lib/stage-metadata])
     (lib.util.match/replace (dissoc stage :lib/stage-metadata)
       #{:expression :field}
       (let [[tag] &match
             cols  (case tag
                     :expression visible-expressions
                     :field      other-visible-columns)]
         (second-stage-ref-using-visible-columns metadata-providerable &match cols options))))))

(mu/defn ^:private nest-expressions-in-stage :- [:maybe [:sequential {:min 2, :max 2} ::lib.schema/stage]]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path
   stage :- ::lib.schema/stage]
  (when (seq (:expressions stage))
    (let [visible-columns-with-dupes   (lib.walk/apply-f-for-stage-at-path lib/visible-columns query path)
          visible-columns              visible-columns-with-dupes
          ;; do an initial calculation of the second stage so we can determine what we're using in it.
          second-stage                 (new-second-stage query stage visible-columns {:log? false})
          ;; calculate the first stage, but only return stuff used in the second stage.
          used-column-names            (into #{} (lib.util.match/match second-stage
                                                   [:field _opts (field-name :guard string?)]
                                                   field-name))
          _                            (log/debugf "Columns used in second stage: %s" (pr-str used-column-names))
          used-columns                 (filter #(contains? used-column-names (:lib/desired-column-alias %))
                                               visible-columns)
          _                            (when-not (= (count used-column-names)
                                                    (count used-columns))
                                         (log/warn (str "Error determining used columns: could not match up some used column names.\n"
                                                        "This query may not return the correct columns.\n"
                                                        "original stage:\n"
                                                        (u/pprint-to-str (get-in query path)) \newline
                                                        "visible columns:\n"
                                                        (u/pprint-to-str visible-columns) \newline
                                                        "new second stage:\n"
                                                        (u/pprint-to-str second-stage) \newline
                                                        "used column names:\n"
                                                        (u/pprint-to-str used-column-names) \newline
                                                        "reconciled used columns:\n"
                                                        (u/pprint-to-str used-columns))))
          first-stage                  (new-first-stage stage used-columns)
          ;; recalculate the second stage using the correct returned columns for the first stage so the column aliases
          ;; line up. Ignore the `:fields` from `:joins`, since the relevant stuff should already be copied over into
          ;; `:fields` -- if we don't ignore them we can end up with duplicates.
          first-stage-returned-columns (let [first-stage (m/update-existing first-stage :joins (fn [joins]
                                                                                                 (mapv (fn [join]
                                                                                                         (assoc join :fields :none))
                                                                                                       joins)))
                                             query       (assoc-in query path first-stage)]
                                         (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path))
          second-stage                 (new-second-stage query stage first-stage-returned-columns {:log? true})]
      (log/debugf "New first stage:\n%s" (u/pprint-to-str first-stage))
      (log/debugf "New second stage:\n%s" (u/pprint-to-str second-stage))
      [first-stage second-stage])))

(mu/defn nest-expressions :- ::lib.schema/query
  "If any `:expressions` appear in a query stage, introduce another stage including just the `:expressions` and any
  `:joins`; update `:fields`, `:aggregation`, and `:breakout` to refer to updated references."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query nest-expressions-in-stage))
