(ns metabase.lib.types.constants
  "Ported from frontend/src/metabase-lib/types/constants.js"
  #?(:cljs (:require [goog.object :as gobj])))

#?(:cljs
   (def ^:export TYPE
     "A map of Type name (as string, without `:type/` namespace) -> type keyword

         {\"Temporal\" :type/Temporal, ...}"
     (reduce (fn [m typ] (doto m (gobj/set (name typ) typ)))
             #js {}
             (distinct (mapcat descendants [:type/* :Semantic/* :Relation/*])))))

;; primary field types used for picking operators, etc
(def ^:export NUMBER "JS-friendly access for the number type" ::number)
(def ^:export STRING "JS-friendly access for the string type" ::string)
(def ^:export STRING_LIKE "JS-friendly access for the string-like type" ::string-like)
(def ^:export BOOLEAN "JS-friendly access for the boolean type" ::boolean)
(def ^:export TEMPORAL "JS-friendly access for the temporal type" ::temporal)
(def ^:export LOCATION "JS-friendly access for the location type" ::location)
(def ^:export COORDINATE "JS-friendly access for the coordinate type" ::coordinate)
(def ^:export FOREIGN_KEY "JS-friendly access for the foreign-key type" ::foreign-key)
(def ^:export PRIMARY_KEY "JS-friendly access for the primary-key type" ::primary-key)

;; other types used for various purposes
(def ^:export SUMMABLE "JS-friendly access for the summable type" ::summable)
(def ^:export SCOPE "JS-friendly access for the scope type" ::scope)
(def ^:export CATEGORY "JS-friendly access for the category type" ::category)

(def ^:export UNKNOWN "JS-friendly access for the unknown type" ::unknown)

;; NOTE: be sure not to create cycles using the "other" types
(def type-hierarchies
  {TEMPORAL    {:effective_type [:type/Temporal]
                :semantic_type  [:type/Temporal]}
   NUMBER      {:effective_type [:type/Number]
                :semantic_type  [:type/Number]}
   STRING      {:effective_type [:type/Text]
                :semantic_type  [:type/Text :type/Category]}
   STRING_LIKE {:effective_type [:type/TextLike]}
   BOOLEAN     {:effective_type [:type/Boolean]}
   COORDINATE  {:semantic_type [:type/Coordinate]}
   LOCATION    {:semantic_type [:type/Address]}
   ::entity    {:semantic_type [:type/FK :type/PK :type/Name]}
   FOREIGN_KEY {:semantic_type [:type/FK]}
   PRIMARY_KEY {:semantic_type [:type/PK]}
   SUMMABLE    {:include [NUMBER]
                :exclude [::entity LOCATION TEMPORAL]}
   SCOPE       {:include [NUMBER TEMPORAL CATEGORY ::entity STRING]
                :exclude [LOCATION]}
   CATEGORY    {:effective_type [:type/Boolean]
                :semantic_type  [:type/Category]
                :include        [LOCATION]}
   ;; NOTE: this is defunct right now.  see definition of metabase.lib.types.isa/dimension?.
   ::dimension {:include [TEMPORAL CATEGORY ::entity]}})
