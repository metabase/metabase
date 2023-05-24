(ns metabase.lib.types.isa
  "Ported from frontend/src/metabase-lib/types/utils/isa.js.

  This code belong to MLv2 project and it belongs to 47,
  we only ported some functionality that is needed for a bug fix in 46.
  See #30321 for the original PR."
  (:require
   [medley.core :as m]
   [metabase.types])
  (:refer-clojure :exclude [isa? any? boolean? number? string?]))

(comment metabase.types/keep-me)

(def type-hierarchies
  "A front-end specific type hierarchy used by [[metabase.lib.types.isa/field-type?]].
  It is not meant to be used directly."
  {::temporal    {:effective-type [:type/Temporal]
                  :semantic-type  [:type/Temporal]}
   ::number      {:effective-type [:type/Number]
                  :semantic-type  [:type/Number]}
   ::string      {:effective-type [:type/Text]
                  :semantic-type  [:type/Text :type/Category]}
   ::string_like {:effective-type [:type/TextLike]}
   ::boolean     {:effective-type [:type/Boolean]}
   ::coordinate  {:semantic-type [:type/Coordinate]}
   ::location    {:semantic-type [:type/Address]}
   ::entity      {:semantic-type [:type/FK :type/PK :type/Name]}
   ::foreign_key {:semantic-type [:type/FK]}
   ::primary_key {:semantic-type [:type/PK]}
   ::summable    {:include [::number]
                  :exclude [::entity ::location ::temporal]}
   ::scope       {:include [::number ::temporal ::category ::entity ::string]
                  :exclude [::location]}
   ::category    {:effective-type [:type/Boolean]
                  :semantic-type  [:type/Category]
                  :include        [::location]}
   ;; NOTE: this is defunct right now.  see definition of metabase.lib.types.isa/dimension?.
   ::dimension   {:include [::temporal ::category ::entity]}})

(defn isa?
  "Decide if `_column` is a subtype of the type denoted by the keyword `type-kw`.
  Both effective and semantic types are taken into account."
  [{:keys [effective-type semantic-type] :as _column} type-kw]
  (or (clojure.core/isa? effective-type type-kw)
      (clojure.core/isa? semantic-type type-kw)))

(defn field-type?
  "Returns if `column` is of category `category`.
  The possible categories are the keys in [[type-hierarchies]]."
  [category column]
  (let [type-definition (type-hierarchies category)]
    (cond
      (nil? column) false

      ;; check field types
      (some (fn [[type-type types]]
              (and (#{:effective-type :semantic-type} type-type)
                   (some #(clojure.core/isa? (type-type column) %) types)))
            type-definition)
      true

      ;; recursively check if it's not an excluded type
      (some #(field-type? % column) (:exclude type-definition))
      false

      ;; recursively check if it's an included type
      (some #(field-type? % column) (:include type-definition))
      true

      :else false)))

(defn field-type
  "Return the category `column` belongs to.
  The possible categories are the keys in [[type-hierarchies]]."
  [column]
  (m/find-first #(field-type? % column)
                [::temporal
                 ::location
                 ::coordinate
                 ::foreign_key
                 ::primary_key
                 ::boolean
                 ::string
                 ::string_like
                 ::number]))

(defn date?
  "Is `column` of a temporal type?"
  [column]
  (field-type? ::temporal column))

(defn numeric?
  "Is `column` of a numeric type?"
  [column]
  (field-type? ::number column))
