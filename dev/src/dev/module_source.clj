(ns dev.module-source
  "Which namespaces a Clojure source file requires: statically in its `ns` form, and dynamically through `require`,
  `requiring-resolve` and their aliases.

  [[dev.module-history]] caches parsed files under a hash of this file, so code that does not affect parsing belongs
  elsewhere."
  (:require
   [clojure.tools.namespace.parse :as ns.parse]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser])
  (:import
   (java.io PushbackReader StringReader)))

(set! *warn-on-reflection* true)

(defn skip-node?
  "Whether a rewrite-clj `node` is whitespace, a comment, a `#_` form or a `(comment ...)` block."
  [node]
  (let [tag (n/tag node)]
    (or (#{:uneval :comment :newline :whitespace} tag)
        (and (= tag :list)
             (when-let [fst (first (n/children node))]
               (and (= (n/tag fst) :token)
                    (= (:value fst) 'comment)))))))

(defn walk-parsed-ignore-comments!
  "Call `f`, for its side effects, on each node of `tree`, a rewrite-clj parse, skipping comments and their contents."
  [f tree]
  (letfn [(walk [node]
            (when-not (skip-node? node)
              ;; Don't descend into comments
              (f node)
              (when-let [children (:children node)]
                (run! walk children))))]
    (walk tree)))

(def ^:private require-symbols
  '#{require
     clojure.core/require
     classloader/require
     metabase.classloader.core/require
     metabase.classloader.impl/require
     requiring-resolve
     clojure.core/requiring-resolve})

(defn dynamic-requires
  "Namespaces that `(require ...)` forms and their aliases load anywhere in `tree`, a rewrite-clj parse.
  Comments are ignored."
  [tree]
  (let [acc (atom #{})]
    (walk-parsed-ignore-comments!
     (fn [node]
       (when (= (n/tag node) :list)
         (when-let [[first-child & other :as children] (remove skip-node? (n/children node))]
           (when (and first-child
                      (= (n/tag first-child) :token)
                      ;; Check all child symbols on the line since `require` might be called in a threading macro
                      ;; like (-> 'ns require)
                      (some #(and (= (n/tag %) :token)
                                  (require-symbols (n/sexpr %)))
                            children))
             (run! #(when (= (n/tag %) :quote)
                      (when-let [in (some-> (n/children %) first n/sexpr)]
                        (when (symbol? in)
                          (swap! acc conj (if (qualified-symbol? in)
                                            (symbol (namespace in))
                                            in)))))
                   other)))))
     tree)
    @acc))

(defn source-requires
  "The namespace that Clojure `source` text declares and the namespaces it requires, as
  `{:namespace ns, :static #{...}, :dynamic #{...}}`.
  The `:namespace` is `nil` when the source has no `ns` form."
  [^String source]
  (let [decl (with-open [reader (PushbackReader. (StringReader. source))]
               (ns.parse/read-ns-decl reader))]
    {:namespace (some-> decl ns.parse/name-from-ns-decl)
     :static    (set (some-> decl ns.parse/deps-from-ns-decl))
     :dynamic   (dynamic-requires (r.parser/parse-string-all source))}))
