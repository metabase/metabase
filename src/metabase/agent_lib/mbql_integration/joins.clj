(ns metabase.agent-lib.mbql-integration.joins
  "Explicit-vs-implicit join integration helpers for the agent-lib MBQL bridge."
  (:require
   [metabase.agent-lib.join-spec :as join-spec]
   [metabase.agent-lib.mbql-integration.common :as common]
   [metabase.agent-lib.mbql-integration.fields :as fields]
   [metabase.agent-lib.syntax :as syntax]))

(set! *warn-on-reflection* true)

(defn implicitly-resolved-column?
  "True when `column` represents the target side of an implicit join strongly
  enough that agent-lib can treat an explicit join request as redundant."
  [column target-table-id]
  (boolean
   (and (map? column)
        (or (= (:table-id column) target-table-id)
            (= :source/previous-stage (:lib/source column)))
        (or (:fk-field-id column)
            (:lib/original-fk-field-id column)
            (= :source/previous-stage (:lib/source column)))
        (nil? (:join-alias column)))))

(defn- valid-implicit-join-spec?
  "True when a parsed join spec has the shape of a potentially redundant implicit join."
  [{:keys [target-table-id conditions fields-mode strategy alias]}]
  (and (pos-int? target-table-id)
       (nil? alias)
       (or (nil? strategy) (= "left-join" strategy))
       (join-spec/implicit-join-compatible-fields-mode? fields-mode)
       (= 1 (count conditions))))

(defn- target-field-for-join
  "Return the field metadata for the side of the join condition that points at the
  target table, or nil."
  [fields-by-id target-table-id [lhs-id rhs-id]]
  (let [lhs-table-id (some-> (get fields-by-id lhs-id) :table-id)
        rhs-table-id (some-> (get fields-by-id rhs-id) :table-id)
        field-id     (cond
                       (= lhs-table-id target-table-id) lhs-id
                       (= rhs-table-id target-table-id) rhs-id)]
    (some-> field-id fields-by-id)))

(defn redundant-implicit-join?
  "Return true when a structured explicit join would be redundant because the
  current query already exposes the target side through implicit join behavior."
  [fields-by-id current-query operation]
  (let [join-spec    (when (and (common/query? current-query)
                                (vector? operation)
                                (= "join" (syntax/canonical-op-name (first operation)))
                                (= 2 (count operation)))
                       (join-spec/parse-join-spec (second operation)))
        target-field (when (and join-spec (valid-implicit-join-spec? join-spec))
                       (target-field-for-join fields-by-id
                                              (:target-table-id join-spec)
                                              (first (:conditions join-spec))))
        target-col   (when target-field
                       (fields/resolve-field-in-query fields-by-id current-query target-field))]
    (when target-col
      (implicitly-resolved-column? target-col (:target-table-id join-spec)))))
