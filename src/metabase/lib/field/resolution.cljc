(ns metabase.lib.field.resolution
  "Code for resolving field metadata from a field ref. There's a lot of code here, isn't there? This is probably more
  complicated than it needs to be!"
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.card :as lib.card]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.ident :as lib.metadata.ident]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn- add-parent-column-metadata
  "If this is a nested column, add metadata about the parent column."
  [query                             :- ::lib.schema/query
   {:keys [parent-id], :as metadata} :- ::lib.schema.metadata/column]
  (if-not parent-id
    metadata
    (let [parent-metadata                                        (lib.metadata/field query parent-id)
          {parent-name :name, parent-display-name :display-name} (add-parent-column-metadata query parent-metadata)
          new-name                                               (str parent-name
                                                                      \.
                                                                      ((some-fn :lib/original-name :name) metadata))
          new-display-name                                       (str parent-display-name
                                                                      ": "
                                                                      ((some-fn :lib/original-display-name :display-name)
                                                                       metadata))]
      (assoc metadata
             :name                                   new-name
             :display-name                           new-display-name
             ;; this is used by the `display-name-method` for `:metadata/column` in [[metabase.lib.field]]
             :metabase.lib.field/simple-display-name new-display-name))))

(defn- field-metadata
  "Metadata about the field from the metadata provider."
  [query field-id]
  (when field-id
    (when-let [col (lib.metadata/field query field-id)]
      (->> (assoc col
                  :lib/original-name         (:name col)
                  :lib/original-display-name (:display-name col))
           (add-parent-column-metadata query)))))

;;; TODO (Cam 6/18/25) -- duplicated somewhat with the stuff in [[metabase.lib.field/plausible-matches-for-name]]; we
;;; need to consolidate this into there.

(mu/defn- resolve-column-name-in-metadata :- [:maybe ::lib.schema.metadata/column]
  "Find the column with `column-name` in a sequence of `column-metadatas`."
  [column-name      :- ::lib.schema.common/non-blank-string
   column-metadatas :- [:sequential ::lib.schema.metadata/column]]
  (let [resolution-keys [:lib/source-column-alias :lib/deduplicated-name :lib/desired-column-alias :name :lib/original-name]]
    (or (some (fn [k]
                (m/find-first #(= (get % k) column-name)
                              column-metadatas))
              resolution-keys)
        (do
          ;; ideally we shouldn't hit this but if we do it's not the end of the world.
          (log/infof "Couldn't resolve column name %s."
                     (pr-str column-name))
          (log/debugf "Found:\n%s"
                      (u/pprint-to-str (mapv #(select-keys % (list* :lib/source :metabase.lib.join/join-alias resolution-keys))
                                             column-metadatas)))
          nil))))

(defn- resolve-column-in-metadata [id-or-name cols]
  (if (integer? id-or-name)
    (m/find-first (fn [col]
                    (and (not (lib.join.util/current-join-alias col))
                         (= (:id col) id-or-name)))
                  cols)
    (resolve-column-name-in-metadata id-or-name cols)))

(def ^:private ^:dynamic *recursive-column-resolution-by-name*
  "Whether we're in a recursive call to [[resolve-column-name]] or not. Prevent infinite recursion (#32063)"
  false)

(mu/defn resolve-column-name :- [:maybe ::lib.schema.metadata/column]
  "String column name: get metadata from the previous stage, if it exists, otherwise if this is the first stage and we
  have a native query or a Saved Question source query or whatever get it from our results metadata."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-name  :- ::lib.schema.common/non-blank-string]
  (when-not *recursive-column-resolution-by-name*
    (binding [*recursive-column-resolution-by-name* true]
      (let [previous-stage-number (lib.util/previous-stage-number query stage-number)
            stage                 (if previous-stage-number
                                    (lib.util/query-stage query previous-stage-number)
                                    (lib.util/query-stage query stage-number))
            stage-columns         (concat
                                   (lib.metadata.calculation/visible-columns query stage-number stage)
                                   ;; work around visible columns not including aggregations (#59657)
                                   (lib.aggregation/aggregations-metadata query stage-number))]
        (when-let [column (and (seq stage-columns)
                               (resolve-column-name-in-metadata column-name stage-columns))]
          (if-not previous-stage-number
            column
            (merge
             (-> column
                 (lib.join/with-join-alias nil)
                 (dissoc :table-id :metabase.lib.field/binning :metabase.lib.field/temporal-unit))
             ;; TODO (Cam 6/18/25) -- not sure this is useful for anything, can we remove it??
             (when-let [join-alias (lib.join.util/current-join-alias column)]
               {:lib/previous-stage-join-alias join-alias})
             {:lib/original-name ((some-fn :lib/original-name :name) column)
              :lib/source        :source/previous-stage})))))))

;;; TODO (Cam 6/17/25) -- move this into `lib.util` so we can use it elsewhere
(defn- merge-non-nil
  [m & more]
  (into (or m {})
        (comp cat
              (filter (fn [[_k v]]
                        (some? v))))
        more))

(def ^:private opts-propagated-keys
  "Keys to copy non-nil values directly from `:field` opts into column metadata."
  #{:base-type
    :display-name
    :ident
    :metabase.lib.query/transformation-added-base-type
    :metabase.lib.field/original-effective-type
    :metabase.lib.field/original-temporal-unit})

(def ^:private opts-propagated-renamed-keys
  "Keys in `:field` opts that get copied into column metadata with different keys when they have non-nil values.

    key-in-opts => key-in-col-metadata"
  {:lib/uuid                :lib/source-uuid
   :binning                 :metabase.lib.field/binning
   :join-alias              :metabase.lib.join/join-alias
   :source-field            :fk-field-id
   :source-field-join-alias :fk-join-alias
   :source-field-name       :fk-field-name
   :temporal-unit           :metabase.lib.field/temporal-unit})

(def ^:private opts-metadata-fns
  "Map of

    key-in-col-metadata => f

  Where `f` is of the form

    (f opts) => value

  If `f` returns a non-nil value, then it is included under `key-in-col-metadata`."
  (merge
   (into {} (map (fn [k] [k k])) opts-propagated-keys)
   (into {} (map (fn [[opts-k col-k]] [col-k opts-k]) opts-propagated-renamed-keys))
   {:effective-type
    ;; don't override the effective type of the column with the base type of ref, unless it's missing or has the
    ;; default value `:type/*` (see #56453)
    (fn [opts]
      (when-some [effective-type (:effective-type opts)]
        (if (= effective-type :type/*)
          (:base-type opts effective-type)
          effective-type)))
    ;; `:inherited-temporal-unit` is transfered from `:temporal-unit` ref option only when
    ;; the [[lib.metadata.calculation/*propagate-binning-and-bucketing*]] is truthy, i.e. bound.
    ;;
    ;; TODO (Cam 6/18/25) -- that DOES NOT seem to be how it actually works.
    ;;
    ;; Intent is to pass it from ref to column only during [[returned-columns]] call. Otherwise e.g.
    ;; [[orderable-columns]] would contain that too. That could be problematic, because original ref that
    ;; contained `:temporal-unit` contains no `:inherited-temporal-unit`. If the column like this was used
    ;; to generate ref for eg. order by it would contain the `:inherited-temporal-unit`, while
    ;; the original column (eg. in breakout) would not.
    :inherited-temporal-unit
    (fn [opts]
      (let [inherited-temporal-unit-keys (cond-> '(:inherited-temporal-unit)
                                           lib.metadata.calculation/*propagate-binning-and-bucketing*
                                           (conj :temporal-unit))]
        (when-some [inherited-temporal-unit (some opts inherited-temporal-unit-keys)]
          (keyword inherited-temporal-unit))))
    :was-binned
    (fn [opts]
      (let [binning-keys (cond-> (list :was-binned)
                           lib.metadata.calculation/*propagate-binning-and-bucketing*
                           (conj :binning))]
        (boolean (some opts binning-keys))))
    ;; Preserve additional information that may have been added by QP middleware. Sometimes pre-processing
    ;; middleware needs to add extra info to track things that it did (e.g. the
    ;; [[metabase.query-processor.middleware.add-dimension-projections]] pre-processing middleware adds
    ;; keys to track which Fields it adds or needs to remap, and then the post-processing middleware
    ;; does the actual remapping based on that info)
    :options
    (fn [opts]
      (not-empty (m/filter-keys (fn [k]
                                  (and (qualified-keyword? k)
                                       (not= (namespace k) "lib")
                                       (not (str/starts-with? (namespace k) "metabase.lib"))))
                                opts)))}))

(mu/defn- options-metadata* :- :map
  "Part of [[resolve-field-metadata]] -- calculate metadata based on options map of the field ref itself."
  [[_field opts _id-or-name, :as _field-clause] :- :mbql.clause/field]
  (into {}
        (keep (fn [[k f]]
                (when-some [v (f opts)]
                  [k v])))
        opts-metadata-fns))

(defn- update-ident
  [query
   stage-number
   [_tag {:keys [join-alias] :as _opts}, :as _field-ref]
   metadata]
  (cond-> metadata
    join-alias (update :ident lib.metadata.ident/explicitly-joined-ident
                       (:ident (lib.join/maybe-resolve-join-across-stages query stage-number join-alias)))))

(defn- options-metadata [query stage-number field-ref]
  (->> (options-metadata* field-ref)
       (update-ident query stage-number field-ref)))

(mu/defn- current-stage-model-card-id :- [:maybe ::lib.schema.id/card]
  "If the current stage was from a model, return the ID of the Model Card."
  [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)]
    ;; this key is added by the [[metabase.query-processor.middleware.fetch-source-query]] middleware.
    (when-let [card-id (:qp/stage-is-from-source-card stage)]
      (when-let [card (lib.metadata/card query card-id)]
        (when (= (:type card) :model)
          card-id)))))

(mu/defn- stage->cols :- [:maybe [:sequential {:min 1} ::lib.schema.metadata/column]]
  [stage :- [:maybe ::lib.schema/stage]]
  (not-empty (get-in stage [:lib/stage-metadata :columns])))

(def ^:private previous-stage-propagated-keys
  [:display-name :semantic-type :description :converted-timezone])

;;; TODO (Cam/6/18/25) -- given that we have [[metabase.lib.card/merge-model-metadata]], why is this even necessary at
;;; all?
;;;
;;; TODO (Cam 6/13/25) -- duplicated/overlapping responsibility with [[metabase.lib.card/merge-model-metadata]] as
;;; well as [[metabase.lib.metadata.result-metadata/merge-model-metadata]] -- find a way to deduplicate these
(defn- current-stage-model-metadata
  "Pull in metadata from models if the current stage was from a model."
  [query stage-number id-or-name]
  (when-let [card-id (current-stage-model-card-id query stage-number)]
    ;; if the stage already has attached metadata then use that; otherwise (re-)fetch it from the Model.
    (when-let [cols (or (stage->cols (lib.util/query-stage query stage-number))
                        (not-empty (lib.card/saved-question-metadata query card-id)))]
      (when-let [match (resolve-column-in-metadata id-or-name cols)]
        (u/select-non-nil-keys match previous-stage-propagated-keys)))))

(defn- current-stage-source-card-metadata [query stage-number id-or-name]
  (when-let [card-id (:source-card (lib.util/query-stage query stage-number))]
    (when-let [cols (lib.card/saved-question-metadata query card-id)]
      (resolve-column-in-metadata id-or-name cols))))

(defn- previous-stage-metadata [query stage-number id-or-name]
  (when-let [cols (some-> (lib.util/previous-stage query stage-number) stage->cols)]
    (some-> (resolve-column-in-metadata id-or-name cols)
            (u/select-non-nil-keys previous-stage-propagated-keys))))

(defn- previous-stage-or-source-card-metadata
  "Metadata from the previous stage of the query (if it exists) or from the card associated with this stage of the
  query (the `:source-card` if this is the first stage of the query, or possibly the model ID associated with this
  stage of the query if we're dealing with a preprocessed query where Card stages are spliced in.)

  We want to flow stuff like `:description`, `:display-name`, and `:semantic-type` that can be customized by the user
  in models."
  [query stage-number id-or-name]
  (or
   ;; if the current stage is from a model then get the relevant metadata and do not recurse any further.
   (current-stage-model-metadata query stage-number id-or-name)
   ;; if the current stage has a `:source-card` (i.e., if it is the first stage of the query) then get metadata for
   ;; that card and do not recurse any further.
   (current-stage-source-card-metadata query stage-number id-or-name)
   ;; otherwise recurse thru previous stages trying to find relevant metadata.
   (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
     (let [col (previous-stage-metadata query stage-number id-or-name)
           ;; if we're using a string name e.g. `Categories__NAME` then try to switch it out with one appropriate to
           ;; the stage before it e.g. `NAME` before recursing.
           previous-id-or-name (if (integer? id-or-name)
                                 id-or-name
                                 (or (:lib/source-column-alias col)
                                     id-or-name))
           ;; now recurse and see if we can find any more metadata.
           ;;
           ;; don't look in the previous stage if we know for a fact it was NOT inherited, i.e. it was introduced in
           ;; this stage by an expression or something.
           recursive-col (when (or (not col)
                                   (lib.field.util/inherited-column? col))
                           (previous-stage-or-source-card-metadata query previous-stage-number previous-id-or-name))]
       ;; prefer the metadata we get from recursing since maybe that came from a model or something.
       (merge-non-nil col recursive-col)))))

(declare resolve-field-metadata*)

(mu/defn- resolve-in-join
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (when-let [join-alias (lib.join.util/current-join-alias field-ref)]
    (if-let [join (or (m/find-first #(= (lib.join.util/current-join-alias %) join-alias)
                                    (:joins (lib.util/query-stage query stage-number)))
                      (log/warnf "Field ref %s references join %s, but it does not exist in this stage of the query"
                                 (pr-str field-ref) (pr-str join-alias)))]
      ;; found join at this stage of the query, now resolve within the join.
      (let [fake-join-query (assoc query :stages (:stages join))]
        (when-let [resolved (resolve-field-metadata* fake-join-query -1 (lib.join/with-join-alias field-ref nil))]
          (-> resolved
              (lib.join/with-join-alias join-alias)
              (m/update-existing :lib/original-ref lib.join/with-join-alias join-alias))))
      ;; join does not exist at this stage of the query, try looking in previous stages.
      (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
        (recur query previous-stage-number field-ref)))))

(defn- resolve-field-metadata*
  [query stage-number [_field _opts id-or-name :as field-ref]]
  (or
   ;; resolve metadata IF this is from a join.
   (resolve-in-join query stage-number field-ref)
   ;; not from a join.
   ;;
   ;; resolve the field ID if we can.
   (let [field-id (if (integer? id-or-name)
                    id-or-name
                    (:id (resolve-column-name query stage-number id-or-name)))]
     (merge-non-nil
      {:lib/type         :metadata/column
       :name             (str id-or-name)
       :lib/original-ref field-ref}
      ;; metadata about the field from the metadata provider
      (field-metadata query field-id)
      ;; metadata we want to 'flow' from previous stage(s) / source models of the query (e.g.
      ;; `:semantic-type`)
      (previous-stage-or-source-card-metadata query stage-number (or field-id id-or-name))
      ;; propagate stuff specified in the options map itself. Generally stuff specified here should override stuff
      ;; in upstream metadata from the metadata provider or previous stages/source card/model
      (options-metadata query stage-number field-ref)))))

(mu/defn resolve-field-metadata :- ::lib.schema.metadata/column
  "Resolve metadata for a `:field` ref. This is part of the implementation
  for [[metabase.lib.metadata.calculation/metadata-method]] a `:field` clause."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (as-> (resolve-field-metadata* query stage-number field-ref) $metadata
    (add-parent-column-metadata query $metadata)
    ;; recalculate the display name so we can make sure it includes binning info or temporal unit or whatever.
    (assoc $metadata :display-name (lib.metadata.calculation/display-name query stage-number $metadata))))
