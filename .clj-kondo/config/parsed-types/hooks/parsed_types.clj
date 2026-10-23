(ns hooks.parsed-types
  "How clj-kondo reads `defparsed`: the type, then every check as the fn it compiles to, so a check that uses a field
  it did not name is an unresolved symbol, and one that names a field it does not use is an unused binding.")

(defmacro defparsed [parsed-name fields & clauses]
  `(do
     (deftype ~parsed-name ~fields)
     ~@(for [[head & args] clauses
             :when (symbol? head)]
         ;; by name, so a qualified head such as pt/pure, which the real macro accepts, is read too
         (case (symbol (name head))
           (pure external)
           (let [[_ _ & more]  args
                 more          (if (map? (first more)) (rest more) more)
                 [argv & more] more
                 [binds body]  (if (and (= 'external (symbol (name head))) (vector? (first more)) (next more))
                                 [(first more) (rest more)]
                                 [[] more])]
             ;; the body in a `do`, so a check whose body is one call is not read as a redundant fn wrapper
             `(fn [~@argv ~@(take-nth 2 binds)] (do ~@body)))

           fetch
           (let [[_ _ f] args] f)

           nil))))

(defmacro match
  "Each clause as a `let` of its binding to the value, so an unused binding is reported and each type must resolve.
  Exhaustiveness is checked by the real macro, when compiling."
  [sum-name x & clauses]
  (let [v (gensym "v")]
    `(let [~v ~x]
       ~sum-name
       [~@(for [[t b e] (partition 3 clauses)]
            `(let [~b ~v] ~t ~e))])))
