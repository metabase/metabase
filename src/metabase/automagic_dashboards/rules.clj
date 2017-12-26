(ns metabase.automagic-dashboards.rules
  (:require [clojure.string :as str]
            [metabase.types]
            [metabase.util.schema :as su]
            [schema
             [coerce :as sc]
             [core :as s]]
            [yaml.core :as yaml]))

(def ^Integer max-score 100)

(def Score (s/constrained s/Int #(<= 0 % max-score)))

(def MBQL [s/Any])

(def Identifier s/Str)

(def Metric {Identifier {(s/required-key :metric) MBQL
                         (s/required-key :score)  Score}})

(def Filter {Identifier {(s/required-key :filter) MBQL
                         (s/required-key :score)  Score}})

(defn- field-type?
  [t]
  (isa? t :type/Field))

(defn- table-type?
  [t]
  (isa? t :type/Table))

(defn ga-dimension?
  "Does string `t` denote a Google Analytics dimension?"
  [t]
  (str/starts-with? t "ga:"))

(def TableType (s/constrained s/Keyword table-type?))
(def FieldType (s/either (s/constrained s/Str ga-dimension?)
                         (s/constrained s/Keyword field-type?)))

(def FieldSpec (s/either [FieldType]
                         [(s/one TableType "table") FieldType]))

(def Dimension {Identifier {(s/required-key :field_type) FieldSpec
                            (s/required-key :score)      Score}})

(def OrderByPair {Identifier (s/enum "descending" "ascending")})

(def Visualization [(s/one s/Str "visualization") su/Map])

(def Card {Identifier {(s/required-key :title)         s/Str
                       (s/optional-key :dimensions)    [s/Str]
                       (s/optional-key :filters)       [s/Str]
                       (s/optional-key :metrics)       [s/Str]
                       (s/optional-key :limit)         su/IntGreaterThanZero
                       (s/optional-key :order_by)      [OrderByPair]
                       (s/required-key :visualization) Visualization
                       (s/optional-key :description)   s/Str
                       (s/required-key :score)         Score}})

(def Rules {(s/required-key :table_type)  TableType
            (s/required-key :title)       s/Str
            (s/optional-key :description) s/Str
            (s/optional-key :metrics)     [Metric]
            (s/optional-key :filters)     [Filter]
            (s/optional-key :dimensions)  [Dimension]
            (s/required-key :cards)       [Card]})

(defn- with-defaults
  [defaults]
  (fn [x]
    (let [[identifier definition] (first x)]
      {identifier (merge defaults definition)})))

(defn- shorthand-definition
  [k]
  (fn [x]
    (let [[identifier definition] (first x)]
      (if (map? definition)
        x
        {identifier {k definition}}))))

(defn- ensure-seq
  [x]
  (if (sequential? x)
    x
    [x]))

(defn- ->type
  [x]
  (cond
    (keyword? x)      x
    (ga-dimension? x) x
    :else             (keyword "type" x)))

(def ^:private rules-validator
  (sc/coercer!
   Rules
   {[s/Str]       ensure-seq
    [OrderByPair] ensure-seq
    FieldSpec     (fn [x]
                    (map ->type (str/split x #"\.")))
    OrderByPair   (fn [x]
                    (if (string? x)
                      {x "ascending"}
                      x))
    Visualization (fn [x]
                    (if (string? x)
                      [x {}]
                      (first x)))
    Metric        (comp (with-defaults {:score max-score})
                        (shorthand-definition :metric))
    Dimension     (comp (with-defaults {:score max-score})
                        (shorthand-definition :field_type))
    Filter        (comp (with-defaults {:score max-score})
                        (shorthand-definition :filter))
    Card          (with-defaults {:score max-score})
    TableType     ->type
    FieldType     ->type
    Identifier    (fn [x]
                    (if (keyword? x)
                      (name x)
                      x))}))

(def ^:private rules-dir "resources/automagic_dashboards")

(defn load-rules
  []
  (->> rules-dir
       clojure.java.io/file
       file-seq
       (filter (memfn ^java.io.File isFile))
       (map (fn [f]
              (-> f
                  slurp
                  yaml/parse-string
                  (update :table_type #(or % (->> f
                                                  .getName
                                                  (re-find #".+(?=\.yaml)"))))
                  rules-validator)))))

(defn -main [& _]
  (doall (load-rules))
  (System/exit 0))
