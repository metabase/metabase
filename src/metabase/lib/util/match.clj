(ns metabase.lib.util.match
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly."
  (:refer-clojure :exclude [replace])
  (:require
   [clojure.core.match]
   [clojure.walk :as walk]
   [metabase.lib.util.match.impl]
   [net.cgrand.macrovich :as macros]))

(defn- generate-pattern
  "Generate a single approprate pattern for use with core.match based on the `pattern` input passed into `match` or
  `replace`."
  [pattern]
  (cond
    (keyword? pattern)
    [[pattern '& '_]]

    (and (set? pattern) (every? keyword? pattern))
    [[`(:or ~@pattern) '& '_]]

    ;; special case for `_`, we'll let you match anything with that
    (= pattern '_)
    [pattern]

    (symbol? pattern)
    `[(~'_ :guard (metabase.lib.util.match.impl/match-with-pred-or-class ~pattern))]

    :else
    [pattern]))

(defn- recur-form? [form]
  (and (seq? form)
       (= 'recur (first form))))

(defn- rewrite-recurs
  "Replace any `recur` forms with ones that include the implicit `&parents` arg."
  [fn-name result-form]
  (walk/postwalk
   (fn [form]
     (if (recur-form? form)
       ;; we *could* use plain `recur` here, but `core.match` cannot apply code size optimizations if a `recur` form
       ;; is present. Instead, just do a non-tail-call-optimized call to the pattern fn so `core.match` can generate
       ;; efficient code.
       ;;
       ;; (recur [:new-clause ...]) ; -> (match-123456 &parents [:new-clause ...])
       `(~fn-name ~'&parents ~@(rest form))
       form))
   result-form))

(defn- generate-patterns-and-results
  "Generate the `core.match` patterns and results given the input to our macros.

  `wrap-result-forms?` will wrap the results parts of the pairs in a vector, so we do something like `(reduce concat)`
  on all of the results to return a sequence of matches for `match`."
  [fn-name patterns-and-results & {:keys [wrap-result-forms?]}]
  (mapcat (fn [[pattern result]]
            [(generate-pattern pattern) (let [result (rewrite-recurs fn-name result)]
                                          (if (or (not wrap-result-forms?)
                                                  (and (seq? result)
                                                       (= fn-name (first result))))
                                            result
                                            [result]))])
          (partition 2 2 ['&match] patterns-and-results)))

(defn- skip-else-clause?
  "If the last pattern passed in was `_`, we can skip generating the default `:else` clause, because it will never
  match."
  ;; TODO - why don't we just let people pass their own `:else` clause instead?
  [patterns-and-results]
  (= '_ (second (reverse patterns-and-results))))

(defmethod clojure.core.match/emit-pattern-for-syntax [:isa? :default]
  [[_ parent]] {:clojure.core.match/tag ::isa? :parent parent})

(defmethod clojure.core.match/to-source ::isa?
  [{parent :parent} ocr]
  `(isa? ~ocr ~parent))

(defmacro match**
  "Internal impl for `match` and `replace` macros."
  [& args]
  (macros/case
    :clj  `(clojure.core.match/match ~@args)
    :cljs `(cljs.core.match/match ~@args)))

(defmacro match*
  "Internal impl for `match`. Generate a pattern-matching function using `core.match`, and call it with `form`."
  [form patterns-and-results]
  (let [match-fn-symb (gensym "match-")]
    `(seq
      (filter
       some?
       ((fn ~match-fn-symb [~'&parents ~'&match]
          (match** [~'&match]
                   ~@(generate-patterns-and-results match-fn-symb patterns-and-results, :wrap-result-forms? true)
                   ~@(when-not (skip-else-clause? patterns-and-results)
                       [:else `(metabase.lib.util.match.impl/match-in-collection ~match-fn-symb ~'&parents ~'&match)])))
        []
        ~form)))))

(defmacro match
  "Return a sequence of things that match a `pattern` or `patterns` inside `x`, presumably a query, returning `nil` if
  there are no matches. Recurses through maps and sequences. `pattern` can be one of several things:

  *  Keyword name of an MBQL clause
  *  Set of keyword names of MBQL clauses. Matches any clauses with those names
  *  A `core.match` pattern
  *  A symbol naming a class.
  *  A symbol naming a predicate function
  *  `_`, which will match anything

  Examples:

    ;; keyword pattern
    (match {:fields [[:field 10 nil]]} :field) ; -> [[:field 10 nil]]

    ;; set of keywords
    (match some-query #{:field :expression}) ; -> [[:field 10 nil], [:expression \"wow\"], ...]

    ;; `core.match` patterns:
    ;; match any `:field` clause with two args (which should be all of them)
    (match some-query [:field _ _])
    ;; match any `:field` clause with integer ID > 100
    (match some-query [:field (_ :guard (every-pred integer? #(> % 100)))]) ; -> [[:field 200 nil], ...]

    ;; symbol naming a Class
    ;; match anything that is an instance of that class
    (match some-query java.util.Date) ; -> [[#inst \"2018-10-08\", ...]

    ;; symbol naming a predicate function
    ;; match anything that satisfies that predicate
    (match some-query (every-pred integer? even?)) ; -> [2 4 6 8]

    ;; match anything with `_`
    (match 100 `_`) ; -> 100


  ### Using `core.match` patterns

  See [`core.match` documentation](`https://github.com/clojure/core.match/wiki`) for more details.

  Pattern-matching works almost exactly the way it does when using `core.match**` directly, with a few
  differences:

  *  `mbql.util/match` returns a sequence of everything that matches, rather than the first match it finds

  *  patterns are automatically wrapped in vectors for you when appropriate

  *  things like keywords and classes are automatically converted to appropriate patterns for you

  *  this macro automatically recurses through sequences and maps as a final `:else` clause. If you don't want to
     automatically recurse, use a catch-all pattern (such as `_`). Our macro implementation will optimize out this
     `:else` clause if the last pattern is `_`

  ### Returing something other than the exact match with result body

  By default, `match` returns whatever matches the pattern you pass in. But what if you only want to return part of
  the match? You can, using `core.match` binding facilities. Bind relevant things in your pattern and pass in the
  optional result body. Whatever result body returns will be returned by `match`:

     ;; just return the IDs of Field ID clauses
     (match some-query [:field (id :guard integer?) _] id) ; -> [1 2 3]

  You can also use result body to filter results; any `nil` values will be skipped:

    (match some-query [:field (id :guard integer?) _]
      (when (even? id)
        id))
    ;; -> [2 4 6 8]

  Of course, it's more efficient to let `core.match` compile an efficient matching function, so prefer using
  patterns with `:guard` where possible.

  You can also call `recur` inside result bodies, to use the same matching logic against a different value.

  ### `&match` and `&parents` anaphors

  For more advanced matches, like finding a `:field` clauses nested anywhere inside another clause, `match` binds a
  pair of anaphors inside the result body for your convenience. `&match` is bound to the entire match, regardless of
  how you may have destructured it; `&parents` is bound to a sequence of keywords naming the parent top-level keys and
  clauses of the match.

    (lib.util.match/match {:filter [:time-interval [:field 1 nil] :current :month]} :field
      ;; &parents will be [:filter :time-interval]
      (when (contains? (set &parents) :time-interval)
        &match))
    ;; -> [[:field 1 nil]]"
  {:style/indent :defn}
  [x & patterns-and-results]
  ;; Actual implementation of these macros is in `mbql.util.match`. They're in a seperate namespace because they have
  ;; lots of other functions and macros they use for their implementation (which means they have to be public) that we
  ;; would like to discourage you from using directly.
  `(match* ~x ~patterns-and-results))

(defmacro match-one
  "Like `match` but returns a single match rather than a sequence of matches."
  {:style/indent :defn}
  [x & patterns-and-results]
  `(first (match* ~x ~patterns-and-results)))

;; TODO - it would be ultra handy to have a `match-all` function that could handle clauses with recursive matches,
;; e.g. with a query like
;;
;;    {:query {:source-table 1, :joins [{:source-table 2, ...}]}}
;;
;; it would be useful to be able to do
;;
;;
;;    ;; get *all* the source tables
;;    (lib.util.match/match-all query
;;      (&match :guard (every-pred map? :source-table))
;;      (:source-table &match))

(defn- parse-pattern
  "Parse a pattern vector into bindings and conditions"
  [pattern]
  (cond
    ;; Symbol binding
    (symbol? pattern)
    {:type :symbol
     :symbol pattern}

    ;; Guard pattern
    (and (list? pattern) (>= (count pattern) 3))
    (let [preds (apply hash-map (rest pattern))]
      (cond-> {:type :guard
               :symbol (nth pattern 0)
               :predicate (nth pattern 2)}
        (:guard preds) (assoc :predicate (:guard preds))
        (:len preds) (assoc :length (:len preds))))

    ;; Vector pattern
    (vector? pattern)
    (let [[main-parts rest-parts] (vec (split-with (complement #{'&}) pattern))
          rest-part (second rest-parts)]
      {:type :vector
       :parts main-parts
       :rest-part rest-part
       :has-rest (some? rest-part)})

    ;; Map pattern
    (map? pattern)
    {:type :map
     :map pattern}

    (or (number? pattern) (keyword? pattern) (boolean? pattern) (nil? pattern))
    {:type :equality
     :value pattern}

    (set? pattern)
    {:type :set
     :value pattern}

    :else
    (throw (ex-info "Invalid pattern" {:pattern pattern}))))

(defn- process-pattern
  ([pattern value dont-ensure-vectors?]
   (let [bindings (volatile! []), conditions (volatile! [])]
     (process-pattern pattern value bindings conditions dont-ensure-vectors?)
     {:bindings @bindings
      :conditions @conditions}))
  ([pattern value bindings conditions dont-ensure-vectors?]
   (let [{:keys [parts rest-part predicate] :as parsed} (parse-pattern pattern)]
     (case (:type parsed)
       :symbol (when-not (= (:symbol parsed) '_)
                 (vswap! bindings conj [(:symbol parsed) value]))
       :vector (let [s (if (symbol? value) value (gensym "vec"))
                     cnt (count parts)]
                 (when-not dont-ensure-vectors?
                   (vswap! bindings conj [s `(metabase.lib.util.match.impl/vector! ~value)]))
                 (dorun (map-indexed #(process-pattern %2 (list `nth s %1 nil) bindings conditions false) parts))
                 (if rest-part
                   (process-pattern rest-part (list `drop cnt value) bindings conditions false)
                   (vswap! conditions conj (list `metabase.lib.util.match.impl/count= s cnt))))
       :map (let [s (if (symbol? value) value (gensym "map"))]
              (vswap! bindings conj [s `(metabase.lib.util.match.impl/map! ~value)])
              (run! (fn [[k v]] (process-pattern v (list `get s k) bindings conditions false)) (:map parsed)))
       :guard (let [s (:symbol parsed)
                    bind (when-not (= s '_) s)]
                (when bind (vswap! bindings conj [bind value]))
                (when (:predicate parsed)
                  (vswap! conditions conj (with-meta (if (and (seq? predicate) (not= (first predicate) 'fn*))
                                                       predicate
                                                       (list predicate (or bind value)))
                                                     {:depends-on s})))
                (when (:length parsed)
                  (vswap! conditions conj (with-meta (list `metabase.lib.util.match.impl/count= (or bind value) (:length parsed))
                                                     {:depends-on s}))))
       :equality (vswap! conditions conj (list `= value (:value parsed)))
       :set (vswap! conditions conj (list (:value parsed) value))))))

(defn- seq-contains? [coll item]
  (some #(= % item) coll))

(defn- collect-common [processed-patterns]
  (let [all-bindings (mapv :bindings processed-patterns)
        common-bindings (filter (fn [bind] (every? #(seq-contains? % bind) all-bindings))
                                (first all-bindings))

        all-conditions (mapv :conditions processed-patterns)
        common-conditions (filter (fn [condition] (and (every? #(seq-contains? % condition) all-conditions)
                                                       ;; Ensure that variable for common condition is already bound.
                                                       (seq-contains? (map first common-bindings)
                                                                      (:depends-on (meta condition)))))
                                  (first all-conditions))]
    {:common-bindings common-bindings
     :common-conditions (->> common-conditions
                             (mapv #(vary-meta % dissoc :depends-on)))
     :all-bindings (mapv (fn [bindings]
                           (remove #(seq-contains? common-bindings %) bindings))
                         all-bindings)
     :all-conditions (->> all-conditions
                          (mapv (fn [conditions]
                                  (->> conditions
                                       (remove #(seq-contains? common-conditions %))
                                       (mapv #(vary-meta % dissoc :depends-on))))))}))

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

(defn- expand-or-some [args]
  (case (count args)
    0 nil
    1 (first args)
    `(if-some [a# ~(first args)] a# ~(expand-or-some (rest args)))))

(defn- match-lite* [value clauses recursive?]
  (when (odd? (count clauses))
    (throw (ex-info "match-lite requires even number of clauses" {})))
  (let [pairs (partition 2 clauses)
        [pairs default] (if (= (first (last pairs)) '_)
                          [(butlast pairs) (second (last pairs))]
                          [pairs nil])
        all-vectors? (every? vector? (map first pairs))
        value-sym (if (and (symbol? value) (not recursive?))
                    value
                    (gensym "value"))
        processed-patterns (for [[pattern _] pairs]
                             (process-pattern pattern value-sym all-vectors?))
        {:keys [common-bindings common-conditions all-bindings all-conditions]}
        (collect-common processed-patterns)
        same-result? (apply = (map second pairs))
        value-binding (if (or (= value-sym value) recursive?)
                        [] [value-sym value])
        body `(let [~@value-binding
                    ~@(when all-vectors?
                        [value-sym `(metabase.lib.util.match.impl/vector! ~value-sym)])
                    ~@(vec (mapcat identity common-bindings))]
                ~(expand-conditions
                  `and common-conditions
                  (if (and same-result? (> (count pairs) 1))
                    `(when (or ~@(mapv (fn [bindings conditions]
                                         (expand-bindings bindings (expand-conditions `and conditions true true)))
                                       all-bindings all-conditions))
                       ~(second (first pairs)))
                    (expand-or-some
                     (mapv (fn [bindings conditions [_ return-expr]]
                             (expand-bindings bindings (expand-conditions `and conditions return-expr)))
                           all-bindings all-conditions pairs)))))]
    (if recursive?
      (let [f (gensym "f")]
        `((fn ~f [~value-sym]
            ~(expand-or-some
              [body
               `(metabase.lib.util.match.impl/match-lite-in-collection ~f ~value-sym)]))
          ~value))
      (expand-or-some
       (cond-> [body]
         (some? default) (conj default))))))

(defmacro match-lite
  "Pattern matching macro, simplified version of `clojure.core.match`.

  Usage:
  (match-lite value
    pattern1 result1
    pattern2 result2
    ...)

  Patterns can be:
  - symbol - binds the entire value
  - keyword - must match exactly
  - set - must be one of the set items
  - (sym :guard pred :len size) - bind with predicate check. Can optionally check for collection length.
  - vector - binds positional values inside a sequence against other patterns. Can have & to bind remaining elements."
  {:style/indent :defn}
  [value & clauses]
  (match-lite* value clauses false))

(defmacro match-lite-recursive
  "Like `match-lite`, but tries to match children recursively if the top-level match failed."
  {:style/indent :defn}
  [value & clauses]
  (match-lite* value clauses true))

(defmacro replace*
  "Internal implementation for `replace`. Generate a pattern-matching function with `core.match`, and use it to replace
  matching values in `form`."
  [form patterns-and-results]
  (let [replace-fn-symb (gensym "replace-")]
    `((fn ~replace-fn-symb [~'&parents ~'&match]
        (match** [~'&match]
                 ~@(generate-patterns-and-results replace-fn-symb patterns-and-results, :wrap-result-forms? false)
                 ~@(when-not (skip-else-clause? patterns-and-results)
                     [:else `(metabase.lib.util.match.impl/replace-in-collection ~replace-fn-symb ~'&parents ~'&match)])))
      []
      ~form)))

(defmacro replace
  "Like `match`, but replace matches in `x` with the results of result body. The same pattern options are supported,
  and `&parents` and `&match` anaphors are available in the same way. (`&match` is particularly useful here if you
  want to use keywords or sets of keywords as patterns.)"
  {:style/indent :defn}
  [x & patterns-and-results]
  ;; as with `match` actual impl is in `match` namespace to discourage you from using the constituent functions and
  ;; macros that power this macro directly
  `(replace* ~x ~patterns-and-results))

(defmacro replace-in
  "Like `replace`, but only replaces things in the part of `x` in the keypath `ks` (i.e. the way to `update-in` works.)"
  {:style/indent :defn}
  [x ks & patterns-and-results]
  `(metabase.lib.util.match.impl/update-in-unless-empty ~x ~ks (fn [x#] (replace* x# ~patterns-and-results))))

;; TODO - it would be useful to have something like a `replace-all` function as well
