(ns metabase.util.malli.describe
  "This is a temporary fix while this PR is getting mulled over:
  https://github.com/metosin/malli/pull/805

  If malli is > 0.9.2 we can remove this, and use link^ instead."
  (:require [clojure.string :as str]
            [malli.core :as mc]))

(declare -describe describe)

(defprotocol Descriptor (-accept [this children options] "transforms schema to a text descriptor"))

(defn- diamond [s] (str "<" s ">"))
(defn- titled [schema] (if-let [t (-> schema mc/properties :title)] (str "(titled: ‘" t "’) ") ""))

(defn- min-max-suffix [schema]
  (let [{:keys [min max]} (-> schema mc/properties)]
    (cond
      (and min max) (str " between " min " and " max " inclusive")
      min (str " greater than " min)
      max (str " less than " max)
      :else "")))

(defn- length-suffix [schema]
  (let [{:keys [min max]} (-> schema mc/properties)]
    (cond
      (and min max) (str " with length between " min " and " max " inclusive")
      min (str " with length >= " min)
      max (str " with length <= " max)
      :else "")))

(defn- pluralize-times [n]
  (when n
    (if (= 1 n) "time" "times")))

(defn- repeat-suffix [schema]
  (let [{:keys [min max]} (-> schema mc/properties)
        min-timez (pluralize-times min)
        max-timez (pluralize-times max)]
    (cond
      (and min max) (str " at least " min " " min-timez ", up to " max " " max-timez)
      min           (str " at least " min " " min-timez)
      max           (str " at most " max " " max-timez)
      :else         "")))

(defn- min-max-suffix-number [schema]
  (let [{:keys [min max]} (-> schema mc/properties)]
    (cond
      (and min max) (str " between " min " and " max " inclusive")
      min (str " greater than or equal to " min)
      max (str " less than or equal to " max)
      :else "")))

(defmulti accept
  "Can this be accepted?"
  (fn [name _schema _children _options] name) :default ::default)

(defmethod accept ::default [name schema children {:keys [missing-fn]}] (if missing-fn (missing-fn name schema children) ""))

(defn- -schema [schema children _options]
  (let [just-one (= 1 (count (:registry (mc/properties schema))))]
    (str (last children)
         (when (:registry (mc/properties schema))
           (str " "
                (when-not just-one "which is: ")
                (diamond
                 (str/join ", "
                           (for [[name schema] (:registry (mc/properties schema))]
                             (str (when-not just-one (str name " is "))
                                  (describe schema))))))))))

(defmethod accept :schema [_ schema children options] (-schema schema children options))
(defmethod accept ::mc/schema [_ schema children options] (-schema schema children options))
(defmethod accept :ref [_ _schema children _] (pr-str (first children)))

(defmethod accept 'ident? [_ _ _ _] "ident")
(defmethod accept 'simple-ident? [_ _ _ _] "simple-ident")

(defmethod accept 'uuid? [_ _ _ _] "uuid")
(defmethod accept 'uri? [_ _ _ _] "uri")
(defmethod accept 'decimal? [_ _ _ _] "decimal")
(defmethod accept 'inst? [_ _ _ _] "inst (aka date time)")
(defmethod accept 'seqable? [_ _ _ _] "seqable")
(defmethod accept 'indexed? [_ _ _ _] "indexed")
(defmethod accept 'vector? [_ _ _ _] "vector")
(defmethod accept 'list? [_ _ _ _] "list")
(defmethod accept 'seq? [_ _ _ _] "seq")
(defmethod accept 'char? [_ _ _ _] "char")
(defmethod accept 'set? [_ _ _ _] "set")

(defmethod accept 'false? [_ _ _ _] "false")
(defmethod accept 'true? [_ _ _ _] "true")
(defmethod accept 'zero? [_ _ _ _] "zero")
(defmethod accept 'rational? [_ _ _ _] "rational")
(defmethod accept 'coll? [_ _ _ _] "collection")
(defmethod accept 'empty? [_ _ _ _] "empty")
(defmethod accept 'associative? [_ _ _ _] "is associative")
(defmethod accept 'ratio? [_ _ _ _] "ratio")
(defmethod accept 'bytes? [_ _ _ _] "bytes")
(defmethod accept 'ifn? [_ _ _ _] "implmenets IFn")
(defmethod accept 'fn? [_ _ _ _] "function")

(defmethod accept :>  [_ _ [value] _] (str "> " value))
(defmethod accept :>= [_ _ [value] _] (str ">= " value))
(defmethod accept :<  [_ _ [value] _] (str "< " value))
(defmethod accept :<= [_ _ [value] _] (str "<= " value))
(defmethod accept :=  [_ _ [value] _] (str "must equal " value))
(defmethod accept :not= [_ _ [value] _] (str "not equal " value))
(defmethod accept :not [_ _ children _] {:not (last children)})

(defmethod accept :multi [_ s children _]
  (let [dispatcher (or (-> s mc/properties :dispatch-description)
                       (-> s mc/properties :dispatch))]
    (str "one of "
         (diamond
          (str/join " | " (map (fn [[title _ shape]] (str title " = " shape)) children)))
         " dispatched by " dispatcher)))

(defmethod accept :map-of [_ schema children _]
  (str "map " (titled schema) "from " (diamond (first children)) " to " (diamond (second children)) (length-suffix schema)))

(defn- of-clause [children] (when children (str " of " (first children))))

(defmethod accept 'vector? [_ schema children _] (str "vector" (titled schema) (length-suffix schema) (of-clause children)))
(defmethod accept :vector [_ schema children _] (str "vector" (titled schema) (length-suffix schema) (of-clause children)))

(defmethod accept 'sequential? [_ schema children _] (str "sequence" (titled schema) (length-suffix schema) (of-clause children)))
(defmethod accept :sequential [_ schema children _] (str "sequence" (titled schema) (length-suffix schema) (of-clause children)))

(defmethod accept 'set? [_ schema children _] (str "set" (titled schema) (length-suffix schema) (of-clause children)))
(defmethod accept :set [_ schema children _] (str "set" (titled schema) (length-suffix schema) (of-clause children)))

(defmethod accept 'string? [_ schema _ _] (str "string" (titled schema) (length-suffix schema)))
(defmethod accept :string [_ schema _ _] (str "string" (titled schema) (length-suffix schema)))

(defmethod accept 'number? [_ schema _ _] (str "number" (titled schema) (min-max-suffix schema)))
(defmethod accept :number [_ schema _ _] (str "number" (titled schema) (min-max-suffix schema)))

(defmethod accept 'pos-int? [_ schema _ _] (str "integer greater than 0" (titled schema) (min-max-suffix schema)))
(defmethod accept :pos-int [_ schema _ _] (str "integer greater than 0" (titled schema) (min-max-suffix schema)))

(defmethod accept 'neg-int? [_ schema _ _] (str "integer less than 0" (titled schema) (min-max-suffix schema)))
(defmethod accept :neg-int [_ schema _ _] (str "integer less than 0" (titled schema) (min-max-suffix schema)))

(defmethod accept 'nat-int? [_ schema _ _] (str "natural integer" (titled schema) (min-max-suffix schema)))
(defmethod accept :nat-int [_ schema _ _] (str "natural integer" (titled schema) (min-max-suffix schema)))

(defmethod accept 'float? [_ schema _ _] (str "float" (titled schema) (min-max-suffix schema)))
(defmethod accept :float [_ schema _ _] (str "float" (titled schema) (min-max-suffix schema)))

(defmethod accept 'pos? [_ schema _ _] (str "number greater than 0" (titled schema) (min-max-suffix schema)))
(defmethod accept :pos [_ schema _ _] (str "number greater than 0" (titled schema) (min-max-suffix schema)))

(defmethod accept 'neg? [_ schema _ _] (str "number less than 0" (titled schema) (min-max-suffix schema)))
(defmethod accept :neg [_ schema _ _] (str "number less than 0" (titled schema) (min-max-suffix schema)))

(defmethod accept 'integer? [_ schema _ _] (str "integer" (titled schema) (min-max-suffix-number schema)))
(defmethod accept 'int? [_ schema _ _] (str "integer" (titled schema) (min-max-suffix-number schema)))
(defmethod accept :int [_ schema _ _] (str "integer" (titled schema) (min-max-suffix-number schema)))

(defmethod accept 'double? [_ schema _ _] (str "double" (titled schema) (min-max-suffix-number schema)))
(defmethod accept :double [_ schema _ _] (str "double" (titled schema) (min-max-suffix-number schema)))

(defmethod accept :merge [_ schema _ options] ((::describe options) (mc/deref schema) options))
(defmethod accept :union [_ schema _ options] ((::describe options) (mc/deref schema) options))
(defmethod accept :select-keys [_ schema _ options] ((::describe options) (mc/deref schema) options))

(defmethod accept :and [_ s children _] (str (str/join ", and " children) (titled s)))
(defmethod accept :enum [_ s children _options] (str "enum" (titled s) " of " (str/join ", " children)))
(defmethod accept :maybe [_ s children _] (str "nullable " (titled s) (first children)))
(defmethod accept :tuple [_ s children _] (str "vector " (titled s) "with exactly " (count children) " items of type: " (str/join ", " children)))
(defmethod accept :re [_ s _ options] (str "regex pattern " (titled s) "matching " (pr-str (first (mc/children s options)))))

(defmethod accept 'any? [_ s _ _] (str "anything" (titled s)))
(defmethod accept :any [_ s _ _] (str "anything" (titled s)))

(defmethod accept 'some? [_ _ _ _] "anything but null")
(defmethod accept :some [_ _ _ _] "anything but null")

(defmethod accept 'nil? [_ _ _ _] "null")
(defmethod accept :nil [_ _ _ _] "null")

(defmethod accept 'qualified-ident? [_ _ _ _] "qualified-ident")
(defmethod accept :qualified-ident [_ _ _ _] "qualified-ident")

(defmethod accept 'simple-keyword? [_ _ _ _] "simple-keyword")
(defmethod accept :simple-keyword [_ _ _ _] "simple-keyword")

(defmethod accept 'simple-symbol? [_ _ _ _] "simple-symbol")
(defmethod accept :simple-symbol [_ _ _ _] "simple-symbol")

(defmethod accept 'qualified-keyword? [_ _ _ _] "qualified-keyword")
(defmethod accept :qualified-keyword [_ _ _ _] "qualified keyword")

(defmethod accept 'symbol? [_ _ _ _] "symbol")
(defmethod accept :symbol [_ _ _ _] "symbol")

(defmethod accept 'qualified-symbol? [_ _ _ _] "qualified-symbol")
(defmethod accept :qualified-symbol [_ _ _ _] "qualified symbol")
(defmethod accept :uuid [_ _ _ _] "uuid")

(defmethod accept :=> [_ s _ _]
  (let [{:keys [input output]} (mc/-function-info s)]
    (str "function that takes input: [" (describe input) "] and returns " (describe output))))

(defmethod accept :function [_ _ _children _] "function")
(defmethod accept :fn [_ _ _ _] "function")

(defn- tagged [children]
  (map (fn [[tag _ c]] (str c " (tag: " tag ")")) children))

(defmethod accept :or [_ _ children _] (str/join ", or " children))
(defmethod accept :orn [_ _ children _] (str/join ", or " (tagged children)))

(defmethod accept :cat [_ _ children _] (str/join ", " children))
(defmethod accept :catn [_ _ children _] (str/join ", and " (tagged children)))

(defmethod accept :alt [_ _ children _] (str/join ", or " children))
(defmethod accept :altn [_ _ children _] (str/join ", or " (tagged children)))

(defmethod accept :+ [_ _ children _] (str "one or more " (str/join ", " children)))
(defmethod accept :* [_ _ children _] (str "zero or more " (str/join ", " children)))
(defmethod accept :? [_ _ children _] (str "zero or one " (str/join ", " children)))

(defmethod accept :repeat [_ schema children _]
  (str "repeat " (diamond (first children)) (repeat-suffix schema)))

(defmethod accept 'boolean? [_ _ _ _] "boolean")
(defmethod accept :boolean [_ _ _ _] "boolean")

(defmethod accept 'keyword? [_ _ _ _] "keyword")
(defmethod accept :keyword [_ _ _ _] "keyword")

(defn- -map [_n schema children _o]
  (let [optional (set (->> children (filter (mc/-comp :optional second)) (mapv first)))
        additional-properties (:closed (mc/properties schema))
        kv-description (str/join ", " (map (fn [[k _ s]] (str k (when (contains? optional  k) " (optional)") " -> " (diamond s))) children))]
    (str/trim
     (cond-> (str "map " (titled schema))
       (seq kv-description) (str "where {" kv-description "} ")
       additional-properties (str "with no other keys ")))))

(defmethod accept ::mc/val [_ _ children _] (first children))
(defmethod accept 'map? [n schema children o] (-map n schema children o))
(defmethod accept :map [n schema children o] (-map n schema children o))

(defn- -descriptor-walker [schema _ children options]
  (let [p (merge (mc/type-properties schema) (mc/properties schema))]
    (or (get p :description)
        (if (satisfies? Descriptor schema)
          (-accept schema children options)
          (accept (mc/type schema) schema children options)))))

(defn- -describe [?schema options]
  (mc/walk ?schema -descriptor-walker options))

;;
;; public api
;;

(defn describe
  "Given a schema, returns a string explaiaing the required shape in English"
  ([?schema]
   (describe ?schema nil))
  ([?schema options]
   (let [definitions (atom {})
         options (merge options
                        {::mc/walk-entry-vals true,
                         ::definitions definitions,
                         ::describe -describe})]
     (str/trim (str (-describe ?schema options))))))
