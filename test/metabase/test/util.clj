(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [expectations :refer :all]
            [medley.core :as m]
            (metabase [db :refer :all]
                      [util :as u])))

(declare $->prop)

;; ## match-$

(defmacro match-$
  "Walk over map DEST-OBJECT and replace values of the form `$` or `$key` as follows:

    {k $} -> {k (k SOURCE-OBJECT)}
    {k $symb} -> {k (:symb SOURCE-OBJECT)}

  ex.

    (match-$ m {:a $, :b 3, :c $b}) -> {:a (:a m), b 3, :c (:b m)}"
  [source-obj dest-object]
  {:pre [(map? dest-object)]}
  (let [source## (gensym)
        dest-object (->> dest-object
                         (map (fn [[k v]]
                                {k (if (= v '$) `(~k ~source##)
                                       v)}))
                         (into {}))]
    `(let [~source## ~source-obj]
       ~(clojure.walk/prewalk (partial $->prop source##)
                              dest-object))))

(defn- $->prop
  "If FORM is a symbol starting with a `$`, convert it to the form `(form-keyword SOURCE-OBJ)`.

    ($->prop my-obj 'fish)  -> 'fish
    ($->prop my-obj '$fish) -> '(:fish my-obj)"
  [source-obj form]
  (or (when (symbol? form)
        (let [[first-char & rest-chars] (name form)]
          (when (and (= first-char \$)
                     (not (empty? rest-chars))) ; don't match just `$`
            (let [kw (->> rest-chars
                          (apply str)
                          keyword)]
              `(~kw ~source-obj)))))
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
(defn random-name
  "Generate a random string of 20 uppercase letters."
  []
  (->> (repeatedly 20 #(-> (rand-int 26) (+ (int \A)) char))
       (apply str)))


;; ## with-temp
;;
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
  `(let [object# (m/mapply ins ~entity ~options-map)
         ~binding-form object#
         delete-fn# (fn [] (cascade-delete ~entity :id (:id object#)))]
     (let [result# (try (do ~@body)
                        (catch Throwable e#
                          (delete-fn#)
                          (throw e#)))]
       (delete-fn#)
       result#)))


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
       (def ~(vary-meta fn-name assoc :private true) (ns-resolve '~namespc '~fn-name))
       ~(when (seq more)
          `(resolve-private-fns ~namespc ~(first more) ~@(rest more)))))
