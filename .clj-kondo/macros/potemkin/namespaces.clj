(ns macros.potemkin.namespaces)

(defn- import-var-expansion
  "Expansion shared by all of the `import-*` replacements below. Synthetic \"docstring\" is needed to silence
  `:missing-docstring` linter."
  ([sym]
   (import-var-expansion sym (-> sym name symbol)))
  ([sym new-name]
   `(def ~new-name "docstring" ~sym)))

(defmacro import-def
  ([sym]          (import-var-expansion sym))
  ([sym new-name] (import-var-expansion sym new-name)))

(defmacro import-fn
  ([sym]          (import-var-expansion sym))
  ([sym new-name] (import-var-expansion sym new-name)))

(defmacro import-macro
  ([sym]          (import-var-expansion sym))
  ([sym new-name] (import-var-expansion sym new-name)))
