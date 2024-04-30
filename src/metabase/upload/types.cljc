(ns metabase.upload.types
  (:refer-clojure :exclude [make-hierarchy])
  (:require
   [clojure.string :as str]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.ordered-hierarchy :as ordered-hierarchy :refer [make-hierarchy]]))

;; Upload value-types form a directed acyclic graph where each type can be relaxed into any of its ancestors.
;; We parse each value in the CSV file to the most-specific possible type for each column.

;; The most-specific possible type for a column is the closest common ancestor of the types for each value in the
;; column, found by walking through the graph in topological order, following edges from left to right.
;; Note that this type is not guaranteed to be one of the least common ancestors!
;;
;; See [[metabase.util.ordered-hierarchy/first-common-ancestor]] for more details.
;;
;; <pre><code>
;;
;;              text
;;               |
;;               |
;;          varchar-255──────
;;        /      /  \        \
;;      /      /      \       \
;;  boolean  float   datetime  offset-datetime
;;     |       │        │
;;     |       │        │
;;     │ *float-or-int* │
;;     │       │        │
;;     │       │        │
;;     |      int      date
;;     |   /       \
;;     |  /         \
;; *boolean-int*  auto-incrementing-int-pk
;;
;; </code></pre>
;;
;; We have a number of special "abstract" nodes in this graph:
;;
;; - `*boolean-int*` is an ambiguous node, that could either be parsed as a boolean or as an integer.
;; - `*float-or-int*` is any integer, whether it has an explicit decimal point or not.
;;
;; While a `*boolean-int*` is a genuinely ambiguous value, `*float-or-int*` exist to power our desired value-type
;; coercion and column-type promotion behaviour.
;;
;; - If we encounter a `*float-or-int*` inside an `int` column, then we can safely coerce it down to an integer.
;; - If we encounter a `float` (i.e. a non-zero fraction component), then we need to promote the column to a `float.`
;;
;; Columns can not have an abstract type, which has no meaning outside of inference and reconciliation.
;; If we are left with an abstract type after having processed all the values, we first check whether we can coerce
;; the type to the existing column type, and otherwise traverse further up the graph until we reach a concrete type.
;;
;; For ease of reference and explicitness these corresponding values are given in the `abstract->concrete` map.
;; One can figure out these mappings by simply looking up through the ancestors. For now, we require that it is always
;; a direct ancestor, and lay out or graph so that it is the left-most one.

(def h
  "This hierarchy defines a relationship between value types and their specializations.
  We use an [[metabase.util.ordered-hierarchy]] for its topological sorting, which simplify writing efficient and
  consistent implementations for of our type inference, parsing, and relaxation."
  (make-hierarchy
   [::text
    [::varchar-255
     [::boolean ::*boolean-int*]
     [::float
      ;; A number value with a decimal separator, but a zero fractional component.
      [::*float-or-int*
       [::int
        ;; A value that could be legally parsed as either a boolean OR an integer
        ::*boolean-int*
        ::auto-incrementing-int-pk]]]
     [::datetime ::date]
     ::offset-datetime]]))

(def ^:private abstract->concrete
  "Not all value types correspond to column types. We refer to these as \"abstract\" types, and give them *ear-muffs*.
  This maps implicitly defines the abstract types, by mapping them each to a default concretion."
  {::*boolean-int*  ::boolean
   ::*float-or-int* ::float})

;; TODO: the set of allowed promotions should be driver-specific, because not all drivers support coercions between all
;; types e.g. redshift does not allow coercions except between text types
(def ^:private allowed-promotions
  "A mapping of which types a column can be implicitly relaxed to, based on the content of appended values.
  If we require a relaxation which is not allow-listed here, we will reject the corresponding file."
  {::int #{::float}})

(def ^:private column-type->coercible-value-types
  "A mapping of which value types should be coerced to the given existing type, rather than triggering promotion."
  {::int #{::*float-or-int*}})

(defn- coerce?
  "Can values of the given type be coerced to the given existing column type, in a lossless fashion?"
  [column-type value-type]
  (contains? (column-type->coercible-value-types column-type) value-type))

(def value-types
  "All type tags which values can be inferred as. An ordered set from most to least specialized."
  (ordered-hierarchy/sorted-tags h))

(def column-types
  "All type tags that correspond to concrete column types."
  (into #{} (remove abstract->concrete) value-types))

(defn- column-type?
  [value-type]
  (contains? column-types value-type))

(defn concretize
  "Determine the desired column-type given the existing column-type (nil if it's new) and the value-type of the data.
  If there's a valid coercion to the existing type, we will preserve it, but otherwise we will relax abstract types
  further to a concrete type."
  [existing-type value-type]
  (cond
    ;; If the type is concrete, there is nothing to do.
    (column-type? value-type) value-type
    ;; If we know nothing about the value type, treat it as an arbitrary string.
    (nil? value-type) ::text
    ;; If configured, coerce the value to the existing type
    (coerce? existing-type value-type) existing-type
    ;; Otherwise, project it to its canonical concretion.
    :else (abstract->concrete value-type)))

;;;;;;;;;;;;;;;;;;;;;;;;;;
;; [[value->type]] helpers

(defn- with-parens
  "Returns a regex that matches the argument, with or without surrounding parentheses."
  [number-regex]
  (re-pattern (str "(" number-regex ")|(\\(" number-regex "\\))")))

(defn- with-currency
  "Returns a regex that matches a positive or negative number, including currency symbols"
  [number-regex]
  ;; currency signs can be all over: $2, -$2, $-2, 2€
  (re-pattern (str upload-parsing/currency-regex "?\\s*-?"
                   upload-parsing/currency-regex "?"
                   number-regex
                   "\\s*" upload-parsing/currency-regex "?")))

(defn- int-regex
  "Matches numbers which do not have a decimal separator."
  [number-separators]
  (with-parens
   (with-currency
    (case number-separators
      ("." ".,") #"\d[\d,]*"
      ",." #"\d[\d.]*"
      ", " #"\d[\d \u00A0]*"
      ".’" #"\d[\d’]*"))))

(defn- float-or-int-regex
  "Matches integral numbers, even if they have a decimal separator - e.g. 2 or 2.0"
  [number-separators]
  (with-parens
   (with-currency
    (case number-separators
      ("." ".,") #"\d[\d,]*(\.0+)?"
      ",." #"\d[\d.]*(\,[0]+)?"
      ", " #"\d[\d \u00A0]*(\,[0.]+)?"
      ".’" #"\d[\d’]*(\.[0.]+)?"))))

(defn- float-regex
  "Matches numbers, regardless of whether they have a decimal separator - e.g. 2, 2.0, or 2.2"
  [number-separators]
  (with-parens
   (with-currency
    (case number-separators
      ("." ".,") #"\d[\d,]*(\.\d+)?"
      ",." #"\d[\d.]*(\,[\d]+)?"
      ", " #"\d[\d \u00A0]*(\,[\d.]+)?"
      ".’" #"\d[\d’]*(\.[\d.]+)?"))))

(defmacro does-not-throw?
  "Returns true if the given body does not throw an exception."
  [body]
  `(try
     ~body
     true
     (catch Throwable _e#
       false)))

(defn- date-string? [s]
  (does-not-throw? (upload-parsing/parse-local-date s)))

(defn- datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-local-datetime s)))

(defn- offset-datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-offset-datetime s)))

(defn- boolean-string? [s]
  (boolean (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" s)))

(defn- boolean-int-string? [s]
  (contains? #{"0" "1"} s))

(defn- varchar-255? [s]
  (<= (count s) 255))

(defn- regex-matcher [regex]
  (fn [s]
    (boolean (re-matches regex s))))

;; end [[value->type]] helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ^:private non-inferable-types
  #{::auto-incrementing-int-pk})

(def ^:private type->check-schema
  "Every inferable value-type needs to have a detection function registered."
  (into [:map] (map #(vector % [:=> [:cat :string] :boolean])
                    (remove non-inferable-types value-types))))

(mu/defn ^:private settings->type->check :- type->check-schema
  [{:keys [number-separators] :as _settings}]
  (let [int-string?   (regex-matcher (int-regex number-separators))
        float-or-int? (regex-matcher (float-or-int-regex number-separators))
        float-string? (regex-matcher (float-regex number-separators))]
    {::*boolean-int*   boolean-int-string?
     ::boolean         boolean-string?
     ::offset-datetime offset-datetime-string?
     ::date            date-string?
     ::datetime        datetime-string?
     ::int             int-string?
     ::*float-or-int*  float-or-int?
     ::float           float-string?
     ::varchar-255     varchar-255?
     ::text            (constantly true)}))

(defn- value->type
  "Determine the most specific type that is compatible with the given value.
  Numbers are assumed to use separators corresponding to the locale defined in the application settings"
  [type->check value]
  (when-not (str/blank? value)
    (let [trimmed (str/trim value)]
      (->> (remove non-inferable-types value-types)
           (filter #((type->check %) trimmed))
           first))))

(defn- relax-type
  "Given an existing column type, and a new value, relax the type until it includes the value."
  [type->check current-type value]
  (cond (nil? value) current-type
        (nil? current-type) (value->type type->check value)
        :else (let [trimmed (str/trim value)]
                (if (str/blank? trimmed)
                  current-type
                  (->> (cons current-type (ancestors h current-type))
                       (filter #((type->check %) trimmed))
                       first)))))

(defn type-relaxer
  "Given a map of {value-type -> predicate}, return a reducing fn which updates our inferred schema using the next row."
  [settings]
  (let [relax (partial relax-type (settings->type->check settings))]
    (fn [value-types row]
      ;; It's important to realize this lazy sequence, because otherwise we can build a huge stack and overflow.
      (vec (u/map-all relax value-types row)))))

(mu/defn column-types-from-rows :- [:sequential (into [:enum] column-types)]
  "Given the types of the existing columns (if there are any), and rows to be added, infer the best supporting types."
  [settings existing-types rows]
  (->> (reduce (type-relaxer settings) existing-types rows)
       (u/map-all concretize existing-types)))

(defn base-type->upload-type
  "Returns the most specific upload type for the given base type."
  [base-type]
  (when base-type
    (condp #(isa? %2 %1) base-type
      :type/Float                  ::float
      :type/BigInteger             ::int
      :type/Integer                ::int
      :type/Boolean                ::boolean
      :type/DateTimeWithTZ         ::offset-datetime
      :type/DateTime               ::datetime
      :type/Date                   ::date
      :type/Text                   ::text)))

(defn- promotable?
  "Are we allowed to promote a column's schema from `current-type` to `inferred-type`?"
  [current-type inferred-type]
  (when-let [allowed? (allowed-promotions current-type)]
    (allowed? inferred-type)))

(defn new-type
  "Given the `current-type` of a column, and an `inferred-type` for new values to be added, return its new type.
  This assumes we have already coerced the new values down to the existing type, if possible."
  [current-type inferred-type]
  (cond
    ;; No restriction on new columns
    (nil? current-type) inferred-type
    ;; No changes required if inferred type matches
    (= current-type inferred-type) current-type
    :else
    ;; Keep the existing type unless a promotion is allowed.
    (if (promotable? current-type inferred-type)
      inferred-type
      current-type)))
