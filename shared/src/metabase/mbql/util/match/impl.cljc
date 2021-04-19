(ns metabase.mbql.util.match.impl
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly.")

;; have to do this at runtime because we don't know if a symbol is a class or pred or whatever when we compile the macro
(defn match-with-pred-or-class
  "Return a function to use for pattern matching via `core.match`'s `:guard` functionality based on the value of a
  `pred-or-class` passed in as a pattern to `match` or `replace`.

  (Class-based matching currently only works in Clojure. For ClojureScript, only predicate function matching works.)"
  [pred-or-class]
  (cond
    ;; TODO -- FIXME -- Figure out how to make this work in JS
    #?@(:clj [(class? pred-or-class)
              (partial instance? pred-or-class)])

    (fn? pred-or-class)
    pred-or-class

    :else
    ;; this is dev-specific so we don't need to localize it
    (throw (ex-info "Invalid pattern: don't know how to handle symbol." {:symbol pred-or-class}))))

(defn match-in-collection
  "Internal impl for `match`. If `form` is a collection, call `match-fn` to recursively look for matches in it."
  [match-fn clause-parents form]
  {:pre [(fn? match-fn) (vector? clause-parents)]}
  (cond
    (map? form)
    (reduce concat (for [[k v] form]
                     (match-fn (conj clause-parents k) v)))

    (sequential? form)
    (mapcat (partial match-fn (if (keyword? (first form))
                                (conj clause-parents (first form))
                                clause-parents))
            form)))

(defn replace-in-collection
  "Inernal impl for `replace`. Recursively replace values in a collection using a `replace-fn`."
  [replace-fn clause-parents form]
  (cond
    (map? form)
    (into form (for [[k v] form]
                 [k (replace-fn (conj clause-parents k) v)]))

    (sequential? form)
    (mapv (partial replace-fn (if (keyword? (first form))
                                (conj clause-parents (first form))
                                clause-parents))
          form)
    :else              form))

(defn update-in-unless-empty
  "Like `update-in`, but only updates in the existing value is non-empty."
  [m ks f & args]
  (if-not (seq (get-in m ks))
    m
    (apply update-in m ks f args)))
