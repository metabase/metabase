(ns metabase.lib.schema.expression.conditional
  "Conditional expressions like `:case` and `:coalesce`."
  (:require
   [clojure.set :as set]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.types :as types]
   [metabase.util.malli.registry :as mr]))

;;; the logic for calculating the return type of a `:case` or similar statement is not optimal nor perfect. But it
;;; should be ok for now and errors on the side of being permissive. See this Slack thread for more info:
;;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1678325996901389
(defn- best-return-type
  "For expressions like `:case` and `:coalesce` that can return different possible expressions, determine the best
  return type given all of the various options."
  [x y]
  (cond
    (nil? x)
    y

    ;; if both types are keywords return their most-specific ancestor.
    (and (keyword? x)
         (keyword? y))
    (types/most-specific-common-ancestor x y)

    ;; if one type is a specific type but the other is an ambiguous union of possible types, return the specific
    ;; type. A case can't possibly have multiple different return types, so if one expression has an unambiguous
    ;; type then the whole thing has to have a compatible type.
    (keyword? x)
    x

    (keyword? y)
    y

    ;; if both types are ambiguous unions of possible types then return the intersection of the two. But if the
    ;; intersection is empty, return the union of everything instead. I don't really want to go down a rabbit
    ;; hole of trying to find the intersection between the most-specific common ancestors
    :else
    (or (when-let [intersection (not-empty (set/intersection x y))]
          (if (= (count intersection) 1)
            (first intersection)
            intersection))
        (set/union x y))))

;;; believe it or not, a `:case` clause really has the syntax [:case {} [[pred1 expr1] [pred2 expr2] ...]]
(mr/def ::case-subclause
  [:tuple
   {:error/message "Valid :case [pred expr] pair"}
   #_pred [:ref ::expression/boolean]
   #_expr [:ref ::expression/expression]])


(mbql-clause/define-catn-mbql-clause :case
  ;; TODO -- we should further constrain this so all of the exprs are of the same type
  [:pred-expr-pairs [:sequential {:min 1} [:ref ::case-subclause]]]
  [:default [:? [:schema [:ref ::expression/expression]]]])

(defn- allow-unkown-type
  "A hack to allow case and coalesce expressions using fields only.
  The real fix would pass in metadata so that the types of fields
  can be determined."
  [expr-type]
  (if (= expr-type ::expression/type.unknown)
    :type/*
    expr-type))

(defmethod expression/type-of-method :case
  [[_tag _opts pred-expr-pairs default]]
  (-> (reduce
       (fn [best-guess [_pred expr]]
         (let [expr-type (expression/type-of expr)]
           (best-return-type best-guess expr-type)))
       (when (some? default)
         (expression/type-of default))
       pred-expr-pairs)
      allow-unkown-type))

;;; TODO -- add constraint that these types have to be compatible
(mbql-clause/define-tuple-mbql-clause :coalesce
  #_expr       [:ref :metabase.lib.schema.expression/expression]
  #_null-value [:ref :metabase.lib.schema.expression/expression])

(defmethod expression/type-of-method :coalesce
  [[_tag _opts expr null-value]]
  (-> (best-return-type (expression/type-of expr) (expression/type-of null-value))
      allow-unkown-type))
