(ns hooks.parsed-types
  "How clj-kondo reads `defparsed`: the type, then every check as the fn it compiles to, so a check that uses a field
  it did not name is an unresolved symbol, and one that names a field it does not use is an unused binding.")

(defmacro defparsed [parsed-name fields & clauses]
  (let [decl (symbol (str parsed-name "-declaration"))]
    `(do
       (deftype ~parsed-name ~fields)
       (def ~decl
         [~@(for [[head & args] clauses]
              (case head
                (pure external)
                (let [[_ _ & more]  args
                      more          (if (map? (first more)) (rest more) more)
                      [argv & more] more
                      [binds body]  (if (and (= 'external head) (vector? (first more)) (next more))
                                      [(first more) (rest more)]
                                      [[] more])]
                  `(fn [~@argv ~@(take-nth 2 binds)] ~@body))

                fetch
                (let [[_ _ f] args] f)

                nil))]))))

(defmacro match
  "Each clause as a `let` of its binding to the value, so an unused binding is reported and each type must resolve.
  Exhaustiveness is checked by the real macro, when compiling."
  [sum-name x & clauses]
  (let [v (gensym "v")]
    `(let [~v ~x]
       ~sum-name
       [~@(for [[t b e] (partition 3 clauses)]
            `(let [~b ~v] ~t ~e))])))
