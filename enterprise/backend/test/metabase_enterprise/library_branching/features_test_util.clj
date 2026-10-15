(ns metabase-enterprise.library-branching.features-test-util
  "The premium features that the app-DB tests of library branching run with."
  (:require
   [metabase.test :as mt]))

(def features
  "The premium features of the instance in the app-DB tests of the module: `:library` turns on the Library's content
  rule, as on a production instance."
  #{:library})

(defn with-features
  "A `:once` fixture: calls `thunk` with [[features]] as the premium features of the instance."
  [thunk]
  (mt/with-premium-features features
    (thunk)))
