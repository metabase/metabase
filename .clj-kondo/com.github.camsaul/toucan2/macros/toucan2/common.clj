(ns macros.toucan2.common)

(defn ignore-unused [symb]
  (vary-meta symb assoc :clj-kondo/ignore [:unused-binding]))
