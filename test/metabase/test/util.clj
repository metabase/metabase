(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [clojure.walk :as walk]
            [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [metric :refer [Metric]]
                             [permissions-group :refer [PermissionsGroup]]
                             [pulse :refer [Pulse]]
                             [pulse-channel :refer [PulseChannel]]
                             [raw-column :refer [RawColumn]]
                             [raw-table :refer [RawTable]]
                             [revision :refer [Revision]]
                             [segment :refer [Segment]]
                             [setting :as setting]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.test.data :as data]
            [metabase.util :as u]))

(declare $->prop)

;; ## match-$

(defmacro match-$
  "Walk over map DEST-OBJECT and replace values of the form `$`, `$key`, or `$$` as follows:

    {k $}     -> {k (k SOURCE-OBJECT)}
    {k $symb} -> {k (:symb SOURCE-OBJECT)}
    $$        -> {k SOURCE-OBJECT}
  ex.

    (match-$ m {:a $, :b 3, :c $b}) -> {:a (:a m), b 3, :c (:b m)}"
  [source-obj dest-object]
  {:pre [(map? dest-object)]}
  (let [source##    (gensym)
        dest-object (into {} (for [[k v] dest-object]
                               {k (condp = v
                                    '$ `(~k ~source##)
                                    '$$ source##
                                        v)}))]
    `(let [~source## ~source-obj]
       ~(clojure.walk/prewalk (partial $->prop source##)
                              dest-object))))

(defn- $->prop
  "If FORM is a symbol starting with a `$`, convert it to the form `(form-keyword SOURCE-OBJ)`.

    ($->prop my-obj 'fish)  -> 'fish
    ($->prop my-obj '$fish) -> '(:fish my-obj)"
  [source-obj form]
  (or (when (and (symbol? form)
                 (= (first (name form)) \$)
                 (not= form '$))
        (if (= form '$$)
          source-obj
          `(~(keyword (apply str (rest (name form)))) ~source-obj)))
      form))


;;; random-name
(let [random-uppercase-letter (partial rand-nth (mapv char (range (int \A) (inc (int \Z)))))]
  (defn random-name
    "Generate a random string of 20 uppercase letters."
    []
    (apply str (repeatedly 20 random-uppercase-letter))))


(defn boolean-ids-and-timestamps
  "Useful for unit test comparisons. Converts map keys with 'id' or '_at' to booleans."
  [m]
  (let [f (fn [v]
            (cond
              (map? v) (boolean-ids-and-timestamps v)
              (coll? v) (mapv boolean-ids-and-timestamps v)
              :else v))]
    (into {} (for [[k v] m]
               (if (or (= :id k)
                       (.endsWith (name k) "_id")
                       (= :created_at k)
                       (= :updated_at k)
                       (= :last_analyzed k))
                 [k (not (nil? v))]
                 [k (f v)])))))


(defprotocol ^:private WithTempDefaults
  (^:private with-temp-defaults [this]))

(u/strict-extend Object
  WithTempDefaults
  {:with-temp-defaults (constantly {})})

(defn- rasta-id []
  (require 'metabase.test.data.users)
  ((resolve 'metabase.test.data.users/user->id) :rasta))

(u/strict-extend (class Card)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id             (rasta-id)
                                :dataset_query          {}
                                :display                :table
                                :name                   (random-name)
                                :visualization_settings {}})})

(u/strict-extend (class Dashboard)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id   (rasta-id)
                                :name         (random-name)})})

(u/strict-extend (class Database)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:details   {}
                                :engine    :yeehaw
                                :is_sample false
                                :name      (random-name)})})

(u/strict-extend (class Field)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:base_type :type/Text
                                :name      (random-name)
                                :position  1
                                :table_id  (data/id :venues)})})

(u/strict-extend (class Metric)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id  (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :venues)})})

(u/strict-extend (class PermissionsGroup)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:name (random-name)})})

(u/strict-extend (class Pulse)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :name       (random-name)})})

(u/strict-extend (class PulseChannel)
  WithTempDefaults
  {:with-temp-defaults (constantly {:channel_type  :email
                                    :details       {}
                                    :schedule_type :daily
                                    :schedule_hour 15})})

(u/strict-extend (class RawColumn)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:active true
                                :name   (random-name)})})

(u/strict-extend (class RawTable)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:active true
                                :name   (random-name)})})

(u/strict-extend (class Revision)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:user_id      (rasta-id)
                                :is_creation  false
                                :is_reversion false})})

(u/strict-extend (class Segment)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :venues)})})

;; TODO - `with-temp` doesn't return `Sessions`, probably because their ID is a string?

(u/strict-extend (class Table)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:db_id  (data/id)
                                :active true
                                :name   (random-name)})})

(u/strict-extend (class User)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:first_name (random-name)
                                :last_name  (random-name)
                                :email      (str (random-name) "@metabase.com")
                                :password   (random-name)})})


(defn do-with-temp
  "Internal implementation of `with-temp` (don't call this directly)."
  [entity attributes f]
  (let [temp-object (db/insert! entity (merge (with-temp-defaults entity)
                                              attributes))]
    (try
      (f temp-object)
      (finally
        (db/cascade-delete! entity :id (:id temp-object))))))


;;; # with-temp
(defmacro with-temp
  "Create a temporary instance of ENTITY bound to BINDING-FORM, execute BODY,
   then delete it via `cascade-delete`.

   Our unit tests rely a heavily on the test data and make some assumptions about the
   DB staying in the same *clean* state. This allows us to write very concise tests.
   Generally this means tests should \"clean up after themselves\" and leave things the
   way they found them.

   `with-temp` should be preferrable going forward over creating random objects *without*
   deleting them afterward.

    (with-temp EmailReport [report {:creator_id (user->id :rasta)
                                    :name       (random-name)}]
      ...)"
  [entity [binding-form & [options-map]] & body]
  `(do-with-temp ~entity ~options-map (fn [~binding-form]
                                        ~@body)))

(defmacro with-temp*
  "Like `with-temp` but establishes multiple temporary objects at the same time.

     (with-temp* [Database [{database-id :id}]
                  Table    [table {:db_id database-id}]]
       ...)"
  [entity-bindings & body]
  (loop [[pair & more] (reverse (partition 2 entity-bindings)), body `(do ~@body)]
    (let [body `(with-temp ~@pair
                  ~body)]
      (if (seq more)
        (recur more body)
        body))))

(defmacro expect-with-temp
  "Combines `expect` with a `with-temp*` form. The temporary objects established by `with-temp*` are available to both EXPECTED and ACTUAL.

     (expect-with-temp [Database [{database-id :id}]]
        database-id
        (get-most-recent-database-id))"
  {:style/indent 1}
  ;; TODO - maybe it makes more sense to have the signature be [with-temp*-form expected & actual] and wrap `actual` in a `do` since it seems like a pretty common use-case.
  ;; I'm not sure about the readability implications however :scream_cat:
  [with-temp*-form expected actual]
  ;; use `gensym` instead of auto gensym here so we can be sure it's a unique symbol every time. Otherwise since expectations hashes its body
  ;; to generate function names it will treat every usage of `expect-with-temp` as the same test and only a single one will end up being ran
  (let [with-temp-form (gensym "with-temp-")]
    `(let [~with-temp-form (delay (with-temp* ~with-temp*-form
                                    [~expected ~actual]))]
       (expect
         (u/ignore-exceptions
           (first @~with-temp-form))   ; if dereferencing with-temp-form throws an exception then expect Exception <-> Exception will pass; we don't want that, so make sure the expected
         (second @~with-temp-form))))) ; case is nil if we encounter an exception so the two don't match and the test doesn't succeed


(defn- namespace-or-symbol? [x]
  (or (symbol? x)
      (instance? clojure.lang.Namespace x)))

(defn resolve-private-vars* [source-namespace target-namespace symbols]
  {:pre [(namespace-or-symbol? source-namespace)
         (namespace-or-symbol? target-namespace)
         (every? symbol? symbols)]}
  (require source-namespace)
  (doseq [symb symbols
          :let [varr (or (ns-resolve source-namespace symb)
                         (throw (Exception. (str source-namespace "/" symb " doesn't exist!"))))]]
    (intern target-namespace symb varr)))

(defmacro resolve-private-vars
  "Have your cake and eat it too. This Macro adds private functions from another namespace to the current namespace so we can test them.

    (resolve-private-vars metabase.driver.generic-sql.sync
      field-avg-length field-percent-urls)"
  [namespc & symbols]
  `(resolve-private-vars* (quote ~namespc) *ns* (quote ~symbols)))


(defn obj->json->obj
  "Convert an object to JSON and back again. This can be done to ensure something will match its serialized + deserialized form,
   e.g. keywords that aren't map keys, record types vs. plain map types, or timestamps vs ISO-8601 strings:

     (obj->json->obj {:type :query}) -> {:type \"query\"}"
  {:style/indent 0}
  [obj]
  (json/parse-string (json/generate-string obj) keyword))


(defn mappify
  "Walk COLL and convert all record types to plain Clojure maps.
   Useful because expectations will consider an instance of a record type to be different from a plain Clojure map, even if all keys & values are the same."
  [coll]
  {:style/indent 0}
  (walk/postwalk (fn [x]
                   (if (map? x)
                     (into {} x)
                     x))
                 coll))


(defn do-with-temporary-setting-value
  "Temporarily set the value of the `Setting` named by keyword SETTING-K to VALUE and execute F, then re-establish the original value.
   This works much the same way as `binding`.

   Prefer the macro `with-temporary-setting-values` over using this function directly."
  {:style/indent 2}
  [setting-k value f]
  (let [original-value (setting/get setting-k)]
    (try
      (setting/set! setting-k value)
      (f)
      (finally
        (setting/set! setting-k original-value)))))

(defmacro with-temporary-setting-values
  "Temporarily bind the values of one or more `Settings`, execute body, and re-establish the original values. This works much the same way as `binding`.

     (with-temporary-setting-values [google-auth-auto-create-accounts-domain \"metabase.com\"]
       (google-auth-auto-create-accounts-domain)) -> \"metabase.com\""
  [[setting-k value & more] & body]
  (let [body `(do-with-temporary-setting-value ~(keyword setting-k) ~value (fn [] ~@body))]
    (if (seq more)
      `(with-temporary-setting-values ~more ~body)
      body)))


(defn is-uuid-string?
  "Is string S a valid UUID string?"
  ^Boolean [^String s]
  (boolean (when (string? s)
             (re-matches #"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$" s))))
