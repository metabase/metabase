(ns metabase.lib.query.field-ref-update
  (:require
   ;; allowed since this is needed to convert legacy queries to MBQL 5
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some select-keys mapv empty? #?(:clj for)]]
   [weavejester.dependency :as dep]))

(defn- source-type->stage-key
  [source-type]
  (case source-type
    :card :source-card
    :table :source-table))

(defn- ultimate-table
  [query]
  ())

(defn- upgrade-field-ref-by-columns
  [query stage-number columns field-ref]
  (cond
    (lib.ref/field-ref-id field-ref)
    (or (some-> (lib.equality/find-matching-column query stage-number field-ref columns)
                lib.ref/ref)
        (throw (ex-info "Cannot find matching column."
                        {:query query
                         :stage-number stage-number
                         :field-ref field-ref
                         :columns columns})))

    (lib.ref/field-ref-name field-ref)
    field-ref

    :else
    (throw (ex-info "Unknown field-ref type." {:field-ref field-ref}))))

(defn- walk-field-refs
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (if-not (lib.field/is-field-clause? clause)
                            clause
                            (f clause)))))

(defn- ultimate-table-id
  [mp [source-type source-id]]
  (case source-type
    :table
    source-id

    :card
    (or (:table-id (lib.metadata/card mp source-id))
        (throw (ex-info "Cannot find ulimate card for source"
                        {:source-type source-type
                         :source-id   source-id})))))

(defn- query-source
  [mp [source-type source-id]]
  (case source-type
    :card
    (lib.query/query mp (lib.metadata/card mp source-id))

    :table
    (lib.query/query mp (lib.metadata/table mp source-id))))

(defn- swap-field-ref
  [field-ref mp old-source new-source]
  (if (lib.ref/field-ref-name field-ref)
    field-ref ;; don't need to update if it's a name
    (let [source-table-id (ultimate-table-id mp old-source)
          field (lib.metadata/field mp (lib.ref/field-ref-id field-ref))
          field-table-id (:table-id field)]
      (cond
        (not= source-table-id field-table-id)
        field-ref ;; not related to old-source

        (:source-field (lib.options/options field-ref))
        (throw (ex-info "Can't handle field-refs with joins"
                        {:field-ref field-ref
                         :old-source old-source
                         :new-source new-source}))

        :else ;; okay, we just have to switch it now
        (let [query   (query-source mp new-source)
              columns (lib.field/fieldable-columns query)
              column-matches  (filter #(= (:name field) (:name %)) columns)
              column (first column-matches)]
          (when (not= 1 (count column-matches))
            (throw (ex-info "Bad matches for new field ref"
                            {:field field
                             :column-matches column-matches
                             :field-ref field-ref
                             :old-source old-source
                             :new-source new-source
                             :columns columns})))
          (lib.ref/ref column))))))

(defn- update-field-refs-in-clauses
  [clauses query old-source new-source]
  (let [swap (fn [field-ref]
               (swap-field-ref field-ref query old-source new-source))]
    (mapv (fn [fr] (walk-field-refs fr swap)) clauses)))

(defn- update-field-refs-in-stage
  [stage query old-source new-source]
  (cond-> stage
    (:fields stage)
    (update :fields      update-field-refs-in-clauses query old-source new-source)

    (:filters stage)
    (update :filters     update-field-refs-in-clauses query old-source new-source)

    (:expressions stage)
    (update :expressions update-field-refs-in-clauses query old-source new-source)

    (:aggregation stage)
    (update :aggregation update-field-refs-in-clauses query old-source new-source)

    (:breakout stage)
    (update :breakout    update-field-refs-in-clauses query old-source new-source)))

(defn- update-stage-source-type
  [stage _query [old-source-type old-source-id] [new-source-type new-source-id]]
  (let [old-key (source-type->stage-key old-source-type)
        new-key (source-type->stage-key new-source-type)]
    (cond-> stage
      (= (old-key stage) old-source-id)
      (->
       (dissoc :source-table :source-card)
       (assoc new-key new-source-id)))))

(defn- update-stage
  [stage query old-source new-source]
  (-> stage
      (update-stage-source-type   query old-source new-source)
      (update-field-refs-in-stage query old-source new-source)))

(defn- update-field-refs-in-join
  [join query old-source new-source]
  (tap> join)
  (cond-> join
    (:conditions join)
    (update :conditions update-field-refs-in-clauses query old-source new-source)

    (:stages join)
    (update :stages #(mapv (fn [stage] (update-stage stage query old-source new-source)) %))))

(defn update-field-refs
  "Walk all stages and joins in a query, replacing old source references with new ones."
  [query old-source new-source]
  (lib.walk/walk
   query
   (fn [query path-type _path stage-or-join]
     (case path-type
       :lib.walk/stage
       (update-stage stage-or-join query old-source new-source)

       :lib.walk/join
       (-> stage-or-join
           (update-field-refs-in-join query old-source new-source))))))
