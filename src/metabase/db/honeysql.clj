(ns metabase.db.honeysql
  "HoneySQL 1.x customizations specifically for the app DB."
  (:require [honeysql.format :as hformat]
            [metabase.util :as u]))

;; Add an `:h2` quote style that uppercases the identifier
(let [{ansi-quote-fn :ansi} @#'hformat/quote-fns]
  (alter-var-root #'hformat/quote-fns assoc :h2 (comp u/upper-case-en ansi-quote-fn)))
