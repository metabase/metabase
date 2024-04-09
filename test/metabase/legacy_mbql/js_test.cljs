(ns ^:mb/once metabase.legacy-mbql.js-test
  (:require
   [cljs.test :as t]
   [metabase.legacy-mbql.js :as mbql.js]))

(t/deftest ^:parallel normalize-test
  (t/testing "normalize should preserve keyword namespaces"
    (let [js-query #js {"database" 1
                        "type"     "query"
                        "query"    #js {"source-table" 2
                                        "fields"       #js [#js ["field" "my_field" #js {"base-type" "type/Text"}]]}}]
      (t/is (= {"database" 1
                "type"     "query"
                "query"    {"source-table" 2
                            "fields"       [["field" "my_field" {"base-type" "type/Text"}]]}}
               (-> js-query mbql.js/normalize js->clj))))))
