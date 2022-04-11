(ns metabase.mbql.js-test
  (:require [metabase.mbql.js :as mbql.js]
            [cljs.test :as t]))

(t/deftest normalize-test
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
