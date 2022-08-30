(ns macros.common
  "Helpers for common Metabase macro shapes so we don't have to define the same macroexpansions over and over.")

(defn ignore-unused [symb]
  (vary-meta symb assoc :clj-kondo/ignore [:unused-binding]))

(defmacro let-one-with-optional-value
  "This is exactly like [[clojure.core/let]] but the right-hand side of the binding, `value`, is optional, and only one
  binding can be established."
  [[binding value] & body]
  `(let [~binding ~value]
     ~@body))

(defmacro with-one-binding
  "Helper for macros that have a shape like

    (my-macro [x]
      ...)

    =>

    (let [x nil]
      ...)

  Binding is optional and `_` will be substituted if not supplied."
  [[x] & body]
  `(let [~(or x '_) nil]
     ~@body))

(defmacro with-two-bindings
  "Helper for macros that have a shape like

    (my-macro [x y]
      ...)

    =>

    (let [x nil, y nil]
      ...)

  All bindings are optional and `_` will be substituted if not supplied."
  [[x y] & body]
  `(let [~(or x '_) nil
         ~(or y '_) nil]
     ~@body))

(defmacro with-three-bindings
  "Helper for macros that have a shape like

    (my-macro [x y z]
      ...)

    =>

    (let [x nil, y nil, z nil]
      ...)

  All bindings are optional and `_` will be substituted if not supplied."
  [[x y z] & body]
  `(let [~(or x '_) nil
         ~(or y '_) nil
         ~(or z '_) nil]
     ~@body))

(defmacro with-four-bindings
  "Helper for macros that have a shape like

    (my-macro [a b c d]
      ...)

    =>

    (let [a nil, b nil, c nil, d nil]
      ...)

  All bindings are optional and `_` will be substituted if not supplied."
  [[a b c d] & body]
  `(let [~(or a '_) nil
         ~(or b '_) nil
         ~(or c '_) nil
         ~(or d '_) nil]
     ~@body))

(defmacro with-one-top-level-binding
  "Helper for macros that have a shape like

    (my-macro x
      ...)

    =>

    (let [x nil nil]
      ...)"
  [x & body]
  `(let [~x nil]
     ~@body))

(defmacro with-two-top-level-bindings
  "Helper for macros that have a shape like

    (my-macro x y
      ...)

    =>

    (let [x nil, y nil]
      ...)"
  [x y & body]
  `(let [~x nil
         ~y nil]
     ~@body))

(defmacro with-ignored-first-arg
  "For macros like

    (discard-setting-changes [setting-1 setting-2]
      ...)

    =>

    (do ...)

  where the first arg ought to be ignored for linting purposes."
  [_x & body]
  `(do ~@body))

(defmacro do*
  "Like [[clojure.core/do]] but doesn't cause Kondo to complain about redundant dos."
  [& body]
  `(do ~@body))
