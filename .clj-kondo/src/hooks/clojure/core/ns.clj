(ns hooks.clojure.core.ns
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.common]
   [hooks.common.modules :as modules]))

(defn- ns-form-node->require-node [ns-form-node]
  (some (fn [node]
          (when (and (hooks/list-node? node)
                     (let [first-child (first (:children node))]
                       (and (hooks/keyword-node? first-child)
                            (= (hooks/sexpr first-child) :require))))
            node))
        (:children ns-form-node)))

(defn- lint-require-shapes [ns-form-node]
  (doseq [node (-> ns-form-node
                   ns-form-node->require-node
                   :children
                   rest)]
    (cond
      (not (hooks/vector-node? node))
      (hooks/reg-finding! (assoc (meta node)
                                 :message "All :required namespaces should be wrapped in vectors [:metabase/require-shape-checker]"
                                 :type    :metabase/require-shape-checker))

      (hooks/vector-node? (second (:children node)))
      (hooks/reg-finding! (assoc (meta node)
                                 :message "Don't use prefix forms inside :require [:metabase/require-shape-checker]"
                                 :type    :metabase/require-shape-checker)))))

(defn- lint-requires-on-new-lines [ns-form-node]
  (let [[require-keyword first-require] (-> ns-form-node
                                            ns-form-node->require-node
                                            :children)]
    (when-let [require-keyword-line (:row (meta require-keyword))]
      (when-let [first-require-line (:row (meta first-require))]
        (when (= require-keyword-line first-require-line)
          (hooks/reg-finding! (assoc (meta first-require)
                                     :message "Put your requires on a newline from the :require keyword [:metabase/require-shape-checker]"
                                     :type    :metabase/require-shape-checker)))))))

(defn- require-node->namespace-symb-nodes [require-node]
  (let [[_ns & args] (:children require-node)]
    (into []
          ;; prefixed namespace forms are NOT SUPPORTED!!!!!!!!1
          (keep (fn [node]
                  (cond
                    (hooks/vector-node? node)
                    ;; propagate the metadata attached to this vector in case there's a `:clj-kondo/ignore` form.
                    (let [symbol-node (first (:children node))]
                      (hooks.common/merge-ignored-linters symbol-node require-node node))

                    ;; this should also be dead code since we require requires to be vectors
                    (hooks/token-node? node)
                    (hooks.common/merge-ignored-linters node require-node)

                    :else
                    (printf "Don't know how to figure out what namespace is being required in %s\n" (pr-str node)))))
          args)))

(defn- ns-form-node->ns-symb-node [ns-form-node]
  (some (fn [node]
          (when (and (hooks/token-node? node)
                     (not= (hooks/sexpr node) 'ns))
            node))
        (:children ns-form-node)))

(defn- ns-form-node->ns-symb [ns-form-node]
  (some-> (ns-form-node->ns-symb-node ns-form-node)
          hooks/sexpr))

(defn- lint-modules [ns-form-node config]
  (let [ns-symb (ns-form-node->ns-symb ns-form-node)]
    (when-not (modules/ignored-namespace? config ns-symb)
      (when-let [current-module (modules/module ns-symb)]
        (let [required-namespace-symb-nodes (-> ns-form-node
                                                ns-form-node->require-node
                                                require-node->namespace-symb-nodes)]
          (doseq [node  required-namespace-symb-nodes
                  :when (not (contains? (hooks.common/ignored-linters node) :metabase/modules))
                  :let  [required-namespace (hooks/sexpr node)
                         error              (modules/usage-error config current-module required-namespace)]
                  :when error]
            (hooks/reg-finding! (assoc (meta node)
                                       :message error
                                       :type    :metabase/modules))))))))

(defn- lint-namespace-name [ns-form-node]
  (when-let [ns-symb-node (ns-form-node->ns-symb-node ns-form-node)]
    (when-not (contains? (hooks.common/ignored-linters ns-symb-node) :metabase/namespace-name)
      (let [parts (str/split (str (hooks/sexpr ns-symb-node)) #"\.")]
        (when (and (<= (count parts) 2)
                   (#{"metabase" "metabase-enterprise"} (first parts))
                   ;; exclude test namespaces for now
                   (not (str/ends-with? (last parts) "test")))
          (hooks/reg-finding! (assoc (meta ns-symb-node)
                                     :message "Metabase namespaces should have the form metabase[-enterprise].<module>.* [:metabase/namespace-name]"
                                     :type    :metabase/namespace-name)))))))

(defn- ns-form-node->import-node [ns-form-node]
  (some (fn [node]
          (when (and (hooks/list-node? node)
                     (let [first-child (first (:children node))]
                       (and (hooks/keyword-node? first-child)
                            (= (hooks/sexpr first-child) :import))))
            node))
        (:children ns-form-node)))

(defn- jsqlparser-import?
  "Check if a symbol or string represents a jsqlparser import."
  [s]
  (str/starts-with? (str s) "net.sf.jsqlparser"))

(defn- lint-jsqlparser-imports [ns-form-node]
  (when-let [import-node (ns-form-node->import-node ns-form-node)]
    (doseq [node (rest (:children import-node))
            :when (not (contains? (hooks.common/ignored-linters node) :metabase/no-jsqlparser-imports))]
      (cond
        ;; Handle (net.sf.jsqlparser.foo Bar Baz) form
        (hooks/list-node? node)
        (let [package-node (first (:children node))
              package-name (when package-node (str (hooks/sexpr package-node)))]
          (when (jsqlparser-import? package-name)
            (hooks/reg-finding! (assoc (meta node)
                                       :message "Don't import net.sf.jsqlparser classes directly. This code should be agnostic to the parsing library. [:metabase/no-jsqlparser-imports]"
                                       :type    :metabase/no-jsqlparser-imports))))

        ;; Handle net.sf.jsqlparser.foo.Bar form (single class import)
        (hooks/token-node? node)
        (when (jsqlparser-import? (hooks/sexpr node))
          (hooks/reg-finding! (assoc (meta node)
                                     :message "Don't import net.sf.jsqlparser classes directly. This code should be agnostic to the parsing library. [:metabase/no-jsqlparser-imports]"
                                     :type    :metabase/no-jsqlparser-imports)))))))

(defn lint-ns [x]
  (doto (:node x)
    lint-require-shapes
    lint-requires-on-new-lines
    (lint-modules (modules/config x))
    lint-namespace-name
    lint-jsqlparser-imports)
  x)

(comment
  (lint-ns
   {:node (hooks/parse-string
           (pr-str
            '(ns hooks.clojure.core.ns
               (:require
                [clj-kondo.hooks-api :as hooks]
                [clojure.string :as str]
                [hooks.common]
                [hooks.common.modules :as modules]))))}))
