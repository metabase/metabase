(ns metabase-enterprise.content-diagnostics.checkers.duplicated
  "The `duplicated` Content Diagnostics checker - match mode `name`: two or more non-archived entities of
  the same type whose normalized names are equal and non-blank form a duplicate cluster. Every member of
  a cluster of size k gets one `:duplicated` finding whose peers are the other k-1 members, with
  `:duplicate-count` = the peer count (→ the native `duplicate_count` column).

  `details` carries `normalized_name` (the normalized name the cluster collided on) and
  `duplicate_entity_ids` (the flagged entity's peer ids - what the serve layer hydrates). Clustering is by
  normalized name within an entity type; cards cluster across all sub-kinds (`type` -
  question/model/metric), so a question and a model sharing a name are duplicates. One lightweight
  (id, name) load per entity type, grouped in memory - no per-entity loop, app-db only."
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
      (str/replace #"(?U)\p{Cf}" "")   ; strip Unicode format chars (zero-width joiners, bidi marks, soft hyphens)
      (str/replace #"(?U)\s+" " ")     ; collapse any run of Unicode whitespace to a single space
      str/trim))

(defmulti ^:private candidate-rows
  "Lightweight non-archived `(id, name)` rows for one entity type, for name clustering. card/dashboard/document
  (`::collection-item`) filter on their `archived` column and add any `common/candidate-cols` (card carries
  `:card_schema`, required by its after-select hook); transform has no `archived` column (hard-deleted), so
  every row counts. Scan-time and instance-wide - deliberately un-permissioned, unlike the serve layer's
  `read-entity-rows`."
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
  "Group one entity type's rows by normalized name and emit findings for every cluster of ≥ 2 (cards cluster
  across all sub-kinds - grouping is by name alone). Clusters with a blank normalized name are skipped:
  `name` is NOT NULL on all four models but can be whitespace-only, and unknown is not duplicate."
  [entity-type]
  (for [[norm-name rows] (group-by (comp normalize-name :name) (candidate-rows entity-type))
        :when   (and (not (str/blank? norm-name)) (>= (count rows) 2))
        finding (cluster-findings entity-type norm-name rows)]
    finding))

(defn checker
  "Instance-wide `:duplicated` finding maps across every covered entity type except `:collection` - a
  duplicate-name check the imbalanced-only `:collection` subject deliberately sits out (it has no
  `candidate-rows` method; mirrors `api.common/covered-entity-types`). The denormalized display attrs are
  stamped by `common/attach-entity-attrs`; `:duration-ms`/`:last-active-at` are left unset (those columns
  stay NULL on duplicated findings)."
  []
  (common/attach-entity-attrs
   ;; exclude :collection - it is an imbalanced-only subject with no candidate-rows method, so iterating it
   ;; would throw at dispatch. duplicated covers the collection-resident content types only.
   (into [] (mapcat findings-for-type) (remove #{:collection} (keys common/entity-type->model)))))
