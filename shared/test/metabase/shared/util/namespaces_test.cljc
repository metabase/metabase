(ns metabase.shared.util.namespaces-test
  (:require
   [clojure.test :refer [deftest is testing are]]
   [metabase.shared.formatting.date :as shared.formatting.date]
   [metabase.shared.util.namespaces :as shared.ns]))

#?(:clj
   (deftest ^:synchronized arity-form-test
     (with-redefs [gensym (fn [prefix]
                            (symbol (str prefix "1234")))]
       (are [arglist expected-form] (= expected-form
                                       (#'shared.ns/arity-form 'imported/fn arglist))
         '[x]
         '([x]
           (imported/fn x))

         '[x y]
         '([x y]
           (imported/fn x y))

         '[{:destructured :map} x]
         '([arg-1234 x]
           (imported/fn arg-1234 x))

         '[x & more]
         '([x & more]
           (apply imported/fn x more))))))

;;; this is just an arbitrarily selected function that has `:export` metadata; we can change it to something else if
;;; it changes upstream.
(shared.ns/import-fn ^::extra-key shared.formatting.date/format-for-parameter)

(deftest ^:parallel import-fn-test
  (testing "Should copy important metadata from the source var"
    (is (:export (meta #'format-for-parameter)))
    (is (= (select-keys (meta #'shared.formatting.date/format-for-parameter) [:export :arglists :doc])
           (select-keys (meta #'format-for-parameter) [:export :arglists :doc]))))
  (testing "Should preserve metadata on the symbol(s) passed to import-fn(s)"
    (is (::extra-key (meta #'format-for-parameter)))))
