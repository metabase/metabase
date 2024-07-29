(ns metabase.lib.util.match.impl
  "Internal implementation of the MBQL `match` and `replace` macros. Don't use these directly.")

;; have to do this at runtime because we don't know if a symbol is a class or pred or whatever when we compile the macro
(defn match-with-pred-or-class
  "Return a function to use for pattern matching via `core.match`'s `:guard` functionality based on the value of a
  `pred-or-class` passed in as a pattern to `match` or `replace`.

  (Class-based matching currently only works in Clojure. For ClojureScript, only predicate function matching works.)"
  [pred-or-class]
  (cond
    ;; If this function is ever used from JS, we need to figure out how to do this
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
    (reduce-kv (fn [acc k v]
                 (if-let [match (match-fn (conj clause-parents k) v)]
                   ;; Deliberately not using into to avoid converting to transient and back.
                   (reduce conj acc match)
                   acc))
               [] form)

    (sequential? form)
    (let [fst (first form)
          k (if (keyword? fst)
              (conj clause-parents fst)
              clause-parents)]
      (reduce (fn [acc v]
                (if-let [match (match-fn k v)]
                  (reduce conj acc match)
                  acc))
              [] form))))

(defn replace-in-collection
  "Inernal impl for `replace`. Recursively replace values in a collection using a `replace-fn`."
  [replace-fn clause-parents form]
  (cond
    (map? form)
    (reduce-kv (fn [form k v]
                 (assoc form k (replace-fn (conj clause-parents k) v)))
               form form)

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
