(ns metabase-enterprise.content-diagnostics.checkers.duplicated
  "The `duplicated` Content Diagnostics checker - match mode `name`: two or more non-archived entities of
  the same type whose normalized names are equal and non-blank form a duplicate cluster. Every member of
  a cluster of size k gets one `:duplicated` finding whose peers are the other k-1 members, with
  `:duplicate-count` = the peer count (→ the native `duplicate_count` column).

  `details` carries `normalized_name` (the normalized name the cluster collided on) and
  `duplicate_entity_ids` (the flagged entity's peer ids - what the serve layer hydrates). Cards are grouped
  by their sub-kind (`type` - question/model/metric): a question and a model sharing a name are not
  duplicates. One lightweight (id, name) load per entity type, grouped in memory - no per-entity loop,
  app-db only."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- normalize-name
  "Normalize a name for duplicate detection: remove diacritical marks, lowercase, remove invisible and collapse whitespace"
  [s]
  (-> (or (u/remove-diacritical-marks s) "")   ; remove-diacritical-marks returns nil on empty input
      u/lower-case-en
      (str/replace #"(?U)\p{Cf}" "")
      (str/replace #"(?U)\s+" " ")
      str/trim))

(defmulti ^:private candidate-rows
  "Lightweight non-archived `(id, name[, sub-kind])` rows for one entity type, for name clustering.
  card/dashboard/document (`::collection-item`) filter on their `archived` column, sub-kind cols from
  `common/candidate-cols`; transform has no `archived` column (hard-deleted), so every row counts. Scan-time
  and instance-wide - deliberately un-permissioned, unlike the serve layer's `read-entity-rows`."
  {:arglists '([entity-type])}
  identity
  :hierarchy #'common/hierarchy)

(defmethod candidate-rows ::common/collection-item
  [entity-type]
  ;; :card_schema (a candidate-col for cards) is required on any Card select - its after-select hook reads it.
  (t2/select (into [(common/entity-type->model entity-type) :id :name] (common/candidate-cols entity-type))
             :archived false))

(defmethod candidate-rows :transform
  [_]
  (t2/select [:model/Transform :id :name]))

(defn- cluster-findings
  "One `:duplicated` finding per member of a name cluster; peers are the other members (symmetric: in
  {A,B,C}, A's finding lists {B,C}, B's {A,C}, C's {A,B})."
  [entity-type normalized-name rows]
  (let [ids (mapv :id rows)]
    (for [id ids
          :let [peer-ids (filterv #(not= % id) ids)]]
      {:entity-type     entity-type
       :entity-id       id
       :finding-type    :duplicated
       :duplicate-count (count peer-ids)
       :details         {:normalized_name      normalized-name
                         :duplicate_entity_ids peer-ids}})))

(defn- findings-for-type
  "Group one entity type's rows by normalized name - cards additionally by sub-kind (`:type`, nil for the
  other types) - and emit findings for every cluster of ≥ 2. Clusters with a blank normalized name are
  skipped: `name` is NOT NULL on all four models but can be whitespace-only, and unknown is not duplicate."
  [entity-type]
  (for [[[norm-name _card-type] rows] (group-by (fn [{nm :name card-type :type}]
                                                  [(normalize-name nm) card-type])
                                                (candidate-rows entity-type))
        :when   (and (not (str/blank? norm-name)) (>= (count rows) 2))
        finding (cluster-findings entity-type norm-name rows)]
    finding))

(defn checker
  "Instance-wide `:duplicated` finding maps across all covered entity types. The denormalized display
  attrs are stamped by `common/attach-entity-attrs`; `:duration-ms`/`:last-active-at` are left unset
  (those columns stay NULL on duplicated findings)."
  []
  (common/attach-entity-attrs
   (into [] (mapcat findings-for-type) (keys common/entity-type->model))))
