(ns metabase.test.data.mbql-query-impl
  "Internal implementation of `data/$ids` and `data/mbql-query` and related macros."
  (:require [clojure
             [string :as str]
             [walk :as walk]]
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


(defn- clause-type-and-args
  "Given a token string, return the matching Fieldclause "
  [token-str]
  (if-let [[_ source-token-str dest-token-str] (re-matches #"(^.*)->(.*$)" token-str)]
    [:fk-> source-token-str dest-token-str]
    [:field-id token-str]))


(defmulti ^:private mbql-field
  "Convert `token-str` to MBQL and `data/id` calls using `strategy` for producing the result.

  *  `:wrap`    = wrap the clause in `:field-id` or `:fk->`
  *  `:raw`     = return raw Integer Field ID
  *  `:literal` = wrap the clause in `:field-literal`"
  {:arglists '([strategy clause-type source-table-symb & tokens])}
  (fn [strategy clause-type & _] [strategy clause-type]))

(defmethod mbql-field [:wrap :field-id]
  [_ _ source-table-symb token-str]
  [:field-id (field-id-call source-table-symb token-str)])

(defmethod mbql-field [:wrap :fk->]
  [_ _ source-table-symb source-token-str dest-token-str]
  [:fk->
   [:field-id (field-id-call source-table-symb source-token-str)]
   [:field-id (field-id-call source-table-symb dest-token-str)]])

(defmethod mbql-field [:raw :field-id]
  [_ _ source-table-symb token-str]
  (field-id-call source-table-symb token-str))

(defmethod mbql-field [:raw :fk->]
  [_ _ source-table-symb source-token-str dest-token-str]
  (throw (ex-info "Error: It doesn't make sense to have an 'raw' fk-> form. (Don't know which ID to use.)"
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
      [:field-literal field-name (keyword "type" field-type)])
    [:field-literal
     (list `field-name      (field-id-call source-table-symb token-str))
     (list `field-base-type (field-id-call source-table-symb token-str))]))

(defmethod mbql-field [:literal :field-id]
  [_ _ source-table-symb token-str]
  (field-literal source-table-symb token-str))

(defmethod mbql-field [:literal :fk->]
  [_ _ source-table-symb source-token-str dest-token-str]
  [:fk->
   (field-literal source-table-symb source-token-str)
   (field-literal source-table-symb dest-token-str)])


(defn- mbql-field-with-strategy [strategy source-table-symb token-str]
  (let [[clause-type & args] (clause-type-and-args token-str)]
    (apply mbql-field strategy clause-type source-table-symb args)))

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
  (mbql-field-with-strategy :wrap source-table-symb (.substring (str token) 1)))

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
    [:joined-field alias-name (parse-token-by-sigil source-table-symb (if (token->sigil token)
                                                                        (symbol token)
                                                                        (symbol (str \$ token))))]
    (throw (ex-info "Error parsing token starting with '&'"
             {:token token}))))

;; `!unit.<field> = datetime field
(defmethod parse-token-by-sigil "!"
  [source-table-symb token]
  (if-let [[_ unit token] (re-matches #"^!([^.]+)\.(.+$)" (str token))]
    [:datetime-field
     (parse-token-by-sigil source-table-symb (if (token->sigil token)
                                               (symbol token)
                                               (symbol (str \$ token))))
     (keyword unit)]
    (throw (ex-info "Error parsing token starting with '!!'"
             {:token token}))))

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
