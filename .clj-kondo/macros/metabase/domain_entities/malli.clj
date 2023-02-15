(ns macros.metabase.domain-entities.malli)

(defmacro def-getters-and-setters [schema & defs]
  (let [res `(do
     (comment ~schema) ;; Reference the schema
     ~@(for [[sym _path] (partition 2 defs)]
         `(do
            (defn ~sym "docs" [_x#] nil)
            (defn ~(symbol (str "with-" (name sym))) "docs" [x# _new#] x#)
            (defn ~(symbol (str (name sym) "-js")) "docs" [x#] x#))))]
    #_(spit "/Users/braden/macroexpandsion.clj"
          (pr-str {:schema schema :defs defs :result res}))
    res))
