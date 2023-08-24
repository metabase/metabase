(ns metabase.lib.js.metadata-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.js.metadata :as lib.js.metadata]))

(deftest ^:parallel parse-fields-test
  (let [metadata-fragment #js {:fields #js {"card__1234:5678" #js {:id 0}
                                            "5678" #js {:id 1}
                                            "8765" #js {:id 2}
                                            "card__1234:4321" #js {:id 3}}}
        parsed-fragment (lib.js.metadata/parse-objects :field metadata-fragment)]
    (is (every? delay? (vals parsed-fragment)))
    (is (= {4321 {:lib/type :metadata/column, :id 3}
            5678 {:lib/type :metadata/column, :id 1}
            8765 {:lib/type :metadata/column, :id 2}}
           (update-vals parsed-fragment deref)))))
