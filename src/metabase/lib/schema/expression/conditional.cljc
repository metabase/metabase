(ns metabase.lib.schema.expression.conditional
  "Conditional expressions like `:case` and `:coalesce`."
  (:refer-clojure :exclude [not-empty #?(:clj doseq)])
  (:require
   [clojure.set :as set]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.types.core :as types]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [not-empty #?(:clj doseq)]]))

;;; the logic for calculating the return type of a `:case` or similar statement is not optimal nor perfect. But it
;;; should be ok for now and errors on the side of being permissive. See this Slack thread for more info:
;;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1678325996901389
(mr/def ::return-type
  [:maybe
   [:or
    [:set :keyword]
    :keyword]])

(mu/defn- best-return-type :- ::return-type
  "For expressions like `:case` and `:coalesce` that can return different possible expressions, determine the best
  return type given all of the various options."
  [x :- ::return-type
   y :- ::return-type]
  (cond
    (nil? x)
    y

    ;; if the type of either x or y is unknown, then the overall type of this has to be unknown as well.
    (or (= x ::expression/type.unknown)
        (= y ::expression/type.unknown))
    ::expression/type.unknown

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

(defn case-coalesce-return-type
  "Special logic to return the best return type for `:case`, `:if`, and `:coalesce`. Instead of
  using [[types/most-specific-common-ancestor]] directly we fudge a little bit and return something more concrete when
  needed -- instead of `:type/Date` + `:type/DateTime` = `:type/HasDate`, we return `:type/DateTime` because (usually)
  the database will do the same conversion and it avoids breaking a lot of old code that doesn't know about
  `:type/HasDate`. See https://metaboat.slack.com/archives/C0645JP1W81/p1749678551101819 for more discussion."
  [types]
  (let [best-type (if (>= (count types) 2)
                    (reduce best-return-type (first types) (rest types))
                    (first types))]
    ;; if we return `:type/HasDate` that means the types were some mix of `:type/Date` and `:type/DateTime`.
    ;; `:type/HasTime` means we got a mix of `:type/Time` and `:type/DateTime`. 'Upgrade' the result to
    ;; `:type/DateTime` in either case.
    (if (#{:type/HasDate :type/HasTime} best-type)
      :type/DateTime
      best-type)))

;;; believe it or not, a `:case` clause really has the syntax [:case {} [[pred1 expr1] [pred2 expr2] ...]]
;;; `:if` is an alias to `:case`
(doseq [tag [:case :if]]
  (mbql-clause/define-mbql-clause
    tag
    [:schema
     (mbql-clause/catn-clause-schema tag
                                     [:pred-expr-pairs
                                      [:sequential {:min 1}
                                       [:tuple
                                        {:error/message "Valid [pred expr] pair"}
                                        #_pred [:ref ::expression/boolean]
                                        #_expr [:ref ::expression/expression]]]]
                                     [:default [:? [:schema [:ref ::expression/expression]]]])])

  (defmethod expression/type-of-method tag
    [[_tag _opts pred-expr-pairs default]]
    (let [exprs (concat
                 (map second pred-expr-pairs)
                 (when (some? default)
                   [default]))
          types (keep expression/type-of exprs)]
      (case-coalesce-return-type types))))

(mbql-clause/define-mbql-clause
  :coalesce
  [:schema
   (mbql-clause/catn-clause-schema :coalesce
                                   [:exprs [:repeat {:min 2} [:schema [:ref ::expression/expression]]]])])

(defmethod expression/type-of-method :coalesce
  [[_coalesce _opts & exprs]]
  (case-coalesce-return-type (map expression/type-of exprs)))
