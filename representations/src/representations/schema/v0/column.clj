(ns representations.schema.v0.column
  (:require
   [clojure.string :as str]
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::column-name
  [:and
   {:description "Column name as returned by the query"}
   ::mc/non-blank-string])

(mr/def ::display-name
  [:and
   {:description "Human-friendly display name for the column"}
   ::mc/non-blank-string])

(mr/def ::column-description
  [:and
   {:description "Documentation explaining the column's meaning"}
   [:or
    :nil
    :string]])

(defn normalize-type-string
  "Convert type strings to internal keyword format.
   Expects strings like 'type/Text' or 'type/PK' and converts to :type/Text, :type/PK.
   Also handles already-keywordized values."
  [type-str]
  (when type-str
    (cond
      (keyword? type-str) type-str

      (string? type-str)
      (let [trimmed (str/trim type-str)]
        (cond
          (str/starts-with? trimmed ":")
          (keyword (subs trimmed 1))

          (str/includes? trimmed "/")
          (keyword trimmed)

          :else
          (keyword "type" trimmed)))

      :else nil)))

(mr/def ::base-type
  [:and
   {:description "The actual data type of the column (e.g., Text, Integer, DateTime)"
    :decode/json normalize-type-string}
   [:or
    :string
    :keyword]
   [:fn
    {:error/message "Must be a valid base type (not a semantic type)"
     :error/fn (fn [{:keys [value]} _]
                 (str "Not a valid base type: " (pr-str value)))}
    (fn [x]
      (let [type-kw (if (keyword? x) x (normalize-type-string x))]
        (and type-kw
             (isa? type-kw :type/*))))]])

(mr/def ::effective-type
  [:and
   {:description "How Metabase should treat this column (can override base_type)"
    :decode/json normalize-type-string}
   [:or
    :string
    :keyword]
   [:fn
    {:error/message "Must be a valid effective type"
     :error/fn (fn [{:keys [value]} _]
                 (str "Not a valid effective type: " (pr-str value)))}
    (fn [x]
      (let [type-kw (if (keyword? x) x (normalize-type-string x))]
        (and type-kw
             (isa? type-kw :type/*))))]])

(mr/def ::semantic-type
  [:and
   {:description "Semantic meaning of the column (e.g., Email, Currency, Entity Key)"
    :decode/json normalize-type-string}
   [:or
    :string
    :keyword]
   [:fn
    {:error/message "Must be a valid semantic type"
     :error/fn (fn [{:keys [value]} _]
                 (let [normalized (normalize-type-string value)]
                   (str "Not a recognized semantic type: " (pr-str value)
                        ". Got: " normalized
                        " which is not a :Semantic/* or :Relation/* type.")))}
    (fn [x]
      (let [type-kw (if (keyword? x) x (normalize-type-string x))]
        (when type-kw
          (or (isa? type-kw :Semantic/*)
              (isa? type-kw :Relation/*)))))]])

(mr/def ::visibility
  [:enum
   {:description "Column visibility setting"}
   "normal" "sensitive" "retired" "hidden"])

;; TODO: what to do here?
(mr/def ::currency
  [:and
   {:description "Currency code for financial columns (e.g., USD, EUR)"}
   ::mc/non-blank-string])

(mr/def ::column
  [:map
   {:closed true
    :description "Column metadata definition"}
   [:name ::column-name]
   [:display_name {:optional true} ::display-name]
   [:description {:optional true} ::column-description]
   [:base_type {:optional true} ::base-type]
   [:effective_type {:optional true} ::effective-type]
   [:semantic_type {:optional true} ::semantic-type]
   [:visibility {:optional true} ::visibility]
   [:currency {:optional true} ::currency]])

(mr/def ::columns
  [:sequential
   {:description "Array of column metadata definitions"}
   ::column])
