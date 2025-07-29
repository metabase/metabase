(ns metabase.lib.field.resolution
  "Code for resolving field metadata from a field ref. There's a lot of code here, isn't there? This is probably more
  complicated than it needs to be!"
  (:require
   [better-cond.core :as b]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- merge-metadata
  [m & more]
  (not-empty
   (into (or m {})
         (comp cat
               (filter (fn [[_k v]]
                         (some? v))))
         more)))

(mu/defn- add-parent-column-metadata
  "If this is a nested column, add metadata about the parent column."
  [metadata-providerable             :- ::lib.schema.metadata/metadata-providerable
   {:keys [parent-id], :as metadata} :- ::lib.schema.metadata/column]
  (if-not parent-id
    metadata
    (let [parent-metadata                                        (lib.metadata/field metadata-providerable parent-id)
          {parent-name :name, parent-display-name :display-name} (add-parent-column-metadata metadata-providerable parent-metadata)
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
                 :metabase.lib.field/simple-display-name new-display-name)))))

(mu/defn- field-metadata :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  "Metadata about the field from the metadata provider."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   field-id              :- ::lib.schema.id/field]
  (log/debugf "Resolving Field %s from metadata provider" (pr-str field-id))
  (when-some [col (lib.metadata/field metadata-providerable field-id)]
    (-> col
        (assoc :lib/source                :source/table-defaults
               :lib/original-name         (:name col)
               :lib/original-display-name (:display-name col))
        (->> (add-parent-column-metadata metadata-providerable)))))

(mu/defn- column-with-name :- [:maybe ::lib.schema.metadata/column]
  [columns     :- [:sequential ::lib.schema.metadata/column]
   column-name :- :string]
  ;; look for a match with the same `desired-column-alias`; if that fails, look for a match with using
  ;; legacy `deduplicated-name`
  (some (fn [k]
          (m/find-first #(= (k %) column-name)
                        columns))
        [:lib/desired-column-alias
         :lib/deduplicated-name]))

(mu/defn- resolve-in-metadata :- [:maybe ::lib.schema.metadata/column]
  "Find the matching column metadata in `cols` for `id-or-name`."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   cols                  :- [:sequential ::lib.schema.metadata/column]
   id-or-name            :- [:or :string ::lib.schema.id/field]]
  (letfn [(resolve* [id-or-name]
            (if (string? id-or-name)
              (column-with-name cols id-or-name)
              ;; `id-or-name` is an ID
              (or (m/find-first #(= (:id %) id-or-name) cols)
                  (do
                    (log/debug (u/format-color :red "Failed to find column in metadata with ID %s" (pr-str id-or-name)))
                    (when-some [field (lib.metadata/field metadata-providerable id-or-name)]
                      (log/debugf "Looking for match in metadata with name %s" (pr-str (:name field)))
                      (when-some [col (resolve* (:name field))]
                        ;; don't return a match that is definitely for a different column (has an ID, but it's for a
                        ;; different column)
                        (when (or (not (:id col))
                                  (= (:id col) id-or-name))
                          col)))))))]
    (u/prog1 (resolve* id-or-name)
      (if <>
        (log/debugf "Found match\n%s"
                    (pr-str (select-keys <> [:id :lib/desired-column-alias :lib/deduplicated-name])))
        (log/debug (u/format-color :red
                                   "Failed to find match. Found:\n%s"
                                   (u/pprint-to-str (map #(select-keys % [:id :lib/desired-column-alias :lib/deduplicated-name])
                                                         cols))))))))

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

    key-in-opts => key-in-col-metadata

  `:join-alias` is not automatically propagated from opts because it may or may not be correct... [[resolve-in-join]]
  will include the join alias in result metadata if appropriate."
  {:lib/uuid                :lib/source-uuid
   :binning                 :metabase.lib.field/binning
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
  "Part of [[resolve-field-ref]] -- calculate metadata based on options map of the field ref itself."
  [opts :- ::lib.schema.ref/field.options]
  (into {}
        (keep (fn [[k f]]
                (when-some [v (f opts)]
                  [k v])))
        opts-metadata-fns))

(def ^:private model-propagated-keys
  #{:lib/card-id
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

(defn- model-metadata [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)]
    (when-some [card-id (:qp/stage-is-from-source-card stage)]
      (when-some [card (lib.metadata/card query card-id)]
        (when (= (:type card) :model)
          (for [col (lib.metadata.calculation/returned-columns query card)]
            (assoc col :lib/source :source/card, :lib/card-id card-id)))))))

(mu/defn- resolve-in-join :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.join/alias
   id-or-name   :- [:or :string ::lib.schema.id/field]]
  (log/debugf "Resolving %s (join alias = %s) in joins in stage %s" (pr-str id-or-name) (pr-str join-alias) (pr-str stage-number))
  ;; find the matching join.
  (let [stage (lib.util/query-stage query stage-number)]
    (if-some [join (m/find-first #(= (:alias %) join-alias)
                                 (:joins stage))]
      ;; found matching join at this stage
      (do
        (log/debugf "Resolving %s in join %s in stage %s"
                    (pr-str id-or-name)
                    (pr-str join-alias)
                    (pr-str stage-number))
        (let [join-cols (lib.metadata.calculation/returned-columns query stage-number join)]
          (when-let [col (resolve-in-metadata query join-cols id-or-name)]
            (-> (merge
                 ;; run this thru `update-keys-for-col-from-previous-stage` so things like binning or bucketing in the
                 ;; last stage of the join don't get propagated incorrectly. Don't update source or desired aliases
                 ;; tho since those should already be calculated correctly and running thru
                 ;; `lib.field.util/update-keys-for-col-from-previous-stage` will mess them up.
                 (-> (lib.field.util/update-keys-for-col-from-previous-stage col)
                     (dissoc :lib/source-column-alias :lib/desired-column-alias))
                 (select-keys col [:lib/source-column-alias :lib/desired-column-alias]))
                ;; now make sure join alias and what not is still set correctly for a column coming directly from a join
                (as-> $col (lib.join/column-from-join query stage-number $col join-alias))))))
      ;; a join with this alias does not exist at this stage of the query... try looking recursively in previous stage(s)
      (do
        (log/debugf "Join %s does not exist in stage %s, looking in previous stages"
                    (pr-str join-alias)
                    (pr-str stage-number))
        (if-some [previous-stage-number (lib.util/previous-stage-number query stage-number)]
          (when-some [col (resolve-in-join query previous-stage-number join-alias id-or-name)]
            (-> col
                lib.field.util/update-keys-for-col-from-previous-stage
                (assoc :lib/source :source/previous-stage)))
          (do
            (log/debug "No more previous stages =(")
            nil))))))

(mu/defn- resolve-in-previous-stage :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  [query                 :- ::lib.schema/query
   previous-stage-number :- :int
   id-or-name            :- [:or :string ::lib.schema.id/field]]
  (log/debugf "Resolving %s in previous stage returned columns" (pr-str id-or-name))
  (when-some [previous-stage-columns (lib.metadata.calculation/returned-columns query previous-stage-number)]
    (log/tracef "Previous stage columns: %s" (pr-str (map (juxt :id :lib/desired-column-alias) previous-stage-columns)))
    (when-some [col (resolve-in-metadata query previous-stage-columns id-or-name)]
      (-> col
          lib.field.util/update-keys-for-col-from-previous-stage
          (assoc :lib/source :source/previous-stage)))))

(mu/defn- resolve-in-card-returned-columns :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  [query          :- ::lib.schema/query
   source-card-id :- ::lib.schema.id/card
   id-or-name     :- [:or :string ::lib.schema.id/field]]
  (log/debugf "Resolving %s in source Card %s metadata" (pr-str id-or-name) (pr-str source-card-id))
  (when-some [card (lib.metadata/card query source-card-id)]
    ;; card returned columns should be the same regardless of which stage number we pass in, so always use zero so we
    ;; can hit the cache more often
    (let [card-metadata-columns (lib.metadata.calculation/returned-columns query card)]
      (when-some [col (resolve-in-metadata query card-metadata-columns id-or-name)]
        (-> col
            lib.field.util/update-keys-for-col-from-previous-stage
            (assoc :lib/source :source/card, :lib/card-id source-card-id))))))

(mu/defn- resolve-in-card-or-stage-metadata :- [:maybe ::lib.metadata.calculation/column-metadata-with-source]
  [query        :- ::lib.schema/query
   stage-number :- :int
   id-or-name   :- [:or :string ::lib.schema.id/field]]
  (let [{source-card-id :source-card, :as stage} (lib.util/query-stage query stage-number)]
    ;; This must be the first stage. See if this stage has a `:source-card`; if so, look at its columns.
    (if source-card-id
      (resolve-in-card-returned-columns query source-card-id id-or-name)
      ;; otherwise look in `:lib/stage-metadata` -- this will be the only way we can resolve things for native stages.
      (do
        (log/debugf "Resolving %s in stage metadata" (pr-str id-or-name))
        (if-some [stage-metadata-columns (not-empty (get-in stage [:lib/stage-metadata :columns]))]
          (let [stage-metadata-columns (lib.field.util/add-deduplicated-names stage-metadata-columns)]
            (resolve-in-metadata query stage-metadata-columns id-or-name))
          (do
            (log/debug "stage has no attached metadata")
            nil))))))

(defn- fallback-metadata [id-or-name]
  (log/debug (u/colorize :red "Returning fallback metadata"))
  (merge
   {:lib/type            :metadata/column
    ;; guess that the column came from the previous stage
    :lib/source          :source/previous-stage
    :base-type           :type/*
    ::fallback-metadata? true}
   (if (pos-int? id-or-name)
     {:id           id-or-name
      :name         "Unknown Field"
      :display-name "Unknown Field"}
     {:name id-or-name})))

(defn- resolve-from-previous-stage-or-source* [query stage-number id-or-name]
  (b/cond
    :let [stage (lib.util/query-stage query stage-number)]
    (and (pos-int? id-or-name)
         (:source-table stage))
    (when-let [col (field-metadata query id-or-name)]
      ;; don't return this field if it's not actually from the source table. We want some of the fallback
      ;; resolution pathways to figure out what join this came from.
      (when (= (:table-id col) (:source-table stage))
        col))

    (= (:lib/type stage) :mbql.stage/native)
    (do
      (log/debugf "Resolving %s in native stage metadata" (pr-str id-or-name))
      (when-some [cols (get-in stage [:lib/stage-metadata :columns])]
        (let [cols (lib.field.util/add-deduplicated-names cols)]
          (when-some [col (resolve-in-metadata query cols id-or-name)]
            (assoc col :lib/source :source/native)))))

    (:source-card stage)
    (when-some [col (resolve-in-card-or-stage-metadata query stage-number id-or-name)]
      (assoc col :lib/source :source/card))

    (lib.util/previous-stage-number query stage-number)
    (resolve-in-previous-stage query (lib.util/previous-stage-number query stage-number) id-or-name)))

(defn- resolve-ref-missing-join-alias
  "Try finding a match in joins (field ref is missing `:join-alias`)."
  [query stage-number id-or-name]
  (log/info (u/format-color :red "Failed to resolve %s in stage %s" (pr-str id-or-name) (pr-str stage-number)))
  (or (when (string? id-or-name)
        (let [parts (str/split id-or-name #"__")]
          (when (>= (count parts) 2)
            (let [join-alias (first parts)
                  field-name (str/join "__" (rest parts))]
              (log/debugf "Split field name into join alias %s and field name %s" (pr-str join-alias) (pr-str field-name))
              (resolve-in-join query stage-number join-alias field-name)))))
      (some (fn [join]
              (log/debugf "Looking for match in join %s" (pr-str (:alias join)))
              (resolve-in-join query stage-number (:alias join) id-or-name))
            (:joins (lib.util/query-stage query stage-number)))
      (do
        (log/debug (u/format-color :red "Failed to find a match in one of the query's joins in stage %s" (pr-str stage-number)))
        nil)))

(mu/defn- resolve-from-previous-stage-or-source :- ::lib.metadata.calculation/column-metadata-with-source
  [query        :- ::lib.schema/query
   stage-number :- :int
   id-or-name   :- [:or :string ::lib.schema.id/field]]
  (log/debugf "Resolving %s from previous stage, source table, or source card" (pr-str id-or-name))
  (merge-metadata
   (or (resolve-from-previous-stage-or-source* query stage-number id-or-name)
       (resolve-ref-missing-join-alias query stage-number id-or-name)
       ;; if we haven't found a match yet try getting metadata from the metadata provider if this is a Field ID ref.
       ;; It's likely a ref that makes little or no sense (e.g. wrong table) but we can let QP code worry about that.
       (when (pos-int? id-or-name)
         (when-some [col (field-metadata query id-or-name)]
           (assoc col ::fallback-metadata? true)))
       ;; if we STILL can't find a match, return made-up fallback metadata.
       (fallback-metadata id-or-name))
   (when-let [model-cols (not-empty (model-metadata query stage-number))]
     (when-some [col (resolve-in-metadata query model-cols id-or-name)]
       (-> col
           lib.field.util/update-keys-for-col-from-previous-stage
           (select-keys model-propagated-keys))))))

(mu/defn resolve-field-ref :- ::lib.metadata.calculation/column-metadata-with-source
  "Resolve metadata for a `:field` ref. This is part of the implementation
  for [[metabase.lib.metadata.calculation/metadata-method]] a `:field` clause."
  [query                                                           :- ::lib.schema/query
   stage-number                                                    :- :int
   [_tag {:keys [join-alias], :as opts} id-or-name, :as field-ref] :- :mbql.clause/field]
  ;; this is just for easier debugging
  (let [stage-number (lib.util/canonical-stage-index query stage-number)]
    (log/debugf "Resolving %s in stage %s" (pr-str id-or-name) (pr-str stage-number))
    (-> (merge-metadata
         {:lib/type :metadata/column}
         (or (if join-alias
               (resolve-in-join query stage-number join-alias id-or-name)
               (resolve-from-previous-stage-or-source query stage-number id-or-name))
             (merge
              (fallback-metadata id-or-name)
              (when join-alias
                {:metabase.lib.join/join-alias join-alias})))
         (options-metadata opts)
         {:lib/original-ref field-ref})
        (as-> $col (assoc $col :display-name (lib.metadata.calculation/display-name query stage-number $col))))))

;;;
;;; Helper functions for other namespaces
;;;

(mu/defn resolve-column-in-metadata :- [:maybe ::lib.schema.metadata/column]
  "Find the matching column metadata in `cols` for `field-ref`.

  TODO (Cam 7/28/25) -- We should probably prefer [[lib.equality/find-matching-column]] directly instead; if this
  function does something that [[lib.equality]] doesn't, we should fix the code in `lib.equality` instead of having
  our own bespoke way of finding matching columns here."
  [metadata-providerable                   :- ::lib.schema.metadata/metadata-providerable
   [_tag _opts id-or-name, :as _field-ref] :- :mbql.clause/field
   cols                                    :- [:sequential ::lib.schema.metadata/column]]
  (resolve-in-metadata metadata-providerable cols id-or-name))
