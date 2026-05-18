(ns metabase.util.match
  "Leaner reimplementation of `clojure.core.match` macros with mostly compatible syntax and much smaller bytecode
  footprint."
  (:refer-clojure :exclude [every? run! some mapv replace empty?])
  (:require
   [metabase.util.match.impl]
   [metabase.util.performance :as perf :refer [empty? every? mapv run! some]]))

(defn- parse-pattern
  "Parse a pattern vector into bindings and conditions"
  [pattern]
  (cond
    ;; Symbol binding
    (symbol? pattern)
    {:type :symbol
     :symbol pattern}

    ;; Guard pattern
    (and (seq? pattern) (symbol? (first pattern)) (>= (count pattern) 3))
    (let [preds (apply hash-map (rest pattern))]
      (cond-> {:type :guard
               :symbol (nth pattern 0)
               :predicate (nth pattern 2)}
        (:guard preds) (assoc :predicate (:guard preds))
        (:len preds) (assoc :length (:len preds))))

    ;; (:or ...) pattern
    (and (seq? pattern) (= (first pattern) :or) (>= (count pattern) 2))
    {:type :or
     :clauses (rest pattern)}

    ;; (:and ...) pattern
    (and (seq? pattern) (= (first pattern) :and) (>= (count pattern) 2))
    {:type :and
     :clauses (rest pattern)}

    ;; Vector pattern
    (vector? pattern)
    (let [[main-parts rest-parts] (vec (split-with (complement #{'&}) pattern))
          rest-part (second rest-parts)]
      {:type :vector
       :parts main-parts
       :rest-part rest-part})

    ;; Map pattern
    (map? pattern)
    {:type :map
     :map pattern}

    (or (number? pattern) (keyword? pattern) (string? pattern) (boolean? pattern) (nil? pattern))
    {:type :equality
     :value pattern}

    (set? pattern)
    {:type :set
     :value pattern}

    :else
    (throw (ex-info "Invalid pattern" {:pattern pattern}))))

(declare process-clauses)

(defn- process-pattern [pattern value bindings conditions return]
  (let [{:keys [parts rest-part predicate] :as parsed} (parse-pattern pattern)]
    (case (:type parsed)
      :symbol (when-not (= (:symbol parsed) '_)
                (vswap! bindings conj [(:symbol parsed) value]))
      :vector (let [s (if (symbol? value) value (gensym "vec"))
                    cnt (count parts)]
                (vswap! bindings conj (with-meta [s `(metabase.util.match.impl/vector! ~value)]
                                                 {:vector-check true}))
                (dorun (map-indexed #(process-pattern %2 (with-meta (list `nth s %1 nil) (or (meta s)
                                                                                             {:depends-on s}))
                                                      bindings conditions return) parts))
                (when (pos? cnt)
                  (vswap! conditions conj (with-meta (list (if rest-part
                                                             `metabase.util.match.impl/count>=
                                                             `metabase.util.match.impl/count=) s cnt)
                                                     {:depends-on s})))
                (when rest-part
                  (process-pattern rest-part `(into [] (drop ~cnt) ~s) bindings conditions false)))
      :map (let [s (if (symbol? value) value (gensym "map"))]
             (vswap! bindings conj [s `(metabase.util.match.impl/map! ~value)])
             (run! (fn [[k v]]
                     (condp = v
                       '&truthy (vswap! conditions conj (with-meta (list `get s k) {:depends-on s}))
                       '_ (vswap! conditions conj (with-meta (list `contains? s k) {:depends-on s}))
                       (do (vswap! conditions conj (with-meta (list `contains? s k) {:depends-on s}))
                           (process-pattern v (list `get s k) bindings conditions false))))
                   (:map parsed)))
      :or (let [or-clauses (:clauses parsed)
                new-body (process-clauses (mapv vector (:clauses parsed) (repeat (count or-clauses) @return)) value nil)]
            (vreset! return (with-meta new-body {:nil-wrapped true})))
      :and (let [and-clauses (:clauses parsed)]
             (run! (fn [and-clause] (process-pattern and-clause value bindings conditions return)) and-clauses))
      :guard (let [s (:symbol parsed)
                   s (if (= s '_) (gensym "_") s)
                   ;; Treat symbol, keyword, or set predicates as functions to be called, and thus transform them
                   ;; into invocation snippets. Be careful that if user doesn't want to bind the value in the
                   ;; guard (signified by `_`), we should pass the directly extracted value to the predicate,
                   ;; otherwise the binding.
                   predicate (if (or (symbol? predicate) (keyword? predicate) (set? predicate))
                               (list predicate s)
                               predicate)]
               (vswap! bindings conj [s value])
               (when predicate
                 ;; Make sure that the predicate is an invocation snippet, not a lambda as in regular `match` syntax.
                 (when (and (seq? predicate) ('#{fn fn*} (first predicate)))
                   (throw (ex-info "match-one :guard predicate must be an invocation form or a symbol, not a lambda" {:predicate predicate})))
                 (vswap! conditions conj (with-meta (if (and (seq? predicate) (not= (first predicate) 'fn*))
                                                      predicate
                                                      (list predicate s))
                                                    {:depends-on s})))
               (when (:length parsed)
                 (vswap! conditions conj (with-meta (list `metabase.util.match.impl/count= s (:length parsed))
                                                    {:depends-on s}))))
      :equality (vswap! conditions conj (with-meta (list `= value (:value parsed)) (meta value)))
      :set (vswap! conditions conj (list (:value parsed) value)))))

(defn- process-clause [[pattern ret] value-sym]
  (let [bindings (volatile! []), conditions (volatile! []) return (volatile! ret)]
    (process-pattern pattern value-sym bindings conditions return)
    {:bindings @bindings
     :conditions @conditions
     :return @return}))

(defn- seq-contains? [coll item]
  (some #(= % item) coll))

(defn- strip-meta [expr]
  (if (instance? clojure.lang.IObj expr)
    (vary-meta expr dissoc :depends-on :vector-check)
    expr))

(defn- collect-common [bindings conditions]
  (let [common-bindings (filter (fn [bind] (every? #(seq-contains? % bind) bindings))
                                (first bindings))
        common-conditions (filter (fn [condition] (and (every? #(seq-contains? % condition) conditions)
                                                       ;; Ensure that variable for common condition is already bound.
                                                       (seq-contains? (map first common-bindings)
                                                                      (:depends-on (meta condition)))))
                                  (first conditions))
        clear-bindings-meta #(strip-meta (mapv (fn [[s v]] [s (strip-meta v)]) %))]
    {:common-bindings (clear-bindings-meta common-bindings)
     :common-conditions (mapv strip-meta common-conditions)
     :all-bindings (mapv (fn [bindings]
                           (clear-bindings-meta (remove #(seq-contains? common-bindings %) bindings)))
                         bindings)
     :all-conditions (->> conditions
                          (mapv (fn [conditions]
                                  (->> conditions
                                       (remove #(seq-contains? common-conditions %))
                                       strip-meta))))}))

(defn- expand-conditions [combiner conditions body & [bool?]]
  (case (count conditions)
    0 body
    1 (if bool?
        (first conditions)
        `(when ~(first conditions) ~body))
    (if bool?
      `(~combiner ~@conditions)
      `(when (~combiner ~@conditions) ~body))))

(defn- expand-bindings [bindings body]
  (if (empty? bindings) body
      `(let ~(vec (mapcat identity bindings)) ~body)))

(defn- maybe-wrap-nil [expr]
  (if (:nil-wrapped (meta expr))
    (vary-meta expr dissoc :nil-wrapped)
    `(metabase.util.match.impl/wrap-nil ~expr)))

(defn- expand-or-some [args]
  (case (count args)
    0 nil
    1 (first args)
    `(let [a# ~(first args)] (if (some? a#) a# ~(expand-or-some (rest args))))))

(defn- emit-clause [{:keys [common-bindings common-conditions all-bindings all-conditions]}
                    returns value-sym value-binding]
  (let [same-return? (and (apply = returns)
                          ;; Only allow extracting same result if there are no individual bindings in branches.
                          (every? empty? all-bindings))
        ;; If all clauses check for vector, hoist the check into the let binding.
        common-vector-check? (some #(and (= % value-sym) (:vector-check (meta %))) common-bindings)
        common-bindings (remove #(and (= % value-sym) (:vector-check (meta %))) common-bindings)
        value-binding (if common-vector-check?
                        `(metabase.util.match.impl/vector! ~(or value-binding value-sym))
                        value-binding)]
    `(let [~@(when (and (some? value-binding) (not= value-sym value-binding))
               [value-sym value-binding])
           ~@(mapcat identity common-bindings)]
       ~(expand-conditions
         `and common-conditions
         (if (and same-return? (> (count returns) 1))
           `(when (or ~@(mapv (fn [bindings conditions]
                                (expand-bindings bindings (expand-conditions `and conditions true true)))
                              all-bindings all-conditions))
              ~(maybe-wrap-nil (first returns)))
           (expand-or-some
            (mapv (fn [bindings conditions return-expr]
                    (expand-bindings bindings (expand-conditions `and conditions (maybe-wrap-nil return-expr))))
                  all-bindings all-conditions returns)))))))

(defn- process-clauses [clauses value-sym value-binding]
  (let [processed (mapv #(process-clause % value-sym) clauses)
        collected (collect-common (map :bindings processed) (map :conditions processed))]
    (emit-clause collected (mapv :return processed) value-sym value-binding)))

(defn- contains-symbol? [form sym]
  (let [found (volatile! false)]
    (perf/postwalk #(when (= % sym) (vreset! found true)) form)
    @found))

(defn- rewrite-&recur
  "Replace any `&recur` forms with ones that include the implicit `&parents` arg."
  [form]
  (perf/postwalk
   (fn [form]
     (if (and (seq? form) (= '&recur (first form)))
       (list '&recur (second form) '&parents)
       form))
   form))

(defn- match-one* [value clauses]
  (when (odd? (count clauses))
    (throw (ex-info "match-one requires even number of clauses" {})))
  (let [pairs (partition 2 clauses)
        has-default? (= (first (last pairs)) '_)
        [pairs default] (if has-default?
                          [(butlast pairs) (second (last pairs))]
                          [pairs nil])
        ;; match-one is always recursive unless there is a default clause
        recursive? (not has-default?)
        ;; Search for &recur and &parents usage in clauses.
        contains-&recur? (contains-symbol? pairs '&recur)
        contains-&parents? (contains-symbol? pairs '&parents)
        pairs (rewrite-&recur pairs)
        ;; Wrap explicit nil values.
        value (if (nil? value) `(identity nil) value)
        value-binding (when-not (or recursive? contains-&recur?) value)
        body `(metabase.util.match.impl/unwrap-nil
               ~(expand-or-some
                 (cond-> [(process-clauses pairs '&match value-binding)]
                   (some? default) (conj default)
                   recursive? (conj `(metabase.util.match.impl/match-one-in-collection ~'&recur ~'&match ~'&parents)))))]
    (if (or recursive? contains-&recur?)
      `((fn ~'&recur [~'&match ~'&parents]
          ~body)
        ~value
        ;; Only set &parents to [] if user code uses &parents, otherwise keep it `nil` to avoid unnecessary updates.
        ~(when contains-&parents? []))
      body)))

(defmacro match-one
  "Pattern matching macro, simplified version of [[clojure.core.match]].

  Return a single thing that matches one of the match `clauses` inside `value`. If none of the clauses matched, return
  `nil`. Recurses through maps and sequences. A clause is a pair of a match pattern and a return expression. Usage:

  (match-one value
    pattern1 result1
    pattern2 result2
    ...)

  A pattern can be one of several things:

  - symbol - binds the entire value
  - keyword, string, number, boolean, `nil` - must match exactly
  - set - must be one of the set items
  - (sym :guard pred :len size) - bind with predicate check. The predicate should either be a symbol denoting a
                                  function, keyword, set, or an invocation snippet (but not a lambda). Can optionally
                                  check for collection length.
  - vector - binds positional values inside a sequence against other patterns. Can have & to bind remaining elements.
  - map - binds associative values inside a map against other patterns. Special symbols can be used as patterns:
          `&truthy` - matches if the map contains any truthy value for the key
          `_` - matches if the map contains any value (including `nil`) for the key, but not if key is missing
          In all other cases, the pattern will attempt to match only if the map contains the key.
  - (:or clause1 clause2 ...) - special syntax for grouping several alternative conditions that share the same
                                return expression.
  - (:and pattern1 pattern2 ...) - special syntax for providing multiple restictions on the same match. E.g., you can
                                   describe the structure with one pattern, and provide a guard predicate for the whole
                                   match as the second pattern.
  - `_` - matches anything. One usecase for this is to curtail recursive search, thus making the match non-recursive
          (because `_` will always match and its return expression will be returned).

  Examples:

    ;; keyword pattern
    (match-one {:fields [[:field 10 nil]]} [:field & _] &match) ; -> [:field 10 nil]

    ;; set of keywords
    (match-one some-query [#{:field :expression} & _] &match) ; -> [:field 10 nil] or [:expression \"wow\"]

    ;; match any `:field` clause with two args (which should be all of them)
    (match-one some-query [:field _ _] &match)

    ;; match-one any `:field` clause with integer ID > 100
    (match-one some-query [:field (num :guard (and (integer? num) (> num 100)))] &match) ; -> [:field 200 nil]

    ;; symbol naming a predicate function
    ;; match anything that satisfies that predicate
    (match-one some-query (_ :guard integer?) &match)

    ;; match anything with `_`
    (match-one 100 `_` :anything) ; -> :anything

  The return expresion can use any of the bindings established in the pattern to compute what should be returned.
  `nil` is a legal return value and prevents other clauses from being checked and matched. The following special forms
  can be used within return expression:

  - `&match` - is bound to the current value being matched.
  - `&parents` - is bound to a vector of keywords that describe the path of the current form in the data structure.
  - `(&recur <other-value>)` - can be used to re-run just the matching macro on an arbitrarily computed value.

  Examples:

    ;; find vector with exactly 3 items and multiply them
    (match-one [[[[[10 20 30]]]]] [_ _ _] (reduce * &match)) ; -> 6000

    ;; returns [:div :a :href]
    (match-one [:div [:a {:href \"hello\"}]]
      string? &parents)

    ;; find innermost :div
    (match-one [:div [:div [:div \"hello\"]]]
      [:div (nested :guard vector?)] (&recur nested)
      [:div & _]                     &match)
    ; -> [:div \"hello\"]"
  [value & clauses]
  (match-one* value clauses))

(defn- match-many* [value clauses]
  (when (odd? (count clauses))
    (throw (ex-info "match-many requires even number of clauses" {})))
  (let [pairs (partition 2 clauses)
        has-default? (= (first (last pairs)) '_)
        [pairs default] (if has-default?
                          [(butlast pairs) (second (last pairs))]
                          [pairs nil])
        ;; match-many is always recursive unless there is a default clause
        recursive? (not has-default?)
        ;; Search for &recur and &parents usage in clauses.
        contains-&recur? (contains-symbol? pairs '&recur)
        contains-&parents? (contains-symbol? pairs '&parents)
        pairs (rewrite-&recur pairs)
        ;; Wrap explicit nil values.
        value (if (nil? value) `(identity nil) value)
        value-binding (when-not (or recursive? contains-&recur?) value)
        body (process-clauses pairs '&match value-binding)]
    `(let [acc# (volatile! [])]
       ((fn ~'&recur [~'&match ~'&parents]
          (if-some [result# ~(expand-or-some
                              (cond-> [body]
                                (some? default) (conj default)))]
            ;; Important: a clause may return `nil` to stop further recursive search, yet we don't want that nil to
            ;; wind up in results.
            (do (some->> (metabase.util.match.impl/unwrap-nil result#) (vswap! acc# conj))
                nil)
            (metabase.util.match.impl/match-one-in-collection ~'&recur ~'&match ~'&parents)))
        ~value
        ~(when contains-&parents? []))
       (perf/not-empty @acc#))))

(defmacro match-many
  "Pattern matching macro, returns multiple things that match one of the `clauses` inside `value. See `match-one` for
  pattern and return expression syntax.

  There are several important characteristics that make `match-many` behavior semantically different from `match-one`:

  1. If one or more clauses matched, return a vector of the matched return values. If none of the clauses were
  matched, `nil` is returned instead of `[]`.

  2. If a return expression returns `nil`, it will not appear in the return list. This can be used to filter results:

    (match some-query [:field (id :guard integer?) _]
      (when (even? id)
        id))
    ;; -> [2 4 6 8]

    Note that returning `nil` still prevents other clauses from being checked, and causes recursion to stop."
  {:style/indent :defn}
  [value & clauses]
  (match-many* value clauses))

;; TODO - it would be ultra handy to have a `match-all` function that could handle clauses with recursive matches,
;; e.g. with a query like
;;
;;    {:query {:source-table 1, :joins [{:source-table 2, ...}]}}
;;
;; it would be useful to be able to do
;;
;;
;;    ;; get *all* the source tables
;;    (match/match-all query
;;      (&match :guard (every-pred map? :source-table))
;;      (:source-table &match))

(defmacro replace
  "Walk `form` recursively and replace all patterns matched with `match-one` by the respective return expressions. The
  same pattern options are supported, and `&parents` and `&match` anaphors are available in the same way."
  [form & clauses]
  (let [replace-fn-symb (gensym "replace-")
        contains-&parents? (contains-symbol? clauses '&parents)]
    `((fn ~replace-fn-symb [~'&match ~'&parents]
        (match-one ~'&match
          ~@clauses
          ~'_ (metabase.util.match.impl/replace-in-collection
               ~replace-fn-symb ~'&match ~(when contains-&parents?
                                            '&parents))))
      ~form
      ~(when contains-&parents? []))))

(defmacro replace-in
  "Like `replace`, but only replaces things in the part of `x` in the keypath `ks` (i.e. the way to `update-in` works.)"
  {:style/indent :defn}
  [x ks & patterns-and-results]
  `(metabase.util.match.impl/update-in-unless-empty ~x ~ks (fn [x#] (replace x# ~@patterns-and-results))))

;; TODO - it would be useful to have something like a `replace-all` function as well
