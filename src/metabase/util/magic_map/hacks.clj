(ns metabase.util.magic-map.hacks
  "Proof-of-concept hacks to get magic maps working"
  (:require [clojure.tools.logging :as log]
            [metabase.util.magic-map :as magic-map]
            [toucan
             [db :as db]
             [models :as t.models]]))

(println "🧙‍♂️🧙‍♂️🧙‍♂️ INSTALLING MAGIC-MAP HACKS 🧙‍♂️🧙‍♂️🧙‍♂️")

;; TODO -- should we add watches to reinstall the advice if the original var changes? Although I guess if we were in
;; the business of changing the original var, we wouldn't need advice
(defmacro define-around-advice
  {:style/indent :defn}
  [symb advice-name & fn-tail]
  {:pre [(symbol? symb) (symbol? advice-name)]}
  (let [advice-key (keyword "around-advice" (name advice-name))]
    `(do
       (when-not (~advice-key (meta #'~symb))
         (alter-meta! #'~symb assoc ~advice-key @#'~symb))
       (let [~'&original (~advice-key (meta #'~symb))]
         (alter-var-root #'~symb (constantly
                                  (fn ~@fn-tail)))
         (log/tracef "added %s %s -> %s -> %s" ~advice-key #'~symb ~'&original @#'~symb)))))

(defmacro remove-around-advice [symb advice-name]
  {:pre [(symbol? symb) (symbol? advice-name)]}
  (let [advice-key (keyword "around-advice" (name advice-name))]
    `(when-let [~'&original (~advice-key (meta #'~symb))]
       (alter-meta! #'~symb dissoc ~advice-key)
       (alter-var-root #'~symb (constantly ~'&original))
       (log/tracef "removed %s %s -> %s" ~advice-key #'~symb @#'~symb))))

(define-around-advice db/do-post-select convert-to-magic-maps [model objects]
  (for [m (&original model objects)]
    (magic-map/toucan-instance->magic-map m)))

(define-around-advice t.models/do-pre-update convert-to-magic-maps [model object]
  (println "model:" model) ; NOCOMMIT
  (println "object:" (class object) object) ; NOCOMMIT
  (&original model (magic-map/->toucan-instance (class model) object)))

(define-around-advice db/execute! extra-exception-info [honeysql-form & options]
  (try
    (apply &original honeysql-form options)
    (catch Throwable e
      (throw (ex-info "Error executing statement" {:honeysql-form honeysql-form} e)))))
