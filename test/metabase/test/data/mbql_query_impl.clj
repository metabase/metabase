(ns metabase.test.data.mbql-query-impl
  "Internal implementation of `data/$ids` and `data/mbql-query` and related macros."
  (:require [clojure.string :as str]
            [clojure.walk :as walk]
            [metabase.models.field :refer [Field]]
            [toucan.db :as db]))

(defn- field-id-call
  "Replace a token string like `field` or `table.field` with a call to `data/id`."
  [source-table-symb token-str]
  (let [parts (str/split token-str #"\.")]
    (cons
     'metabase.test.data/id
     (if (= (count parts) 1)
       [(keyword source-table-symb) (keyword (first parts))]
       (map keyword parts)))))

(defn- token->type+args
  "Given a token string, return the matching Field clause "
  [token-str]
  (if-let [[_ source-token-str dest-token-str] (re-matches #"(^.*)->(.*$)" token-str)]
    [:-> source-token-str dest-token-str]
    [:normal token-str]))

(defmulti ^:private mbql-field
  "Convert `token-str` to MBQL and `data/id` calls using `strategy` for producing the result.

  *  `:id`      = return `:field` with integer ID
  *  `:raw`     = return raw Integer Field ID
  *  `:literal` = return `:field` with string name"
  {:arglists '([strategy token-type source-table-symb & tokens])}
  (fn [strategy token-type & _] [strategy token-type]))

(defmethod mbql-field [:id :normal]
  [_ _ source-table-symb token-str]
  [:field (field-id-call source-table-symb token-str) nil])

(defmethod mbql-field [:id :->]
  [_ _ source-table-symb source-token-str dest-token-str]
  [:field
   (field-id-call source-table-symb dest-token-str)
   {:source-field (field-id-call source-table-symb source-token-str)}])

(defmethod mbql-field [:raw :normal]
  [_ _ source-table-symb token-str]
  (field-id-call source-table-symb token-str))

(defmethod mbql-field [:raw :->]
  [_ _ source-table-symb source-token-str dest-token-str]
  (throw (ex-info "Error: It doesn't make sense to have an 'raw' -> form. (Don't know which ID to use.)"
           {:source-table-symb     source-table-symb
            :source-token-str source-token-str
            :dest-token-str   dest-token-str})))

(defn field-name [field-id]
  (db/select-one-field :name Field :id field-id))

(defn field-base-type [field-id]
  (db/select-one-field :base_type Field :id field-id))

(defn- field-literal [source-table-symb token-str]
  (if (str/includes? token-str "/")
    (let [[field-name field-type] (str/split token-str #"/")]
      [:field field-name {:base-type (keyword "type" field-type)}])
    [:field
     (list `field-name (field-id-call source-table-symb token-str))
     {:base-type (list `field-base-type (field-id-call source-table-symb token-str))}]))

(defmethod mbql-field [:literal :normal]
  [_ _ source-table-symb token-str]
  (field-literal source-table-symb token-str))

(defmethod mbql-field [:literal :->]
  [_ _ source-table-symb source-token-str dest-token-str]
  [:->
   (field-literal source-table-symb source-token-str)
   (field-literal source-table-symb dest-token-str)])


(defn- mbql-field-with-strategy [strategy source-table-symb token-str]
  (let [[token-type & args] (token->type+args token-str)]
    (apply mbql-field strategy token-type source-table-symb args)))

(defn- token->sigil [token]
  (when-let [[_ sigil] (re-matches #"^([$%*!&]{1,2}).*[\w/]$" (str token))]
    sigil))

(defmulti ^:private parse-token-by-sigil
  {:arglists '([source-table-symb token])}
  (fn [_ token]
    (when (symbol? token)
      (token->sigil token))))

(defmethod parse-token-by-sigil :default [_ token] token)

;; $ = wrapped Field ID
(defmethod parse-token-by-sigil "$"
  [source-table-symb token]
  (mbql-field-with-strategy :id source-table-symb (.substring (str token) 1)))

;; % = raw Field ID
(defmethod parse-token-by-sigil "%"
  [source-table-symb token]
  (mbql-field-with-strategy :raw source-table-symb (.substring (str token) 1)))

;; * = Field Literal
(defmethod parse-token-by-sigil "*"
  [source-table-symb token]
  (mbql-field-with-strategy :literal source-table-symb (.substring (str token) 1)))

;; & = Field qualified by JOIN ALIAS
(defmethod parse-token-by-sigil "&"
  [source-table-symb token]
  (if-let [[_ alias-name token] (re-matches #"^&([^.]+)\.(.+$)" (str token))]
    (let [[_ id-or-name opts] (parse-token-by-sigil source-table-symb (if (token->sigil token)
                                                                        (symbol token)
                                                                        (symbol (str \$ token))))]
      [:field id-or-name (assoc opts :join-alias alias-name)])
    (throw (ex-info "Error parsing token starting with '&'"
                    {:token token}))))

;; `!unit.<field> = datetime field
(defmethod parse-token-by-sigil "!"
  [source-table-symb token]
  (if-let [[_ unit token] (re-matches #"^!([^.]+)\.(.+$)" (str token))]
    (let [[_ id-or-name opts] (parse-token-by-sigil source-table-symb (if (token->sigil token)
                                                                   (symbol token)
                                                                   (symbol (str \$ token))))]
      [:field id-or-name (assoc opts :temporal-unit (keyword unit))])
    (throw (ex-info "Error parsing token starting with '!'" {:token token}))))

;; $$ = table ID.
(defmethod parse-token-by-sigil "$$"
  [_ token]
  (list 'metabase.test.data/id (keyword (.substring (str token) 2))))


(defn parse-tokens
  "Internal impl fn of `$ids` and `mbql-query` macros. Walk `body` and replace `$field` (and related) tokens with calls
  to `id`.

  Only Symbols that end with an alphanumeric character will parsed -- this way we don't accidentally try to parse
  something like a function call or dynamic variable."
  [source-table-symb-or-nil body]
  (walk/postwalk (partial parse-token-by-sigil source-table-symb-or-nil) body))

(defn wrap-inner-query
  "Internal impl fn of `data/mbql-query` macro."
  [inner-query]
  {:database (list 'metabase.test.data/id)
   :type     :query
   :query    inner-query})

(defn maybe-add-source-table
  "Internal impl fn of `data/mbql-query` macro. Add `:source-table` to `inner-query` unless it already has a
  `:source-table` or `:source-query` key."
  [inner-query table]
  (if (some (partial contains? inner-query) #{:source-table :source-query})
    inner-query
    (assoc inner-query :source-table (list 'metabase.test.data/id (keyword table)))))
