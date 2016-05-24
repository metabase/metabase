(ns metabase.util.honeysql-extensions
  "Tweaks an utils for HoneySQL."
  (:require [clojure.string :as s]
            [honeysql.format :as hformat]))

;; Add an `:h2` quote style that uppercases the identifier
(let [quote-fns     @(resolve 'honeysql.format/quote-fns)
      ansi-quote-fn (:ansi quote-fns)]
  (intern 'honeysql.format 'quote-fns
          (assoc quote-fns :h2 (comp s/upper-case ansi-quote-fn))))
