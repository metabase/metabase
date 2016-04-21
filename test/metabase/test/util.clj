(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [medley.core :as m]
            (metabase [db :refer :all]
                      [util :as u])
            (metabase.models [card :refer [Card]]
                             [common :as common]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [metric :refer [Metric]]
                             [pulse :refer [Pulse]]
                             [pulse-channel :refer [PulseChannel]]
                             [raw-column :refer [RawColumn]]
                             [raw-table :refer [RawTable]]
                             [revision :refer [Revision]]
                             [segment :refer [Segment]]
                             [table :refer [Table]])))

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


;; ## expect-eval-actual-first
;; By default `expect` evaluates EXPECTED first. This isn't always what we want; for example, sometime API tests affect the DB
;; and we'd like to check the results.

(defmacro -doexpect [e a]
  `(let [a# (try ~a (catch java.lang.Throwable t# t#))
         e# (try ~e (catch java.lang.Throwable t# t#))]
     (report
      (try (compare-expr e# a# '~e '~a)
           (catch java.lang.Throwable e2#
             (compare-expr e2# a# '~e '~a))))))

(defmacro expect-eval-actual-first
  "Identical to `expect` but evaluates `actual` first (instead of evaluating `expected` first)."
  [expected actual]
  (let [fn-name (gensym)]
    `(def ~(vary-meta fn-name assoc :expectation true)
       (fn [] (-doexpect ~expected ~actual)))))


;; ## random-name
(let [random-uppercase-letter (partial rand-nth (mapv char (range (int \A) (inc (int \Z)))))]
  (defn random-name
    "Generate a random string of 20 uppercase letters."
    []
    (apply str (repeatedly 20 random-uppercase-letter))))


(defn boolean-ids-and-timestamps
  "Useful for unit test comparisons.  Converts map keys with 'id' or '_at' to booleans."
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
  {:with-temp-defaults (constantly nil)})

(u/strict-extend (class Card)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id             ((resolve 'metabase.test.data.users/user->id) :rasta)
                                :dataset_query          {}
                                :display                :table
                                :name                   (random-name)
                                :public_perms           common/perms-none
                                :visualization_settings {}})})

(u/strict-extend (class Dashboard)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id   ((resolve 'metabase.test.data.users/user->id) :rasta)
                                :name         (random-name)
                                :public_perms 0})})

(u/strict-extend (class Database)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:details   {}
                                :engine    :yeehaw
                                :is_sample false
                                :name      (random-name)})})

(u/strict-extend (class Field)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:active          true
                                :base_type       :TextField
                                :field_type      :info
                                :name            (random-name)
                                :position        1
                                :preview_display true})})

(u/strict-extend (class Metric)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id  ((resolve 'metabase.test.data.users/user->id) :rasta)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"})})

(u/strict-extend (class Pulse)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id ((resolve 'metabase.test.data.users/user->id) :rasta)
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
  {:with-temp-defaults (fn [_] {:user_id      ((resolve 'metabase.test.data.users/user->id) :rasta)
                                :is_creation  false
                                :is_reversion false})})

(u/strict-extend (class Segment)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id ((resolve 'metabase.test.data.users/user->id) :rasta)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"})})

(u/strict-extend (class Table)
  WithTempDefaults
  {:with-temp-defaults (fn [_] {:active true
                                :name   (random-name)})})


(defn do-with-temp
  "Internal implementation of `with-temp` (don't call this directly)."
  [entity attributes f]
  (let [temp-object (m/mapply ins entity (merge (with-temp-defaults entity)
                                                attributes))]
    (try
      (f temp-object)
      (finally
        (cascade-delete entity :id (:id temp-object))))))


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

    (with-temp EmailReport [report {:creator_id      (user->id :rasta)
                                    :name            (random-name)
                                    :organization_id @org-id}]
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
  [with-temp*-form expected actual]
  ;; use `gensym` instead of auto gensym here so we can be sure it's a unique symbol every time. Otherwise since expectations hashes its body
  ;; to generate function names it will treat every usage of `expect-with-temp` as the same test and only a single one will end up being ran
  (let [with-temp-form (gensym "with-temp-")]
    `(let [~with-temp-form (delay (with-temp* ~with-temp*-form
                                    [~expected ~actual]))]
       (expect
         (first  @~with-temp-form)
         (second @~with-temp-form)))))

;; ## resolve-private-fns

(defmacro resolve-private-fns
  "Have your cake and eat it too. This Macro adds private functions from another namespace to the current namespace so we can test them.

    (resolve-private-fns metabase.driver.generic-sql.sync
      field-avg-length field-percent-urls)"
  {:arglists '([namespace-symb & fn-symbs])}
  [namespc fn-name & more]
  {:pre [(symbol? namespc)
         (symbol? fn-name)
         (every? symbol? more)]}
  `(do (require '~namespc)
       (def ~(vary-meta fn-name assoc :private true) (or (ns-resolve '~namespc '~fn-name)
                                                         (throw (Exception. ~(str namespc "/" fn-name " doesn't exist!")))))
       ~(when (seq more)
          `(resolve-private-fns ~namespc ~(first more) ~@(rest more)))))

(defn obj->json->obj
  "Convert an object to JSON and back again. This can be done to ensure something will match its serialized + deserialized form,
   e.g. keywords that aren't map keys:

     (obj->json->obj {:type :query}) -> {:type \"query\"}"
  [obj]
  (json/parse-string (json/generate-string obj) keyword))
