(ns hooks.clojure.core
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(defn- all-uppercase? [symb]
  (let [s (str symb)]
    (= s #_{:clj-kondo/ignore [:discouraged-var]} (str/upper-case s))))

(defn- has-underscores? [symb]
  (str/includes? (str symb) "_"))

(defn-  check-symbol-is-kebab-case [symbol-node]
  (let [symb (hooks/sexpr symbol-node)]
    (when (or (all-uppercase? symb)
              (has-underscores? symb))
      (hooks/reg-finding! (assoc (meta symbol-node)
                                 :message "Use kebab-case for function and variable names; don't use special notation for constants."
                                 :type    :metabase/check-def-kebab-case)))))

(defn lint-def* [{:keys [node]}]
  (let [[_def & args] (:children node)
        name-symbol   (some (fn [arg]
                              (when (and (hooks/token-node? arg)
                                         (symbol? (hooks/sexpr arg)))
                                arg))
                            args)]
    (check-symbol-is-kebab-case name-symbol)))

(defn lint-def [x]
  (lint-def* x)
  x)

(comment
  (defn x []
    (let [node (-> "(def ^:private TYPE->MODEL {\"document\" :model/Document})"
                   hooks/parse-string)]
      (lint-def {:node node}))))
