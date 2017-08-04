(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [permissions-group :refer [PermissionsGroup]]
             [pulse :refer [Pulse]]
             [pulse-channel :refer [PulseChannel]]
             [revision :refer [Revision]]
             [segment :refer [Segment]]
             [setting :as setting]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.util.test :as test]))

;; ## match-$

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

(defmacro ^:deprecated match-$
  "Walk over map DEST-OBJECT and replace values of the form `$`, `$key`, or `$$` as follows:

    {k $}     -> {k (k SOURCE-OBJECT)}
    {k $symb} -> {k (:symb SOURCE-OBJECT)}
    $$        -> {k SOURCE-OBJECT}

  ex.

    (match-$ m {:a $, :b 3, :c $b}) -> {:a (:a m), b 3, :c (:b m)}"
  ;; DEPRECATED - This is an old pattern for writing tests and is probably best avoided going forward.
  ;; Tests that use this macro end up being huge, often with giant maps with many values that are `$`.
  ;; It's better just to write a helper function that only keeps values relevant to the tests you're writing
  ;; and use that to pare down the results (e.g. only keeping a handful of keys relevant to the test).
  ;; Alternatively, you can also consider converting fields that naturally change to boolean values indiciating their presence;
  ;; see the `boolean-ids-and-timestamps` function below
  [source-obj dest-object]
  {:pre [(map? dest-object)]}
  (let [source##    (gensym)
        dest-object (into {} (for [[k v] dest-object]
                               {k (condp = v
                                    '$ `(~k ~source##)
                                    '$$ source##
                                    v)}))]
    `(let [~source## ~source-obj]
       ~(walk/prewalk (partial $->prop source##)
                      dest-object))))


;;; random-name
(def ^:private ^{:arglists '([])} random-uppercase-letter
  (partial rand-nth (mapv char (range (int \A) (inc (int \Z))))))

(defn random-name
  "Generate a random string of 20 uppercase letters."
  []
  (apply str (repeatedly 20 random-uppercase-letter)))

(defn random-email
  "Generate a random email address."
  []
  (str (random-name) "@metabase.com"))

(defn boolean-ids-and-timestamps
  "Useful for unit test comparisons. Converts map keys found in `DATA`
  satisfying `PRED` with booleans when not nil"
  ([data]
   (boolean-ids-and-timestamps
    (every-pred (some-fn keyword? string?)
                (some-fn #{:id :created_at :updated_at :last_analyzed :created-at :updated-at :field-value-id :field-id}
                         #(.endsWith (name %) "_id")))
    data))
  ([pred data]
   (walk/prewalk (fn [maybe-map]
                   (if (map? maybe-map)
                     (reduce-kv (fn [acc k v]
                                  (if (pred k)
                                    (assoc acc k (not (nil? v)))
                                    (assoc acc k v)))
                                {} maybe-map)
                     maybe-map))
                 data)))


(defn- user-id [username]
  (require 'metabase.test.data.users)
  ((resolve 'metabase.test.data.users/user->id) username))

(defn- rasta-id [] (user-id :rasta))


(u/strict-extend (class Card)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id             (rasta-id)
                                :dataset_query          {}
                                :display                :table
                                :name                   (random-name)
                                :visualization_settings {}})})

(u/strict-extend (class Collection)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name  (random-name)
                                :color "#ABCDEF"})})

(u/strict-extend (class Dashboard)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id   (rasta-id)
                                :name         (random-name)})})

(u/strict-extend (class DashboardCardSeries)
  test/WithTempDefaults
  {:with-temp-defaults (constantly {:position 0})})

(u/strict-extend (class Database)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:details   {}
                                :engine    :yeehaw
                                :is_sample false
                                :name      (random-name)})})

(u/strict-extend (class Field)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:base_type :type/Text
                                :name      (random-name)
                                :position  1
                                :table_id  (data/id :checkins)})})

(u/strict-extend (class Metric)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id  (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :checkins)})})

(u/strict-extend (class PermissionsGroup)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name (random-name)})})

(u/strict-extend (class Pulse)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :name       (random-name)})})

(u/strict-extend (class PulseChannel)
  test/WithTempDefaults
  {:with-temp-defaults (constantly {:channel_type  :email
                                    :details       {}
                                    :schedule_type :daily
                                    :schedule_hour 15})})

(u/strict-extend (class Revision)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:user_id      (rasta-id)
                                :is_creation  false
                                :is_reversion false})})

(u/strict-extend (class Segment)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :checkins)})})

;; TODO - `with-temp` doesn't return `Sessions`, probably because their ID is a string?

(u/strict-extend (class Table)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:db_id  (data/id)
                                :active true
                                :name   (random-name)})})

(u/strict-extend (class User)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:first_name (random-name)
                                :last_name  (random-name)
                                :email      (random-email)
                                :password   (random-name)})})


;;; ------------------------------------------------------------ Other Util Fns ------------------------------------------------------------


(defn- namespace-or-symbol? [x]
  (or (symbol? x)
      (instance? clojure.lang.Namespace x)))

(defn ^:deprecated resolve-private-vars* [source-namespace target-namespace symbols]
  {:pre [(namespace-or-symbol? source-namespace)
         (namespace-or-symbol? target-namespace)
         (every? symbol? symbols)]}
  (require source-namespace)
  (doseq [symb symbols
          :let [varr (or (ns-resolve source-namespace symb)
                         (throw (Exception. (str source-namespace "/" symb " doesn't exist!"))))]]
    (intern target-namespace symb varr)))

(defmacro ^:deprecated resolve-private-vars
  "Have your cake and eat it too. This Macro adds private functions from another namespace to the current namespace so we can test them.

    (resolve-private-vars metabase.driver.generic-sql.sync
      field-avg-length field-percent-urls)

   DEPRECATED: Just refer to vars directly using `#'` syntax instead of using this macro.

     (#'some-ns/field-avg-length ...)"
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

(defn do-with-log-messages [f]
  (let [messages (atom [])]
    (with-redefs [log/log* (fn [_ & message]
                             (swap! messages conj (vec message)))]
      (f))
    @messages))

(defmacro with-log-messages
  "Execute BODY, and return a vector of all messages logged using the `log/` family of functions.
   Messages are of the format `[:level throwable message]`, and are returned in chronological order
   from oldest to newest.

     (with-log-messages (log/warn \"WOW\")) ; -> [[:warn nil \"WOW\"]]"
  {:style/indent 0}
  [& body]
  `(do-with-log-messages (fn [] ~@body)))


(defn vectorize-byte-arrays
  "Walk form X and convert any byte arrays in the results to standard Clojure vectors.
   This is useful when writing tests that return byte arrays (such as things that work with query hashes),
   since identical arrays are not considered equal."
  {:style/indent 0}
  [x]
  (walk/postwalk (fn [form]
                   (if (instance? (Class/forName "[B") form)
                     (vec form)
                     form))
                 x))
