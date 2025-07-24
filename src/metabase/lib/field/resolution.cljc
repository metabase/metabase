(ns metabase.lib.field.resolution
  "Code for resolving field metadata from a field ref. There's a lot of code here, isn't there? This is probably more
  complicated than it needs to be!"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:dynamic ^:private *debug* false)

(mr/def ::map-with-source
  [:and
   [:map
    [:lib/source ::lib.schema.metadata/column.source]]
   [:fn
    {:error/message "map with debugging output"}
    (fn [m]
      (or (not *debug*)
          (::debug.origin m)))]])

(defn- merge-metadata
  [m & more]
  (some-> (not-empty
           (into (or m {})
                 (comp cat
                       (filter (fn [[_k v]]
                                 (some? v))))
                 more))
          ;; merge the `::debug.origin` keys together.
          (cond-> *debug* (m/assoc-some ::debug.origin (when-some [origins (not-empty (keep ::debug.origin (cons m more)))]
                                                         (if (= (count origins) 1)
                                                           (first origins)
                                                           (list (cons 'merge-metadata origins))))))))

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
      (-> metadata
          (assoc :name                                   new-name
                 :display-name                           new-display-name
                 ;; this is used by the `display-name-method` for `:metadata/column` in [[metabase.lib.field]]
                 :metabase.lib.field/simple-display-name new-display-name)
          (cond-> *debug* (update ::debug.origin conj (list 'add-parent-column-metadata parent-id)))))))

(defn- field-metadata
  "Metadata about the field from the metadata provider."
  [query field-id]
  (when field-id
    (when-some [col (lib.metadata/field query field-id)]
      (-> col
          (assoc :lib/source                :source/table-defaults
                 :lib/original-name         (:name col)
                 :lib/original-display-name (:display-name col))
          (cond-> *debug* (update ::debug.origin conj (list 'field-metadata field-id)))
          (->> (add-parent-column-metadata query))))))

;;; TODO (Cam 6/19/25) -- in some cases [[lib.equality/find-matching-column]] fails to find a match where to (old)
;;; match-on-name and match-on-id code had no problem finding one. We should really go fix the logic
;;; in [[lib.equality/find-matching-column]], but until I get around to that I'm keeping the old stuff around as a
;;; fallback using the `fallback-match-` prefix.

(def ^:private ^:dynamic *recursive-column-resolution-depth*
  "Whether we're in a recursive call to [[resolve-column-name]] or not. Prevent infinite recursion (#32063)"
  0)

(mu/defn- fallback-match-field-name :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  "Find the column with `column-name` in a sequence of `column-metadatas`."
  [column-name :- ::lib.schema.common/non-blank-string
   cols        :- [:sequential ::lib.schema.metadata/column]]
  (let [resolution-keys [:lib/source-column-alias :lib/deduplicated-name :lib/desired-column-alias :name :lib/original-name]]
    (or (some (fn [k]
                (some-> (m/find-first #(= (get % k) column-name)
                                      cols)
                        (cond-> *debug* (update ::debug.origin (fn [origin]
                                                                 (list (list 'resolve-column-name-in-metadata column-name :key k :=> origin)))))))
              resolution-keys)
        (when (zero? *recursive-column-resolution-depth*)
          ;; ideally we shouldn't hit this but if we do it's not the end of the world.
          (log/infof "Couldn't resolve column name %s."
                     (pr-str column-name))
          (log/debugf "Found:\n%s"
                      (u/pprint-to-str (mapv #(select-keys % (list* :lib/source
                                                                    :metabase.lib.join/join-alias
                                                                    :lib/original-join-alias
                                                                    :source-alias
                                                                    :source_alias
                                                                    ::debug.origin
                                                                    resolution-keys))
                                             cols)))
          nil))))

(defn- fallback-match-field-id [field-id cols]
  (some-> (when-some [matching-cols (not-empty (filter #(= (:id %) field-id) cols))]
            (when (> (count matching-cols) 1)
              ;; TODO (Cam 6/19/25) -- almost certainly a bug! We probably need to propagate options to properly
              ;; deduplicate stuff. Or just use lib.equality for this since it has code to find the right match
              (log/warnf "TODO: multiple matching columns for Field ID %d, we need to deduplicate them using join alias/temporal unit/binning!!\n%s"
                         field-id
                         (u/pprint-to-str matching-cols)))
            (first matching-cols))
          (cond-> *debug* (update ::debug.origin (fn [origin]
                                                   (list (list 'resolve-column-id-in-metadata field-id :=> origin)))))))

(defn- fallback-match [metadata-providerable [_field _opts id-or-name, :as _field-ref] cols]
  (cond
    (and (int? id-or-name)
         (every? :id cols))
    (fallback-match-field-id id-or-name cols)

    (int? id-or-name)
    (let [field-name (:name (lib.metadata/field metadata-providerable id-or-name))]
      (fallback-match-field-name field-name cols))

    :else
    (fallback-match-field-name id-or-name cols)))

;;; TODO (Cam 7/1/25) -- this is 'stepping on the toes' of [[lib.equality]] and we should fix it up so it works as we
;;; expect rather than us needing this separate competing match function.
(mu/defn resolve-column-in-metadata :- [:maybe ::map-with-source]
  "Find the matching column metadata in `cols` for a `field-ref`."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   field-ref             :- :mbql.clause/field
   cols                  :- [:maybe [:sequential ::map-with-source]]]
  (some-> (or (lib.equality/find-matching-column field-ref cols)
              (lib.equality/find-matching-column field-ref cols {:generous? true})
              (fallback-match metadata-providerable field-ref cols))
          (cond-> *debug* (update ::debug.origin (fn [origin]
                                                   (list (list 'resolve-column-in-metadata field-ref :=> origin)))))))

(mu/defn- resolve-column-name :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  "String column name: get metadata from the previous stage, if it exists, otherwise if this is the first stage and we
  have a native query or a Saved Question source query or whatever get it from our results metadata."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (when (< *recursive-column-resolution-depth* 2)
    (binding [*recursive-column-resolution-depth* (inc *recursive-column-resolution-depth*)]
      (when-let [visible-columns (not-empty (lib.metadata.calculation/visible-columns query stage-number))]
        (resolve-column-in-metadata query field-ref visible-columns)))))

(def ^:private opts-propagated-keys
  "Keys to copy non-nil values directly from `:field` opts into column metadata."
  #{:base-type
    :effective-type
    :display-name
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
   :temporal-unit           :metabase.lib.field/temporal-unit
   ;; display-name gets copied to both display-name and lib/ref-display-name
   :display-name            :lib/ref-display-name})

(defn- opts-fn-inherited-temporal-unit
  "`:inherited-temporal-unit` is transfered from `:temporal-unit` ref option only when
  the [[lib.metadata.calculation/*propagate-binning-and-bucketing*]] is truthy, i.e. bound.

  TODO (Cam 6/18/25) -- that DOES NOT seem to be how it actually works. (Other documentation here was not mine.)

  Intent is to pass it from ref to column only during [[returned-columns]] call. Otherwise e.g. [[orderable-columns]]
  would contain that too. That could be problematic, because original ref that contained `:temporal-unit` contains no
  `:inherited-temporal-unit`. If the column like this was used to generate ref for eg. order by it would contain the
  `:inherited-temporal-unit`, while the original column (eg. in breakout) would not."
  [opts]
  (let [inherited-temporal-unit-keys (cond-> '(:inherited-temporal-unit)
                                       lib.metadata.calculation/*propagate-binning-and-bucketing*
                                       (conj :temporal-unit))]
    (when-some [inherited-temporal-unit (some opts inherited-temporal-unit-keys)]
      (keyword inherited-temporal-unit))))

(defn- opts-fn-original-binning [opts]
  (let [binning-keys (cond-> (list :lib/original-binning)
                       lib.metadata.calculation/*propagate-binning-and-bucketing*
                       (conj :binning))]
    (some opts binning-keys)))

(defn- opts-fn-options
  "Preserve additional information that may have been added by QP middleware. Sometimes pre-processing middleware needs
  to add extra info to track things that it did (e.g.
  the [[metabase.query-processor.middleware.add-remaps]] pre-processing middleware adds keys to track
  which Fields it adds or needs to remap, and then the post-processing middleware does the actual remapping based on
  that info)."
  [opts]
  (not-empty (m/filter-keys (fn [k]
                              (and (qualified-keyword? k)
                                   (not= (namespace k) "lib")
                                   (not (str/starts-with? (namespace k) "metabase.lib"))))
                            opts)))

(def ^:private opts-metadata-fns
  "Map of

    key-in-col-metadata => f

  Where `f` is of the form

    (f opts) => value

  If `f` returns a non-nil value, then it is included under `key-in-col-metadata`."
  (merge
   (u/index-by identity opts-propagated-keys)
   (set/map-invert opts-propagated-renamed-keys)
   {:inherited-temporal-unit opts-fn-inherited-temporal-unit
    :lib/original-binning    opts-fn-original-binning
    :options                 opts-fn-options}))

(mu/defn- options-metadata :- :map
  "Part of [[resolve-field-metadata]] -- calculate metadata based on options map of the field ref itself."
  [[_field opts _id-or-name, :as _field-clause] :- :mbql.clause/field]
  (into (if *debug*
          {::debug.origin (list (list 'options-metadata opts))}
          {})
        (keep (fn [[k f]]
                (when-some [v (f opts)]
                  [k v])))
        opts-metadata-fns))

(mu/defn- current-stage-model-card-id :- [:maybe ::lib.schema.id/card]
  "If the current stage was from a model, return the ID of the Model Card."
  [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)]
    ;; this key is added by the [[metabase.query-processor.middleware.fetch-source-query]] middleware.
    (when-some [card-id (:qp/stage-is-from-source-card stage)]
      (when-some [card (lib.metadata/card query card-id)]
        (when (= (:type card) :model)
          card-id)))))

(mu/defn- stage-attached-metadata :- [:maybe [:sequential {:min 1} ::lib.schema.metadata/column]]
  [stage :- [:maybe ::lib.schema/stage]]
  (not-empty
   (for [col (get-in stage [:lib/stage-metadata :columns])]
     (-> col
         (cond-> *debug* (update ::debug.origin conj '(stage-attached-metadata)))))))

(def ^:private previous-stage-propagated-keys
  #{::debug.origin
    :lib/model-display-name
    :lib/original-display-name
    :lib/original-expression-name
    :lib/original-fk-field-id
    :lib/original-fk-field-name
    :lib/original-fk-join-alias
    :lib/original-join-alias
    :lib/original-name
    :lib/type
    :base-type
    :converted-timezone
    :description
    :display-name
    :fingerprint
    :id
    :semantic-type
    :table-id
    :visibility-type})

(defn- saved-question-metadata [query card-id]
  (not-empty
   (for [col (lib.card/saved-question-metadata query card-id)]
     (cond-> col
       *debug* (update ::debug.origin conj (list 'saved-question-metadata card-id))))))

;;; TODO (Cam/6/18/25) -- given that we have [[metabase.lib.card/merge-model-metadata]], why is this even necessary at
;;; all?
;;;
;;; TODO (Cam 6/13/25) -- duplicated/overlapping responsibility with [[metabase.lib.card/merge-model-metadata]] as
;;; well as [[metabase.lib.metadata.result-metadata/merge-model-metadata]] -- find a way to deduplicate these
(mu/defn- current-stage-model-metadata :- [:maybe ::map-with-source]
  "Pull in metadata from models if the current stage was from a model."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (when-some [card-id (current-stage-model-card-id query stage-number)]
    ;; prefer using card metadata if we can get it from the metadata provider; otherwise fall back to metadata
    ;; attached to the stage.
    (when-some [col (or (when-some [card-cols (saved-question-metadata query card-id)]
                          (resolve-column-in-metadata query field-ref card-cols))
                        (let [stage (lib.util/query-stage query stage-number)]
                          (when-some [stage-cols (stage-attached-metadata stage)]
                            ;; make sure `:lib/source` is set to SOMETHING or we will have a really bad time.
                            (let [stage-cols (for [col stage-cols]
                                               (u/assoc-default col :lib/source (case (:lib/type stage)
                                                                                  :mbql.stage/native :source/native
                                                                                  :mbql.stage/mbql   :source/previous-stage)))]
                              (resolve-column-in-metadata query field-ref stage-cols)))))]
      (-> col
          (u/select-non-nil-keys previous-stage-propagated-keys)
          ;; TODO (Cam 6/19/25) -- pretty sure we should be calling `update-keys-for-col-from-previous-stage` here.
          (assoc :lib/source  :source/card
                 :lib/card-id card-id)
          (cond-> *debug* (update ::debug.origin conj (list 'current-stage-model-metadata stage-number field-ref)))))))

(mu/defn- current-stage-source-card-metadata :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (when-some [card-id (:source-card (lib.util/query-stage query stage-number))]
    (when-some [cols (saved-question-metadata query card-id)]
      (when-some [col (resolve-column-in-metadata query field-ref cols)]
        (-> col
            lib.field.util/update-keys-for-col-from-previous-stage
            (assoc :lib/source :source/card)
            (cond-> *debug* (update ::debug.origin conj (list 'current-stage-source-card-metadata stage-number field-ref :card-id card-id))))))))

(mu/defn- previous-stage-metadata :- [:maybe ::map-with-source]
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (when-some [cols (some-> (lib.util/previous-stage query stage-number) stage-attached-metadata)]
    (let [cols (for [col cols]
                 ;; HACK TODO (Cam 7/7/25) -- some of the functions called by [[resolve-column-in-metadata]] fail if
                 ;; `col` doesn't have `:lib/source` for whatever reason; we probably SHOULD go fix that stuff but
                 ;; until then just hacc this to make this work. `:source/card` seems to be the least fussy source --
                 ;; some of the other ones trigger validation like "no `:lib/expression-name` for columns from
                 ;; `:source/previous-stage`" or "no join alias for columns from `:source/native`"
                 (u/assoc-default col :lib/source :source/card))]
      (when-some [col (resolve-column-in-metadata query field-ref cols)]
        (-> col
            (u/select-non-nil-keys previous-stage-propagated-keys)
            lib.field.util/update-keys-for-col-from-previous-stage
            (assoc :lib/source :source/previous-stage)
            (cond-> *debug* (update ::debug.origin conj (list 'previous-stage-metadata stage-number field-ref))))))))

(mu/defn- previous-stage-or-source-card-metadata :- [:maybe ::map-with-source]
  "Metadata from the previous stage of the query (if it exists) or from the card associated with this stage of the
  query (the `:source-card` if this is the first stage of the query, or possibly the model ID associated with this
  stage of the query if we're dealing with a preprocessed query where Card stages are spliced in.)

  We want to flow stuff like `:description`, `:display-name`, and `:semantic-type` that can be customized by the user
  in models."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (some-> (or
           ;; if the current stage is from a model then get the relevant metadata and do not recurse any further.
           (current-stage-model-metadata query stage-number field-ref)
           ;; if the current stage has a `:source-card` (i.e., if it is the first stage of the query) then get
           ;; metadata for that card and do not recurse any further.
           (current-stage-source-card-metadata query stage-number field-ref)
           ;;
           ;; TODO (Cam 6/19/25) -- what if the current stage is a NATIVE query?
           ;;
           ;; otherwise recurse thru previous stages trying to find relevant metadata.
           (when-some [previous-stage-number (lib.util/previous-stage-number query stage-number)]
             (let [col                 (previous-stage-metadata query stage-number field-ref)
                   ;; if we're using a string name e.g. `Categories__NAME` then try to switch it out with one
                   ;; appropriate to the stage before it e.g. `NAME` before recursing.
                   previous-stage-ref (lib.util.match/match-one field-ref
                                        [:field _opts (_id :guard pos-int?)]
                                        &match

                                        [:field opts (field-name :guard string?)]
                                        [:field opts (or (:lib/source-column-alias col)
                                                         field-name)])
                   ;; now recurse and see if we can find any more metadata.
                   ;;
                   ;; don't look in the previous stage if we know for a fact it was NOT inherited, i.e. it was
                   ;; introduced in this stage by an expression or something.
                   recursive-col       (when (or (not col)
                                                 (lib.field.util/inherited-column? col))
                                         (previous-stage-or-source-card-metadata query previous-stage-number previous-stage-ref))]
               ;; prefer the metadata we get from recursing since maybe that came from a model or something.
               (merge-metadata col recursive-col))))
          (cond-> *debug* (update ::debug.origin conj (list 'previous-stage-or-source-card-metadata stage-number field-ref)))))

(declare resolve-field-ref*)

(mu/defn- resolve-in-join :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (some-> (when-some [join-alias (lib.join.util/current-join-alias field-ref)]
            (if-some [join (or (m/find-first #(= (lib.join.util/current-join-alias %) join-alias)
                                             (:joins (lib.util/query-stage query stage-number)))
                               (log/warnf "Field ref %s references join %s, but it does not exist in this stage of the query"
                                          (pr-str field-ref) (pr-str join-alias)))]
              ;; found join at this stage of the query, now resolve within the join.
              (let [fake-join-query (assoc query :stages (:stages join))]
                (when-some [resolved (resolve-field-ref* fake-join-query -1 (lib.join/with-join-alias field-ref nil))]
                  (-> resolved
                      (assoc :lib/original-join-alias join-alias)
                      (lib.join/with-join-alias join-alias)
                      (m/update-existing :lib/original-ref lib.join/with-join-alias join-alias))))
              ;; join does not exist at this stage of the query, try looking in previous stages.
              (when-some [previous-stage-number (lib.util/previous-stage-number query stage-number)]
                (resolve-in-join query previous-stage-number field-ref))))
          (cond-> *debug* (update ::debug.origin conj (list 'resolve-in-join stage-number field-ref)))))

(defn- resolve-field-ref*
  [query stage-number [_field _opts id-or-name :as field-ref]]
  (or
   ;; resolve metadata IF this is from a join.
   (resolve-in-join query stage-number field-ref)
   ;; not from a join.
   ;;
   ;; resolve the field ID if we can.
   (let [resolved-for-name (when (string? id-or-name)
                             (or (resolve-column-name query stage-number field-ref)
                                 ;; if we can't resolve the column with this name we probably won't be able to
                                 ;; calculate much metadata -- assume it comes from the previous stage so we at least
                                 ;; have a value for `:lib/source`.
                                 (when (zero? *recursive-column-resolution-depth*)
                                   (log/warnf "Failed to resolve field ref with name %s in stage %d" (pr-str id-or-name) stage-number))
                                 {:lib/source :source/previous-stage}))
         field-id          (if (integer? id-or-name)
                             id-or-name
                             (:id resolved-for-name))]
     (-> (merge-metadata
          {:lib/type :metadata/column
           :name     (if (integer? id-or-name)
                       ;; ultimately ends up as the display name if we aren't able to resolve anything better.
                       "Unknown Field"
                       id-or-name)}
          ;; metadata about the field from the metadata provider
          (field-metadata query field-id)
          ;; metadata resolved when we have a field literal (name) ref
          resolved-for-name
          ;; metadata we want to 'flow' from previous stage(s) / source models of the query (e.g.
          ;; `:semantic-type`)
          (previous-stage-or-source-card-metadata query stage-number field-ref)
          ;; propagate stuff specified in the options map itself. Generally stuff specified here should override stuff
          ;; in upstream metadata from the metadata provider or previous stages/source card/model
          (options-metadata field-ref))
         (cond-> *debug* (update ::debug.origin conj (list 'resolve-field-ref* stage-number field-ref)))))))

(mu/defn resolve-field-ref :- ::lib.metadata.calculation/column-metadata-with-source
  "Resolve metadata for a `:field` ref. This is part of the implementation
  for [[metabase.lib.metadata.calculation/metadata-method]] a `:field` clause."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (let [stage-number (lib.util/canonical-stage-index query stage-number)] ; this is just to make debugging easier
    (as-> (resolve-field-ref* query stage-number field-ref) $metadata
      ;; keep the original ref around, we need it to construct the world's most busted broken legacy refs
      ;; in [[metabase.lib.metadata/result-metadata]].
      (assoc $metadata :lib/original-ref field-ref)
      ;; update the effective type if needed now that we have merged metadata from all relevant sources
      (assoc $metadata :effective-type (if (or (not (:effective-type $metadata))
                                               (= (:effective-type $metadata) :type/*))
                                         (:base-type $metadata)
                                         (:effective-type $metadata)))
      ;; recalculate the display name so we can make sure it includes binning info or temporal unit or whatever.
      (assoc $metadata :display-name (lib.metadata.calculation/display-name query stage-number $metadata)))))
