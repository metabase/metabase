(ns metabase.test.data.mbql-query-impl
  "Internal implementation of [[metabase.test.data/$ids]] and [[metabase.test.data/$ids]] and related macros."
  (:require
   #?@(:clj ([toucan2.core :as t2]))
   [clojure.string :as str]
   [clojure.walk :as walk]))

#?(:clj (set! *warn-on-reflection* true))

#_:clj-kondo/ignore
#?(:clj
   (defn druid-id-fn
     "I have a strong feeling this should be handled differently! Let's discuss that during review!"
     [& args]
     (if (and (> (count args) 1)
              (= :druid-jdbc @(requiring-resolve 'metabase.driver/*driver*))
              (= "timestamp" (name (last args))))
       (apply (requiring-resolve 'metabase.test.data/id) (conj (vec (butlast args)) :__time))
       (apply (requiring-resolve 'metabase.test.data/id) args))))

;; TODO: druid-id-fn is just temporary until I figure out proper solution for rebinding that symb.
(def ^:dynamic *id-fn-symb*              `druid-id-fn #_'metabase.test.data/id)
(def ^:dynamic *field-name-fn-symb*      `field-name)
(def ^:dynamic *field-base-type-fn-symb* `field-base-type)

(defn- token->sigil [token]
  (when-let [[_ sigil] (re-matches #"^([$%*!&]{1,2}).*[\w/]$" (str token))]
    sigil))

(defmulti ^:private parse-token-by-sigil
  {:arglists '([source-table-symb token])}
  (fn [_ token]
    (when (symbol? token)
      (token->sigil token))))

(defn- field-id-call
  "Replace a token string like `field` or `table.field` with a call to [[metabase.test.data/id]]."
  [source-table-symb token-str]
  (let [parts (str/split token-str #"\.")]
    (cons
     *id-fn-symb*
     (if (= (count parts) 1)
       [(keyword source-table-symb) (keyword (first parts))]
       (map keyword parts)))))

(defn- token->type+args
  "Given a token string, return the matching Field clause"
  [token-str]
  (if-let [[_ source-token-str dest-token-str] (re-matches #"(^.*)->(.*$)" token-str)]
    [:-> source-token-str dest-token-str]
    [:normal token-str]))

(defmulti ^:private mbql-field
  "Convert `token-str` to MBQL and [[metabase.test.data/id]] calls using `strategy` for producing the result.

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
  ;; recursively parse the destination field, then add `:source-field` to it.
  (let [[_ id-form options] (parse-token-by-sigil source-table-symb (symbol (if (token->sigil dest-token-str)
                                                                              dest-token-str
                                                                              (str \$ dest-token-str))))]
    [:field id-form (assoc options :source-field (field-id-call source-table-symb source-token-str))]))

(defmethod mbql-field [:raw :normal]
  [_ _ source-table-symb token-str]
  (field-id-call source-table-symb token-str))

(defmethod mbql-field [:raw :->]
  [_ _ source-table-symb source-token-str dest-token-str]
  (throw (ex-info "Error: It doesn't make sense to have an 'raw' -> form. (Don't know which ID to use.)"
                  {:source-table-symb source-table-symb
                   :source-token-str  source-token-str
                   :dest-token-str    dest-token-str})))

#?(:clj
   (defn field-name [field-id]
     (t2/select-one-fn :name :model/Field :id field-id)))

#?(:clj
   (defn field-base-type [field-id]
     (t2/select-one-fn :base_type :model/Field :id field-id)))

(defn- field-literal [source-table-symb token-str]
  (if (str/includes? token-str "/")
    (let [[field-name field-type] (str/split token-str #"/")]
      [:field field-name {:base-type (keyword "type" field-type)}])
    [:field
     (list *field-name-fn-symb* (field-id-call source-table-symb token-str))
     {:base-type (list *field-base-type-fn-symb* (field-id-call source-table-symb token-str))}]))

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
  (list *id-fn-symb* (keyword (.substring (str token) 2))))

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
  {:database (list *id-fn-symb*)
   :type     :query
   :query    inner-query})

(defn maybe-add-source-table
  "Internal impl fn of `data/mbql-query` macro. Add `:source-table` to `inner-query` unless it already has a
  `:source-table` or `:source-query` key."
  [inner-query table]
  (if (some (partial contains? inner-query) #{:source-table :source-query})
    inner-query
    (assoc inner-query :source-table (list *id-fn-symb* (keyword table)))))

;; TODO: Enable on [[druid-id-fn]] removal. Ie. after discussing alternative approach to druid-id-fn.
#_(deftest parse-tokens-test
    (is (= '[:field
             (metabase.test.data/id :categories :name)
             {:join-alias "CATEGORIES__via__CATEGORY_ID"}]
           (parse-tokens 'categories '&CATEGORIES__via__CATEGORY_ID.name)))
    (is (= '[:field
             (metabase.test.data/id :categories :name)
             {:source-field (metabase.test.data/id :venues :category_id)}]
           (parse-tokens 'venues '$category_id->categories.name)))
    (is (= '[:field
             (metabase.test.data/id :categories :name)
             {:source-field (metabase.test.data/id :venues :category_id)
              :join-alias   "CATEGORIES__via__CATEGORY_ID"}]
           (parse-tokens 'venues '$category_id->&CATEGORIES__via__CATEGORY_ID.categories.name))))
