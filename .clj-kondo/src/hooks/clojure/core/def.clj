(ns hooks.clojure.core.def
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]))

(defn- uppercase-name?
  "Whether the symbol is clearly an uppercase name like `TYPE-CONSTANTS` or `SOME_CONSTANT` or `TYPE->MODEL`."
  [s]
  (and (re-find #"[A-Z0-9]+(?:[-_]>?[A-Z0-9]+)+" s)
       ;; ignore stuff like `->SCREAMING_SNAKE_CASE`... this is ok
       (not (str/includes? s "SCREAMING_SNAKE_CASE"))))

(defn- has-underscores? [s]
  (and (str/includes? s "_")
       ;; ignore stuff like `->snake_case` and `->SCREAMING_SNAKE_CASE`
       (not (str/includes? s "snake_case"))
       (not (str/includes? s "SCREAMING_SNAKE_CASE"))))

(defn-  check-symbol-is-kebab-case [symbol-node]
  (let [symb (hooks/sexpr symbol-node)
        s    (str symb)]
    (cond
      (uppercase-name? s)
      (hooks/reg-finding!
       (assoc (meta symbol-node)
              :message "Use lower-case names for functions and variables; don't use special notation for constants. [:metabase/check-def-check-not-all-uppercase]"
              :type    :metabase/check-def-check-not-uppercase-name))

      (has-underscores? s)
      (hooks/reg-finding!
       (assoc (meta symbol-node)
              :message "Use kebab-case names for functions and variables. [:metabase/check-def-no-underscores]"
              :type    :metabase/check-def-no-underscores)))))

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
