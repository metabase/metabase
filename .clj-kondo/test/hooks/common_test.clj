(ns ^:mb/once hooks.common-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.common]))

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
