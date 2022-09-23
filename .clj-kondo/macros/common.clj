(ns macros.common
  "Helpers for common Metabase macro shapes so we don't have to define the same macroexpansions over and over.")

(defn ignore-unused [symb]
  (vary-meta symb assoc :clj-kondo/ignore [:unused-binding]))
