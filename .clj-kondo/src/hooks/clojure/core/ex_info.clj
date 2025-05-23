(ns hooks.clojure.core.ex-info
  (:require
   [clj-kondo.hooks-api :as api]))

(def ^:private i18n-macros #{'tru
                             'deferred-tru
                             'deferred-trs
                             'trs
                             'trun
                             'deferred-trun
                             'deferred-trsn
                             'trsn
                             'tru-clj
                             'deferred-tru-clj
                             'deferred-trs-clj
                             'trs-clj
                             'trun-clj
                             'deferred-trun-clj
                             'deferred-trsn-clj
                             'trsn-clj})
;; allow ex-infos that are just rethrowing other messages with
;; additional data
(def ^:private ex-message #{'ex-message})

(defn- is-i18n-wrapped? [message-expr]
  (and (seq? message-expr)
       (let [{:keys [name ns]} (api/resolve {:name (first message-expr)})]
         (or (and (= 'metabase.util.i18n ns)
                  (contains? i18n-macros name))
             (and (= 'clojure.core ns)
                  (contains? ex-message name))))))

(defn- is-i18n-var? [message-expr]
  (boolean
   (and (symbol? message-expr)
        (get (api/env) message-expr))))

(defn ex-info
  "Checks if the first argument to ex-info (the message) is properly wrapped in an i18n macro.
  This ensures all exception messages are internationalized.

  Validates that:
  1. The message is wrapped in an i18n macro like tru/trs
  2. Or the message is a variable
  3. Or that we are rethrowing a message using ex-message

  Reports a linting error if these conditions aren't met.

  TODO: Is is possible to check at least for a local variable if it was defined using a i18n macro  "
  [{:keys [node]}]
  (let [args (rest (:children node))
        message-node (first args)]
    (when message-node
      (let [message-expr (api/sexpr message-node)]
        (when-not (or (is-i18n-wrapped? message-expr)
                      (is-i18n-var? message-expr))
          (api/reg-finding!
           {:message "ex-info message should be wrapped in tru/trs or deferred-tru/trs for i18n"
            :type :metabase/i18n-ex-info
            :node message-node}))))
    {:node node}))
