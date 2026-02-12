(ns metabase.lib.field.resolution
  "Code for resolving field metadata from a field ref. There's a lot of code here, isn't there? This is probably more
  complicated than it needs to be!"
  (:refer-clojure :exclude [not-empty some select-keys get-in #?(:clj empty?)])
  (:require
   #?@(:clj
       ([metabase.config.core :as config]))
   [better-cond.core :as b]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [not-empty some select-keys get-in #?(:clj empty?)]]))

(mr/def ::id-or-name
  [:or :string ::lib.schema.id/field])

(defn- merge-metadata [maps]
  (not-empty
   ;; Intentionally using 2-arity clojure.core/reduce here because we want the behavior of taking the first map from
   ;; the list as the accumulator and adding values from subsequent maps onto it.
   #_{:clj-kondo/ignore [:reduce-without-init]}
   (reduce #(reduce-kv (fn [acc k v]
                         (cond-> acc (some? v) (assoc k v)))
                       %1 %2)
           maps)))

(mu/defn- add-parent-column-metadata
  "If this is a nested column, add metadata about the parent column."
  [metadata-providerable             :- ::lib.schema.metadata/metadata-providerable
   {:keys [parent-id], :as metadata} :- ::lib.schema.metadata/column]
  (if-not parent-id
    metadata
    (let [parent-metadata                     (lib.metadata/field metadata-providerable parent-id)
          {parent-name         :name
           parent-nfc-path     :nfc-path
           parent-display-name :display-name} (add-parent-column-metadata metadata-providerable parent-metadata)
          new-name                            (str parent-name
                                                   \.
                                                   ((some-fn :lib/original-name :name) metadata))
          new-display-name                    (str parent-display-name
                                                   ": "
                                                   ((some-fn :lib/original-display-name :display-name)
                                                    metadata))]
      (-> metadata
          (assoc :name                                   new-name
                 :nfc-path                               (conj (vec parent-nfc-path) (:name parent-metadata))
                 :display-name                           new-display-name
                 ;; this is used by the `display-name-method` for `:metadata/column` in [[metabase.lib.field]]
                 :metabase.lib.field/simple-display-name new-display-name)))))

(mu/defn- field-metadata :- [:maybe ::lib.metadata.calculation/visible-column]
  "Metadata about the field from the metadata provider."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   table-id              :- [:maybe ::lib.schema.id/table]
   id-or-name            :- ::id-or-name]
  (log/debugf "Resolving Field %s from metadata provider" (pr-str id-or-name))
  (when-some [col (cond
                    (pos-int? id-or-name)
                    (lib.metadata/field metadata-providerable id-or-name)

                    (and (string? id-or-name)
                         (pos-int? table-id))
                    (first (lib.metadata.protocols/metadatas
                            (lib.metadata/->metadata-provider metadata-providerable)
                            {:lib/type :metadata/column, :table-id table-id, :name #{id-or-name}})))]
    (-> col
        (assoc :lib/source                :source/table-defaults
               :lib/source-column-alias   (:name col)
               :lib/original-name         (:name col)
               :lib/original-display-name (:display-name col))
        (->> (add-parent-column-metadata metadata-providerable)))))

(mu/defn- column-with-name-in-previous-stage-returned-columns :- [:maybe ::lib.schema.metadata/column]
  [previous-stage-cols :- ::lib.metadata.calculation/returned-columns
   column-name         :- :string]
  ;; look for a match with the same `desired-colum-alias`; if that fails, look for a match with using
  ;; legacy `deduplicated-name`
  (some (fn [k]
          (m/find-first #(= (k %) column-name)
                        previous-stage-cols))
        [:lib/desired-column-alias
         :lib/deduplicated-name]))

(mu/defn- resolve-in-previous-stage-returned-columns-without-updating-keys :- [:maybe ::lib.metadata.calculation/returned-column]
  "Find the matching column metadata in `cols` for `id-or-name`.

  This metadata should be relative to the previous stage, or join, or whatever!!!! It should not be relative to the
  current stage."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   previous-stage-cols   :- [:maybe ::lib.metadata.calculation/returned-columns]
   id-or-name            :- ::id-or-name]
  (letfn [(resolve* [id-or-name]
            (if (string? id-or-name)
              (column-with-name-in-previous-stage-returned-columns previous-stage-cols id-or-name)
              ;; `id-or-name` is an ID
              (or (m/find-first #(= (:id %) id-or-name) previous-stage-cols)
                  (do
                    (log/debugf "Failed to find column in metadata with ID %s" (pr-str id-or-name))
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
        (log/debugf "Found match %s"
                    (pr-str (select-keys <> [:id :lib/desired-column-alias :lib/deduplicated-name])))
        (log/debugf "Failed to find match for %s. Found:\n%s"
                    (pr-str id-or-name)
                    (u/pprint-to-str (map #(select-keys % [:id :lib/desired-column-alias :lib/deduplicated-name])
                                          previous-stage-cols)))))))

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
  will include the join alias in result metadata if appropriate. Ideally you're only supposed to use `:join-alias` in
  the stage where the join was performed. Subsequent stages are supposed to use field name refs, e.g.
  `My_Join__CATEGORY` or something like that. Historically a lot of field refs use IDs plus `:join-alias` well beyond
  the stage where the join originally happened... this is fine (since we can easily resolve it) but we do not want
  metadata to include `:metabase.lib.join/join-alias` in this case since it means the join happened in the current
  stage. If we include it incorrectly then it is liable to break code downstream and 'double-dip' the desired alias
  calculation code (e.g. we might spit out `My_Join__My_Join__CATEGORY`).

  `:source-field` => `:fk-field-id` is not automatically propagated either, because the join may have been done in a
  previous stage (in which case having `:source-field` in the first place was probably incorrect). If appropriate it
  is propagated by [[resolve-in-implicit-join]]."
  {:lib/uuid                :lib/source-uuid
   :binning                 :metabase.lib.field/binning
   :source-field-join-alias :fk-join-alias
   :source-field-name       :fk-field-name
   :temporal-unit           :metabase.lib.field/temporal-unit
   ;; display-name gets copied to both display-name and lib/ref-display-name
   :display-name            :lib/ref-display-name
   :name                    :lib/ref-name})

(defn- opts-fn-inherited-temporal-unit
  "`:inherited-temporal-unit` is transferred from `:temporal-unit` ref option only when
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
    :lib/original-display-name
    :lib/original-expression-name
    :lib/original-fk-field-id
    :lib/original-fk-field-name
    :lib/original-fk-join-alias
    :lib/original-join-alias
    :lib/original-name
    :lib/type
    :active
    :base-type
    :converted-timezone
    :description
    :display-name
    :fingerprint
    :id
    :semantic-type
    :table-id
    :visibility-type})

(def ^:private regular-card-propagated-keys
  #{:lib/card-id
    :active
    :fingerprint
    :visibility-type})

(declare resolve-in-previous-stage-returned-columns-and-update-keys)

(mu/defn- additional-metadata-from-source-card :- [:maybe :map]
  "Calculate additional metadata to include from a source model or Card for an already-resolved column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   col          :- ::lib.metadata.calculation/visible-column]
  (let [stage (lib.util/query-stage query stage-number)]
    (cond
      (:qp/stage-had-source-card stage)
      (let [card-id (:qp/stage-had-source-card stage)]
        (when-some [card (lib.metadata/card query card-id)]
          (when-some [card-cols (not-empty (cond->> (lib.metadata.calculation/returned-columns query card)
                                             ;; if we have `id` then filter out anything that is definitely not a
                                             ;; match
                                             (:id col) (filter #(= (:id %) (:id col)))))]
            ;; prefer resolution with `:lib/source-column-alias` over `:id` if we have it because it will be
            ;; unique/unambiguous if multiple versions of the column (e.g. with different bucketing units) are
            ;; returned
            (when-some [col (resolve-in-previous-stage-returned-columns-and-update-keys query card-cols (:lib/source-column-alias col))]
              (let [col (assoc col :lib/source :source/card, :lib/card-id card-id)
                    propagated-keys (if (= (:type card) :model)
                                      model-propagated-keys
                                      regular-card-propagated-keys)]
                (select-keys col propagated-keys))))))

      (:qp/stage-is-from-source-card stage)
      (let [card-id (:qp/stage-is-from-source-card stage)]
        {:lib/card-id card-id}))))

(mu/defn- resolve-in-previous-stage-returned-columns-and-update-keys :- [:maybe ::lib.metadata.calculation/visible-column]
  "Resolves by `:id` = `id-or-name`, or `:lib/desired-column-alias` in the previous stage returned columns (=
  `:lib/source-column-alias` in the current stage) = `id-or-name`."
  [query                  :- ::lib.schema/query
   previous-stage-columns :- [:maybe ::lib.metadata.calculation/returned-columns]
   id-or-name             :- [:or ::lib.schema.id/field :string]]
  (log/tracef "Previous stage columns: %s" (pr-str (map (juxt :id :lib/desired-column-alias) previous-stage-columns)))
  (when-some [col (resolve-in-previous-stage-returned-columns-without-updating-keys query previous-stage-columns id-or-name)]
    (lib.field.util/update-keys-for-col-from-previous-stage col)))

(mu/defn- resolve-in-join :- [:maybe ::lib.metadata.calculation/visible-column]
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.join/alias
   source-field :- [:maybe ::lib.schema.id/field]
   id-or-name   :- ::id-or-name]
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
        (let [join-cols (cond->> (lib.metadata.calculation/returned-columns query stage-number join)
                          source-field (remove (fn [col]
                                                 (when-some [col-source-field ((some-fn :fk-field-id :lib/original-fk-field-id) col)]
                                                   (not= col-source-field source-field)))))]
          (or (when-some [col (resolve-in-previous-stage-returned-columns-and-update-keys query join-cols id-or-name)]
                (log/debugf "Got: %s" (pr-str col))
                (-> col
                    (as-> $col (lib.join/column-from-join query stage-number $col join-alias))
                    (merge (select-keys join [:fk-field-id]))))
              (do
                (log/debugf "Failed to resolve %s in join" (pr-str id-or-name))
                nil))))
      ;; a join with this alias does not exist at this stage of the query... try looking recursively in previous
      ;; stage(s)
      (do
        (log/debugf "Join %s does not exist in stage %s, looking in previous stages"
                    (pr-str join-alias)
                    (pr-str stage-number))
        (if-some [source-cols (or (when-some [previous-stage-number (lib.util/previous-stage-number query stage-number)]
                                    (lib.metadata.calculation/returned-columns query previous-stage-number))
                                  (when-some [source-card-id (:source-card (lib.util/query-stage query stage-number))]
                                    (lib.metadata.calculation/returned-columns query (lib.metadata/card query source-card-id))))]
          (let [previous-stage-cols (filter #(= (:lib/original-join-alias %) join-alias)
                                            source-cols)]
            ;; try to resolve by what is PROBABLY the correct name in a previous stage e.g. `Join` + `COLUMN` becomes
            ;; `Join__COLUMN`... if this fails then fall back to looking for matches that ignore join alias entirely
            ;; e.g. just `COLUMN`
            (or (when (string? id-or-name)
                  (resolve-in-previous-stage-returned-columns-and-update-keys query previous-stage-cols (str join-alias "__" id-or-name)))
                (resolve-in-previous-stage-returned-columns-and-update-keys query previous-stage-cols id-or-name)))
          (do
            (log/debug "Unable to resolve in previous stage =(")
            nil))))))

(mu/defn- resolve-in-implicit-join-previous-stage :- [:maybe ::lib.metadata.calculation/visible-column]
  "First, try to resolve the implicit join from the previous stage columns -- the join might have already been
  performed there and `:source-field` was specified incorrectly. (You're only supposed to specify this in the stage
  the implicit join happens; after that you should drop it and use field name refs instead e.g.
  `CATEGORIES__via__CATEGORY_ID`.) If this did happen in a previous stage we should return `:lib/original-fk-field-id`
  in the metadata instead of the usual `:source-field` => `:fk-field-id` mapping, otherwise we're liable to construct
  incorrect desired column aliases. [[lib.field.util/update-keys-for-col-from-previous-stage]] should take care of the
  renaming."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   source-field-id :- ::lib.schema.id/field
   id-or-name      :- ::id-or-name]
  (when-some [previous-stage-number (lib.util/previous-stage-number query stage-number)]
    ;; only look for columns from the previous stage that were originally implicitly joined using the same FK. (It is
    ;; possible to implicitly join the same Table more than once with different FKs.)
    (let [previous-stage-cols (filter #(= ((some-fn :fk-field-id :lib/original-fk-field-id) %)
                                          source-field-id)
                                      (lib.metadata.calculation/returned-columns query previous-stage-number))]
      (resolve-in-previous-stage-returned-columns-and-update-keys query previous-stage-cols id-or-name))))

(mu/defn- find-reified-implicit-join-with-fk-field-id :- [:maybe [:tuple ::lib.schema.join/join :int]]
  "Find the reified implicit join (i.e., a join added by
  the [[metabase.query-processor.middleware.add-implicit-joins]] middleware) that has `:fk-field-id` if one exists;
  returns tuple of `[join join-stage-number]`."
  [query stage-number source-field-id]
  (or (when-some [join (m/find-first (fn [join]
                                       (= (:fk-field-id join) source-field-id))
                                     (:joins (lib.util/query-stage query stage-number)))]
        [join stage-number])
      (when-some [previous-stage-number (lib.util/previous-stage-number query stage-number)]
        (recur query previous-stage-number source-field-id))))

(defn- resolve-name-in-implicit-join-this-stage
  "You REALLY shouldn't be specifying `:source-field` in a field name ref, since it makes resolution 10x harder. There's
  a 99.9% chance that using a field name ref with `:source-field` is a bad idea and broken, I even considered banning
  it at the schema level, but decided to let it be for now since we should still be able to resolve it. we need to do
  the lookup as follows:

    Source Field (FK)
    =>
    Target Field (Field with `:fk-target-field-id` AKA the field the FK points to)
    =>
    Target Table (Table to implicitly join)
    =>
    Resolve in Target Table metadata"
  [query source-field-id field-name]
  (when-some [source-field (lib.metadata/field query source-field-id)]
    (when-some [fk-target-field-id (:fk-target-field-id source-field)]
      (when-some [target-field (lib.metadata/field query fk-target-field-id)]
        (when-some [target-table (lib.metadata/table query (:table-id target-field))]
          ;; TODO (Cam 8/7/25) -- seems sorta weird to be
          ;; using [[resolve-in-previous-stage-metadata-without-updating-keys]] here since the
          ;; source table is technically in the same stage, alto if you think about it you can sort
          ;; of think of a table as being the Ur-source of the entire query... either way this
          ;; actually still works since `returned-columns` for a table includes desired column
          ;; aliases.
          (resolve-in-previous-stage-returned-columns-without-updating-keys
           query
           (lib.metadata.calculation/returned-columns query target-table)
           field-name))))))

(mu/defn- resolve-in-implicit-join-current-stage :- [:maybe ::lib.metadata.calculation/visible-column]
  [query           :- ::lib.schema/query
   source-field-id :- ::lib.schema.id/field
   id-or-name      :- ::id-or-name]
  ;; don't resolve name refs using [[field-metadata]] here, because it can cause us to trip up when there are multiple
  ;; fks to the same table. See
  ;; [[metabase.lib.field.resolution-test/multiple-remaps-between-tables-test]]
  (when-some [col (or (field-metadata query nil id-or-name)
                      (resolve-name-in-implicit-join-this-stage query source-field-id id-or-name))]
    ;; if we managed to resolve it then update metadata appropriately.
    (assoc col
           :lib/source :source/implicitly-joinable
           :fk-field-id source-field-id)))

;;; See for
;;; example [[metabase.query-processor.field-ref-repro-test/model-with-implicit-join-and-external-remapping-test]],
;;; if we have a field ref to an implicit join but the implicit join in a previous stage but that column is not
;;; propagated to the stage we're resolving for the query almost certainly won't work, but we can at least return
;;; somewhat more helpful metadata than the base fallback metadata that would give you a confusing error message.
(defn- resolve-unreturned-column-in-reified-implicit-join-in-previous-stage
  [query stage-number source-field-id id-or-name]
  (let [[join join-stage-number] (find-reified-implicit-join-with-fk-field-id query stage-number source-field-id)]
    (when (and join-stage-number
               (not= join-stage-number stage-number))
      (log/errorf (str "Field ref %s in stage %s specifies :source-field-id %s, but we found the implicit join %s in"
                       " earlier stage %s, which doesn't return this column. Query almost certainly won't work"
                       " correctly.")
                  (pr-str id-or-name)
                  (pr-str stage-number)
                  (pr-str source-field-id)
                  (pr-str (:alias join))
                  (pr-str join-stage-number))
      (when-some [col (resolve-in-implicit-join-current-stage query source-field-id id-or-name)]
        (-> col
            lib.field.util/update-keys-for-col-from-previous-stage
            (assoc :lib/original-join-name  (:alias join)
                   :lib/source-column-alias (lib.join.util/joined-field-desired-alias
                                             (:alias join)
                                             ((some-fn :lib/source-column-alias :name) col))
                   ::fallback-metadata?     true))))))

(mu/defn- resolve-in-implicit-join :- [:maybe ::lib.metadata.calculation/visible-column]
  [query           :- ::lib.schema/query
   stage-number    :- :int
   source-field-id :- ::lib.schema.id/field
   id-or-name      :- ::id-or-name]
  (log/debugf "Resolving implicitly joined %s (source Field ID = %s) in stage %s"
              (pr-str id-or-name) (pr-str source-field-id) (pr-str stage-number))
  (or (resolve-in-implicit-join-previous-stage query stage-number source-field-id id-or-name)
      (resolve-unreturned-column-in-reified-implicit-join-in-previous-stage query stage-number source-field-id id-or-name)
      ;; if there is no previous stage or we were unable to find the column in a previous stage then that means the
      ;; implicit join is happening in the current stage.
      (resolve-in-implicit-join-current-stage query source-field-id id-or-name)))

(mu/defn- resolve-in-previous-stage :- [:maybe ::lib.metadata.calculation/visible-column]
  [query                 :- ::lib.schema/query
   previous-stage-number :- :int
   id-or-name            :- ::id-or-name]
  (log/debugf "Resolving %s in previous stage returned columns" (pr-str id-or-name))
  (when-some [previous-stage-columns (lib.metadata.calculation/returned-columns query previous-stage-number)]
    (resolve-in-previous-stage-returned-columns-and-update-keys query previous-stage-columns id-or-name)))

(mu/defn- resolve-in-card-returned-columns :- [:maybe ::lib.metadata.calculation/visible-column]
  [query          :- ::lib.schema/query
   source-card-id :- ::lib.schema.id/card
   id-or-name     :- ::id-or-name]
  (log/debugf "Resolving %s in source Card %s metadata" (pr-str id-or-name) (pr-str source-card-id))
  (when-some [card (lib.metadata/card query source-card-id)]
    (let [card-metadata-columns (lib.metadata.calculation/returned-columns query card)]
      (when-some [col (resolve-in-previous-stage-returned-columns-and-update-keys query card-metadata-columns id-or-name)]
        (-> col
            (assoc :lib/source :source/card, :lib/card-id source-card-id))))))

(mu/defn- resolve-in-current-stage-metadata :- [:maybe ::lib.schema.metadata/column]
  [query        :- ::lib.schema/query
   stage-number :- :int
   id-or-name   :- ::id-or-name]
  (log/debugf "Resolving %s in current stage metadata" (pr-str id-or-name))
  (let [stage (lib.util/query-stage query stage-number)]
    (when-some [current-stage-metadata-columns (or (not-empty (get-in stage [:lib/stage-metadata :columns]))
                                                   (do
                                                     (log/debug "stage has no attached metadata")
                                                     nil))]
      (let [current-stage-metadata-columns (lib.field.util/add-deduplicated-names current-stage-metadata-columns)]
        (u/prog1 (if (string? id-or-name)
                   (some (fn [k]
                           (m/find-first #(= (k %) id-or-name)
                                         current-stage-metadata-columns))
                         [:lib/source-column-alias
                          :lib/deduplicated-name])
                   (m/find-first #(= (:id %) id-or-name) current-stage-metadata-columns))
          (if <>
            (log/debugf "Found match: %s" (pr-str (select-keys <> [:id :lib/source-column-alias :lib/deduplicated-name])))
            (log/debugf "Failed to find match for %s. Found:\n%s"
                        (pr-str id-or-name)
                        (u/pprint-to-str (map #(select-keys % [:id :lib/source-column-alias :lib/deduplicated-name])
                                              current-stage-metadata-columns)))))))))

(mu/defn- resolve-in-source-card-metadata :- [:maybe ::lib.metadata.calculation/visible-column]
  [query        :- ::lib.schema/query
   stage-number :- :int
   id-or-name   :- ::id-or-name]
  (when-some [source-card-id (:source-card (lib.util/query-stage query stage-number))]
    (resolve-in-card-returned-columns query source-card-id id-or-name)))

(defn- fallback-metadata [id-or-name]
  (log/debug (u/format-color :red
                             (str "We tried every trick we could think of and still failed to resolve a field"
                                  " ref. If the query doesn't work, this is why. Returning fallback metadata for %s")
                             (pr-str id-or-name)))
  (merge
   {:lib/type            :metadata/column
    ;; guess that the column came from the previous stage
    :lib/source          :source/previous-stage
    :base-type           :type/*
    ::fallback-metadata? true}
   (if (pos-int? id-or-name)
     {:id                      id-or-name
      :name                    "Unknown Field"
      :lib/source-column-alias "Unknown Field"
      :display-name            "Unknown Field"}
     {:name                    id-or-name
      :lib/source-column-alias id-or-name})))

(mu/defn- resolve-from-previous-stage-or-source* :- [:maybe ::lib.metadata.calculation/visible-column]
  [query stage-number id-or-name]
  (b/cond
    :let [stage (lib.util/query-stage query stage-number)
          source-table-id (:source-table stage)]

    source-table-id
    (when-some [col (field-metadata query source-table-id id-or-name)]
      ;; don't return this field if it's not actually from the source table. We want some of the fallback
      ;; resolution pathways to figure out what join this came from.
      (when (= (:table-id col) source-table-id)
        col))

    ;; we maybe have incorrectly used a field name ref when we should have used a field ID ref.
    ;;
    ;; TODO (Cam 8/15/25) -- what happens if this field is marked inactive? It won't come back from
    ;; `returned-columns`... we'd get fallback metadata, right?
    (and source-table-id
         (string? id-or-name))
    (m/find-first #(= (:name %) id-or-name)
                  (lib.metadata.calculation/returned-columns query (lib.metadata/table query source-table-id)))

    (= (:lib/type stage) :mbql.stage/native)
    (when-some [col (resolve-in-current-stage-metadata query stage-number id-or-name)]
      (-> col
          (assoc :lib/source :source/native)
          (u/assoc-default :lib/source-column-alias (:name col))))

    (:source-card stage)
    (when-some [col (resolve-in-source-card-metadata query stage-number id-or-name)]
      (u/assoc-default col :lib/source-column-alias (:name col)))

    (lib.util/previous-stage-number query stage-number)
    (resolve-in-previous-stage query (lib.util/previous-stage-number query stage-number) id-or-name)))

(mu/defn- resolve-ref-missing-join-alias :- [:maybe ::lib.metadata.calculation/visible-column]
  "Try finding a match in joins (field ref is missing `:join-alias`)."
  [query stage-number id-or-name]
  (log/debugf "Assuming %s is from a join, and missing :join-alias" (pr-str id-or-name))
  (or (when (string? id-or-name)
        (let [parts (str/split id-or-name #"__" 2)]
          (when (= (count parts) 2)
            (let [[join-alias field-name] parts]
              (log/debugf "Split field name into join alias %s and field name %s" (pr-str join-alias) (pr-str field-name))
              (resolve-in-join query stage-number join-alias nil field-name)))))
      (some (fn [join]
              (log/debugf "Looking for match in join %s" (pr-str (:alias join)))
              (resolve-in-join query stage-number (:alias join) nil id-or-name))
            (:joins (lib.util/query-stage query stage-number)))
      (do
        (log/debugf "Failed to find a match in one of the query's joins in stage %s" (pr-str stage-number))
        nil)))

(defn- fallback-metadata-for-field [query stage-number id-or-name]
  (let [source-table-id (:source-table (lib.util/query-stage query stage-number))]
    (when-some [col (field-metadata query source-table-id id-or-name)]
      (assoc col
             ::fallback-metadata? true
             :lib/source          (if (zero? (lib.util/canonical-stage-index query stage-number))
                                    :source/table-defaults
                                    :source/previous-stage)))))

(def ^:private ^:dynamic *recursive-expression-resolution?* false)

(defn- maybe-resolve-expression-in-current-stage [query stage-number id-or-name]
  (when (and (string? id-or-name)
             (not *recursive-expression-resolution?*))
    (binding [*recursive-expression-resolution?* true]
      (when-some [expr (lib.expression/maybe-resolve-expression query stage-number id-or-name)]
        (log/debug (u/format-color :red
                                   (str "Resolved field %s to an expression. Please remember to use :expression references"
                                        " for expressions in the current stage -- using a :field ref is unsupported and may"
                                        " not be allowed in the future.")
                                   (pr-str id-or-name)))
        (-> (lib.expression/expression-metadata query stage-number expr)
            (assoc :lib/source-column-alias id-or-name))))))

(declare resolve-from-previous-stage-or-source)

(defn- resolve-nonexistent-deduplicated-column-name
  "Resolve a ref like `CATEGORY_2` to `CATEGORY` if the query only has the latter."
  [query stage-number id-or-name]
  (when (string? id-or-name)
    (when-let [[_match original-name suffix] (re-matches #"^(\w+)_([1-9]\d*)$" id-or-name)]
      (let [suffix     (parse-long suffix)
            new-suffix (dec suffix)
            ;; e.g. `CATEGORY_3` becomes `CATEGORY_2`; `CATEGORY_2` becomes `CATEGORY`
            new-name   (if (<= new-suffix 1)
                         original-name
                         (str original-name \_ new-suffix))]
        (log/debugf "Failed to resolve %s, trying to resolve Field %s instead..." (pr-str id-or-name) (pr-str new-name))
        (let [resolved (resolve-from-previous-stage-or-source query stage-number new-name)]
          (if (::fallback-metadata? resolved)
            (do
              (log/debugf "Failed to resolve %s as %s" (pr-str id-or-name) (pr-str new-name))
              nil)
            (do
              (log/debugf "Successfully resolved %s as %s" (pr-str id-or-name) (pr-str new-name))
              resolved)))))))

(mu/defn- resolve-from-previous-stage-or-source :- ::lib.metadata.calculation/visible-column
  [query        :- ::lib.schema/query
   stage-number :- :int
   id-or-name   :- ::id-or-name]
  (log/debugf "Resolving %s from previous stage, source table, or source card" (pr-str id-or-name))
  (let [col (or (resolve-from-previous-stage-or-source* query stage-number id-or-name)
                (do
                  (log/debugf "Failed to resolve Field %s in stage %s. Trying other methods..." (pr-str id-or-name) (pr-str stage-number))
                  (resolve-ref-missing-join-alias query stage-number id-or-name))
                ;; if we haven't found a match yet try getting metadata from the metadata provider if this is a
                ;; Field ID ref. It's likely a ref that makes little or no sense (e.g. wrong table) but we can
                ;; let QP code worry about that.
                (fallback-metadata-for-field query stage-number id-or-name)
                ;; try looking in the expressions in this stage to see if someone incorrectly used a field ref for an
                ;; expression.
                (maybe-resolve-expression-in-current-stage query stage-number id-or-name)
                ;; if that fails and this is a deduplicated name like `CATEGORY_2` then try looking for `CATEGORY` and
                ;; so forth
                (resolve-nonexistent-deduplicated-column-name query stage-number id-or-name)
                ;; if we STILL can't find a match, return made-up fallback metadata.
                (fallback-metadata id-or-name))]
    (when col
      (merge-metadata [col (additional-metadata-from-source-card query stage-number col)]))))

(mu/defn resolve-field-ref :- ::lib.metadata.calculation/visible-column
  "Resolve metadata for a `:field` ref. This is part of the implementation
  for [[metabase.lib.metadata.calculation/metadata-method]] a `:field` clause. Guaranteed to have
  `:lib/source-column-alias` for wherever the hecc it comes from."
  [query                                                                                                  :- ::lib.schema/query
   stage-number                                                                                           :- :int
   [_tag {:keys [source-field join-alias], :as opts} id-or-name, :as #?(:clj field-ref :cljs _field-ref)] :- :mbql.clause/field]
  ;; this is just for easier debugging
  (let [stage-number (lib.util/canonical-stage-index query stage-number)]
    (log/debugf "Resolving %s in stage %s" (pr-str id-or-name) (pr-str stage-number))
    (-> (merge-metadata
         [{:lib/type :metadata/column}
          (or (when join-alias
                (resolve-in-join query stage-number join-alias source-field id-or-name))
              (when source-field
                (resolve-in-implicit-join query stage-number source-field id-or-name))
              (merge
               (or (resolve-from-previous-stage-or-source query stage-number id-or-name)
                   (fallback-metadata-for-field query stage-number id-or-name)
                   (fallback-metadata id-or-name))
               (when (and join-alias
                          (contains? (into #{}
                                           (map :alias)
                                           (:joins (lib.util/query-stage query stage-number)))
                                     join-alias))
                 {:lib/source                   :source/joins
                  :metabase.lib.join/join-alias join-alias})))
          (options-metadata opts)
          {:lib/original-ref-style-for-result-metadata-purposes (if (pos-int? id-or-name)
                                                                  :original-ref-style/id
                                                                  :original-ref-style/name)}])
        (as-> $col (assoc $col :display-name (lib.metadata.calculation/display-name query stage-number $col))
          (cond-> $col
            (and (contains? #{nil :type/*} (:effective-type $col))
                 (not (contains? #{nil :type/*} (:base-type $col))))
            (assoc :effective-type (:base-type $col))))
        ;; `:lib/desired-column-alias` needs to be recalculated in the context of the stage where the ref
        ;; appears, go ahead and remove it so we don't accidentally try to use it when it may or may not be
        ;; accurate at all.
        ;;
        ;; We should OTOH keep `:lib/deduplicated-name`, because this is used to calculate subsequent
        ;; deduplicated names, see [[metabase.lib.stage-test/return-correct-deduplicated-names-test]] for an
        ;; example.
        (dissoc :lib/desired-column-alias)
        ;; sanity check the metadata that we return. (Clj + dev/test only)
        #?(:clj
           (u/prog1
             (when (or config/is-dev? config/is-test?)
               (when (and (:id <>)
                          (pos-int? id-or-name)
                          (not= (:id <>) id-or-name))
                 (throw (ex-info "Resolved column has a different :id"
                                 {:query query, :stage-number stage-number, :field-ref field-ref, :col <>})))
               (when (and (= (:lib/source <>) :source/joins)
                          (empty? (:joins (lib.util/query-stage query stage-number))))
                 (throw (ex-info "Stage has no joins, how can source be :source/joins??"
                                 {:query query, :stage-number stage-number, :field-ref field-ref, :col <>})))
               (when (and (pos-int? stage-number)
                          (#{:source/table-defaults :source/native} (:lib/source <>)))
                 (throw (ex-info "A column can only come from a :source-table or native query in the first stage of a query"
                                 {:query query, :stage-number stage-number, :field-ref field-ref, :col <>})))
               (when-some [source-field (:source-field opts)]
                 (when-some [resolved-source-field ((some-fn :fk-field-id :lib/original-fk-field-id) <>)]
                   (when-not (= resolved-source-field source-field)
                     (throw (ex-info "Resolved column has different :source-field"
                                     {:query query, :stage-number stage-number, :field-ref field-ref, :col <>})))))))))))
