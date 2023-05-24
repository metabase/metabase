(ns metabase.lib.types.isa
  "Ported from frontend/src/metabase-lib/types/utils/isa.js"
  (:require
   [medley.core :as m]
   [metabase.lib.types.constants :as lib.types.constants]
   [metabase.lib.util :as lib.u]
   [metabase.types])
  (:refer-clojure :exclude [isa? any? boolean? number? string?]))

(comment metabase.types/keep-me)

(defn ^:export isa?
  "Decide if `_column` is a subtype of the type denoted by the keyword `type-kw`.
  Both effective and semantic types are taken into account."
  [{:keys [effective-type semantic-type] :as _column} type-kw]
  (or (clojure.core/isa? effective-type type-kw)
      (clojure.core/isa? semantic-type type-kw)))

(defn ^:export field-type?
  "Returns if `column` is of category `category`.
  The possible categories are the keys in [[metabase.lib.types.constants/type-hierarchies]]."
  [category column]
  (let [type-definition (lib.types.constants/type-hierarchies category)]
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

(defn ^:export field-type
  "Return the category `column` belongs to.
  The possible categories are the keys in [[metabase.lib.types.constants/type-hierarchies]]."
  [column]
  (m/find-first #(field-type? % column)
                [::lib.types.constants/temporal
                 ::lib.types.constants/location
                 ::lib.types.constants/coordinate
                 ::lib.types.constants/foreign_key
                 ::lib.types.constants/primary_key
                 ::lib.types.constants/boolean
                 ::lib.types.constants/string
                 ::lib.types.constants/string_like
                 ::lib.types.constants/number]))

(defn ^:export date?
  "Is `column` of a temporal type?"
  [column]
  (field-type? ::lib.types.constants/temporal column))

(defn ^:export numeric?
  "Is `column` of a numeric type?"
  [column]
  (field-type? ::lib.types.constants/number column))

(defn ^:export boolean?
  "Is `column` of a boolean type?"
  [column]
  (field-type? ::lib.types.constants/boolean column))

(defn ^:export string?
  "Is `column` of a string type?"
  [column]
  (field-type? ::lib.types.constants/string column))

(defn ^:export summable?
  "Is `column` of a summable type?"
  [column]
  (field-type? ::lib.types.constants/summable column))

(defn ^:export scope?
  "Is `column` of a scope type?"
  [column]
  (field-type? ::lib.types.constants/scope column))

(defn ^:export category?
  "Is `column` of a categorical type?"
  [column]
  (field-type? ::lib.types.constants/category column))

(defn ^:export location?
  "Is `column` of a location type?"
  [column]
  (field-type? ::lib.types.constants/location column))

(defn ^:export description?
  "Is `column` a description?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Description))

(defn ^:export dimension?
  "Is `column` a dimension?"
  [column]
  (and column
       (not= (:lib/source column) :source/aggregation)
       (not (description? column))))

(defn ^:export metric?
  "Is `column` a metric?"
  [column]
  (and (not= (:lib/source column) :source/breakout)
       (summable? column)))

(defn ^:export foreign-key?
  "Is `column` a foreign-key?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/FK))

(defn ^:export primary-key?
  "Is `column` a primary-key?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/PK))

(defn ^:export entity-name?
  "Is `column` an entity name?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Name))

(defn ^:export any?
  "Is this `_column` whatever (including nil)?"
  [_column]
  true)

(defn ^:export numeric-base-type?
  "Is `column` a numneric base type?"
  [column]
  (clojure.core/isa? (:effective-type column) :type/Number))

(defn ^:export date-without-time?
  "Is `column` a date without time?"
  [column]
  (clojure.core/isa? (:effective-type column) :type/Date))

;; ZipCode, ID, etc derive from Number but should not be formatted as numbers
(defn ^:export number?
  "Is `column` a number without some other semantic type (like ZIP code)?"
  [column]
  (and (numeric-base-type? column)
       (let [semantic-type (:semantic-type column)]
         (or (nil? semantic-type)
             ;; this is a precaution, :type/Number is not a semantic type
             (clojure.core/isa? semantic-type :type/Number)))))

(defn ^:export integer?
  "Is `column` a integer column?"
  [column]
  (field-type? ::lib.types.constants/integer column))

(defn ^:export time?
  "Is `column` a time?"
  [column]
  (clojure.core/isa? (:effective-type column) :type/Time))

(defn ^:export address?
  "Is `column` an address?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Address))

(defn ^:export city?
  "Is `column` a city?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/City))

(defn ^:export state?
  "Is `column` a state?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/State))

(defn ^:export zip-code?
  "Is `column` a zip-code?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/ZipCode))

(defn ^:export country?
  "Is `column` a country?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Country))

(defn ^:export coordinate?
  "Is `column` a coordinate?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Coordinate))

(defn ^:export latitude?
  "Is `column` a latitude?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Latitude))

(defn ^:export longitude?
  "Is `column` a longitude?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Longitude))

(defn ^:export currency?
  "Is `column` a currency?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Currency))

(defn ^:export comment?
  "Is `column` a comment?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Comment))

(defn ^:export id?
  "Is `column` an ID?"
  [column]
  (or (clojure.core/isa? (:semantic-type column) :type/FK)
      (clojure.core/isa? (:semantic-type column) :type/PK)))

(defn ^:export URL?
  "Is `column` a URL?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/URL))

(defn ^:export email?
  "Is `column` an email?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Email))

(defn ^:export avatar-URL?
  "Is `column` an avatar URL?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/AvatarURL))

(defn ^:export image-URL?
  "Is `column` an image URL?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/ImageURL))

(defn ^:export has-latitude-and-longitude?
  "Does the collection `columns` contain both a latitude and a longitude column?"
  [columns]
  (every? #(some % columns) [latitude? longitude?]))

(defn ^:export primary-key-pred
  "Return a prdicate for checking if a column is a primary key."
  [table-id]
  (fn primary-key-pred-for-table-id [column]
    (let [pk? (primary-key? column)]
      ;; comment from isa.js:
      ;; > FIXME: columns of nested questions at this moment miss table_id value
      ;; > which makes it impossible to match them with their tables that are nested cards
      (if (lib.u/string-table-id->card-id table-id)
        pk?
        (and pk? (= (:table-id column) table-id))))))
