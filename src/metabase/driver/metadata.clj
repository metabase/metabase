(ns metabase.driver.metadata
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.util.kebab-hating-map :as u.kebab-hating-map]
   [metabase.util.malli :as mu]
   [metabase.util.snake-hating-map :as u.snake-hating-map]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(def ^:private model->metadata-type
    {:model/Database :metadata/database
     :model/Table    :metadata/table
     :model/Field    :metadata/column
     :model/Card     :metadata/card
     :model/Metric   :metadata/metric
     :model/Segment  :metadata/segment})

(def ^:private metadata-type->model
  (set/map-invert model->metadata-type))

(declare legacy-metadata?)

(mu/defn ->mlv2-metadata :- [:and
                             [:multi {:dispatch lib.dispatch/dispatch-value}
                              [:metadata/database lib.metadata/DatabaseMetadata]
                              [:metadata/table    lib.metadata/TableMetadata]
                              [:metadata/column   lib.metadata/ColumnMetadata]
                              [:metadata/card     lib.metadata/CardMetadata]
                              [:metadata/metric   lib.metadata/MetricMetadata]
                              [:metadata/segment  lib.metadata/SegmentMetadata]]
                             [:fn
                              {:error/message "a map that is not considered to be legacy metadata"}
                              (complement #'legacy-metadata?)]]
  "Convert a Toucan 2 instance e.g. a `:model/Database` to an equivalent MLv2 metadata type e.g. a `:metadata/database`.
  If this is already MLv2 metadata, returns it as-is."
  ([instance]
   (->mlv2-metadata instance nil))

  ([instance :- [:maybe :map] metadata-type]
   (when instance
     (if (:lib/type instance)
       instance
       (let [metadata-type (or metadata-type
                               (let [model (t2/model instance)]
                                 (or (model->metadata-type model)
                                     (throw (ex-info (format "Don't know how to convert a %s to MLv2 metadata" model)
                                                     {:instance instance})))))]
         (u.snake-hating-map/snake-hating-map
          (into {:lib/type metadata-type} (update-keys instance u/->kebab-case-en))))))))

(defn ->legacy-metadata
  "For compatibility: convert MLv2-style metadata as returned by [[metabase.lib.metadata.protocols]]
  or [[metabase.lib.metadata]] functions
  (with `kebab-case` keys and `:lib/type`) to legacy QP/application database style metadata (with `snake_case` keys
  and Toucan 2 model `:type` metadata).

  Try to avoid using this, we would like to remove this in the near future."
  {:deprecated "0.48.0"}
  ([metadata]
   (->legacy-metadata metadata nil))

  ([metadata model]
   (if-not (:lib/type metadata)
     metadata
     (let [model (or model
                     (metadata-type->model (:lib/type metadata))
                     (throw (ex-info (format "Don't know how to convert map with :lib/type %s to legacy metadata"
                                             (:lib/type metadata))
                                     {:metadata metadata})))]
       (-> metadata
           (dissoc :lib/type)
           (update-keys u/->snake_case_en)
           (vary-meta assoc :type model)
           (m/update-existing :field_ref lib.convert/->legacy-MBQL)
           #_{:clj-kondo/ignore [:deprecated-var]}
           u.kebab-hating-map/kebab-hating-map)))))

(defn- snake-case? [s]
  (str/includes? s "_"))

(defn legacy-metadata?
  "Whether this is a legacy `snake_case` metadata map e.g. a Toucan instance from the application database."
  [m]
  (when (map? m)
    (or
     (t2/model m)
     (= (::metadata-type (meta m)) ::metadata-type.legacy)
     #_{:clj-kondo/ignore [:deprecated-var]}
     (u.kebab-hating-map/kebab-hating-map? m)
     (some snake-case? (keys m)))))
