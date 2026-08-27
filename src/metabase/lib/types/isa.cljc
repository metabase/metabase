(ns metabase.lib.types.isa
  "Ported from frontend/src/metabase-lib/types/utils/isa.js"
  (:refer-clojure :exclude [isa? any? boolean? string? integer? some])
  (:require
   [metabase.lib.types.constants :as lib.types.constants]
   [metabase.types.core]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some]]))

(comment metabase.types.core/keep-me)

(mu/defn ^:export isa? :- :boolean
  "Decide if `_column` is a subtype of the type denoted by the keyword `type-kw`.
  Both effective and semantic types are taken into account."
  [{:keys [effective-type base-type semantic-type] :as _column} type-kw]
  (or (clojure.core/isa? (or effective-type base-type) type-kw)
      (clojure.core/isa? semantic-type type-kw)))

(mu/defn ^:export field-type? :- :boolean
  "Returns if `column` is of category `category`.
  The possible categories are the keys in [[metabase.lib.types.constants/type-hierarchies]]."
  [category column]
  (let [type-definition (lib.types.constants/type-hierarchies category)
        column          (cond-> column
                          (and (map? column)
                               (not (:effective-type column)))
                          (assoc :effective-type (:base-type column)))]
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

(defn column-type
  "Returns the :effective-type of `column`, if set. Otherwise, returns the :base-type."
  [column]
  (or (:effective-type column) (:base-type column)))

(mu/defn ^:export temporal? :- :boolean
  "Is `column` of a temporal type?"
  [column]
  (field-type? ::lib.types.constants/temporal column))

(mu/defn ^:export numeric? :- :boolean
  "Is `column` of a numeric type?"
  [column]
  (field-type? ::lib.types.constants/number column))

(mu/defn ^:export boolean? :- :boolean
  "Is `column` of a boolean type?"
  [column]
  (field-type? ::lib.types.constants/boolean column))

(mu/defn ^:export string? :- :boolean
  "Is `column` of a string type?"
  [column]
  (field-type? ::lib.types.constants/string column))

(mu/defn ^:export string-like? :- :boolean
  "Is `column` of a temporal type?"
  [column]
  (field-type? ::lib.types.constants/string_like column))

(mu/defn ^:export string-or-string-like? :- :boolean
  "Is `column` of a temporal type?"
  [column]
  (or (string? column) (string-like? column)))

(mu/defn ^:export summable? :- :boolean
  "Is `column` of a summable type?"
  [column]
  (field-type? ::lib.types.constants/summable column))

(mu/defn ^:export scope? :- :boolean
  "Is `column` of a scope type?"
  [column]
  (field-type? ::lib.types.constants/scope column))

(mu/defn ^:export category? :- :boolean
  "Is `column` of a categorical type?"
  [column]
  (field-type? ::lib.types.constants/category column))

(mu/defn ^:export location? :- :boolean
  "Is `column` a location?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Location))

(mu/defn ^:export description? :- :boolean
  "Is `column` a description?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Description))

(mu/defn ^:export foreign-key? :- :boolean
  "Is `column` a foreign-key?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/FK))

(mu/defn ^:export primary-key? :- :boolean
  "Is `column` a primary-key?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/PK))

(mu/defn ^:export entity-name? :- :boolean
  "Is `column` an entity name?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Name))

(mu/defn ^:export title? :- :boolean
  "Is `column` a title column?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Title))

(mu/defn ^:export json? :- :boolean
  "Is `column` a serialized JSON column?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/SerializedJSON))

(mu/defn ^:export xml? :- :boolean
  "Is `column` a serialized XML column?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/XML))

(mu/defn ^:export structured? :- :boolean
  "Is `column` serialized structured data? (eg. JSON, XML)"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Structured))

(mu/defn ^:export any? :- :boolean
  "Is this `_column` whatever (including nil)?"
  [_column]
  true)

(mu/defn ^:export date-or-datetime? :- :boolean
  "Is `column` a date or datetime?"
  [column]
  (clojure.core/isa? (column-type column) :type/HasDate))

(mu/defn ^:export date-without-time? :- :boolean
  "Is `column` a date without time?"
  [column]
  (clojure.core/isa? (column-type column) :type/Date))

(mu/defn ^:export date-with-time? :- :boolean
  "Is `column` a datetime (date with time)?"
  [column]
  (clojure.core/isa? (column-type column) :type/DateTime))

(mu/defn ^:export creation-timestamp? :- :boolean
  "Is `column` a creation timestamp column?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/CreationTimestamp))

(mu/defn ^:export creation-date? :- :boolean
  "Is `column` a creation date column?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/CreationDate))

(mu/defn ^:export creation-time? :- :boolean
  "Is `column` a creation time column?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/CreationTime))

(mu/defn ^:export integer? :- :boolean
  "Is `column` a integer column?"
  [column]
  (field-type? ::lib.types.constants/integer column))

(mu/defn ^:export time? :- :boolean
  "Is `column` a time?"
  [column]
  (clojure.core/isa? (column-type column) :type/Time))

(mu/defn ^:export address? :- :boolean
  "Is `column` an address?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Address))

(mu/defn ^:export city? :- :boolean
  "Is `column` a city?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/City))

(mu/defn ^:export state? :- :boolean
  "Is `column` a state?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/State))

(mu/defn ^:export zip-code? :- :boolean
  "Is `column` a zip-code?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/ZipCode))

(mu/defn ^:export country? :- :boolean
  "Is `column` a country?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Country))

(mu/defn ^:export coordinate? :- :boolean
  "Is `column` a coordinate?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Coordinate))

(mu/defn ^:export latitude? :- :boolean
  "Is `column` a latitude?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Latitude))

(mu/defn ^:export longitude? :- :boolean
  "Is `column` a longitude?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Longitude))

(mu/defn ^:export currency? :- :boolean
  "Is `column` a currency?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Currency))

(mu/defn ^:export comment? :- :boolean
  "Is `column` a comment?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Comment))

(mu/defn ^:export id? :- :boolean
  "Is `column` an ID?"
  [column]
  (or (clojure.core/isa? (:semantic-type column) :type/FK)
      (clojure.core/isa? (:semantic-type column) :type/PK)))

(mu/defn ^:export URL? :- :boolean
  "Is `column` a URL?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/URL))

(mu/defn ^:export email? :- :boolean
  "Is `column` an email?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/Email))

(mu/defn ^:export avatar-URL? :- :boolean
  "Is `column` an avatar URL?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/AvatarURL))

(mu/defn ^:export image-URL? :- :boolean
  "Is `column` an image URL?"
  [column]
  (clojure.core/isa? (:semantic-type column) :type/ImageURL))

;;; TODO -- This stuff should probably use the constants in [[metabase.lib.types.constants]], however this logic isn't
;;; supposed to include things with semantic type = Category which the `::string` constant define there includes.
(defn searchable?
  "Is this column one that we should show a search widget for (to search its values) in the QB filter UI? If so, we can
  give it a `has-field-values` value of `:search`."
  [column]
  ;; For the time being we will consider something to be "searchable" if it's a text Field since the `starts-with`
  ;; filter that powers the search queries (see [[metabase.parameters.field/search-values]]) doesn't work on anything else
  (let [col-type (column-type column)]
    (or (clojure.core/isa? col-type :type/Text)
        (clojure.core/isa? col-type :type/TextLike))))

(defn compatible-type?
  "Given two columns, returns true if they have compatible types.

  That's the case if both are from the same family (strings, numbers, dates/datetimes, times, booleans) or if
  `src-column`'s base-type is a subtype of `dst-column`'s base-type."
  [src-column dst-column]
  (or
   (and (string? src-column)   (string? dst-column))
   (and (numeric? src-column)  (numeric? dst-column))
   (and (date-without-time? src-column) (date-or-datetime? dst-column))
   (and (date-with-time? src-column) (date-with-time? dst-column))
   (and (time? src-column) (time? dst-column))
   (and (boolean? src-column)  (boolean? dst-column))
   (clojure.core/isa? (:base-type src-column) (:base-type dst-column))))
