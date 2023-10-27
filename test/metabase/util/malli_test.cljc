(ns metabase.util.malli-test
  (:require
   #?@(:clj
       [[metabase.util.malli]
        [clojure.test :refer [deftest is]]])))

#?(:clj
   (deftest ^:parallel macroexpand-defmethod-cljs-test
     (is (= '(clojure.core/defmethod x :wow
               ([a b]
                (+ a b))
               ([a b & more]
                (reduce + (list* a b more))))
            (macroexpand-1
             '(metabase.util.malli/-defmethod-cljs
               x :wow :- :int
               ([a b]
                (+ a b))
               ([a :- :int
                 b :- :int
                 & more]
                (reduce + (list* a b more)))))))))
