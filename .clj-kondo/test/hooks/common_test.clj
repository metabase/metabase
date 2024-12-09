(ns ^:mb/once hooks.common-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.common]))

(deftest ^:parallel ignored-linters-test
  (doseq [ignored [":metabase/ns-module-checker"
                   "[:metabase/ns-module-checker]"
                   "(:metabase/ns-module-checker)"]
          prefix ["#_"
                  "^"]
          :let [s (format "%s{:clj-kondo/ignore %s} [metabase.search.config :as search.config]"
                          prefix
                          ignored)]]
    (testing (pr-str s)
      (is (= #{:metabase/ns-module-checker}
             (hooks.common/ignored-linters (api/parse-string s)))))))

(deftest ^:parallel merge-ignored-linters-test
  (let [node-1  (api/parse-string "#_{:clj-kondo/ignore [:a]} [:a]")
        node-2  (api/parse-string "#_{:clj-kondo/ignore [:b]} [:b]")
        node-3  (api/parse-string "#_{:clj-kondo/ignore [:c]} [:c]")
        node-1' (hooks.common/merge-ignored-linters node-1 node-2 node-3)]
    (is (= #{:a :b :c}
           (hooks.common/ignored-linters node-1')))
    (testing "Updated metadata should match the shape Kondo expects"
      (is (=? {:clj-kondo/ignore {:linters api/vector-node?}}
              (meta node-1')))
      (let [children (-> node-1' meta :clj-kondo/ignore :linters :children)]
        (is (= (count children) 3))
        (is (every? api/keyword-node? children))
        (is (= [:a :b :c]
               (sort (map api/sexpr children))))))))

(deftest ^:parallel node->qualified-symbol-test
  (binding [clj-kondo.impl.utils/*ctx* {:namespaces (atom nil)}]
    (is (= 'metabase.util.i18n/tru
           (hooks.common/node->qualified-symbol (api/parse-string "metabase.util.i18n/tru"))))))

(deftest ^:parallel node->qualified-symbol-test-2
  (binding [clj-kondo.impl.utils/*ctx* {:namespaces (atom {:clj {:clj '{hooks.common-test {:qualify-ns {i18n metabase.util.i18n}}}}})
                                        :lang       :clj
                                        :base-lang  :clj
                                        :ns         {:name 'hooks.common-test}}]
    (is (= 'metabase.util.i18n/tru
           (hooks.common/node->qualified-symbol (api/parse-string "i18n/tru"))))))
