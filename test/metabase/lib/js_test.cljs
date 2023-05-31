(ns metabase.lib.js-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.js :as lib.js]))

(deftest query=-test
  (doseq [q1 [nil js/undefined]
          q2 [nil js/undefined]]
    (is (lib.js/query= q1 q2)))

  (testing "explicit fields vs. implied fields"
    (let [q1 #js {"query" #js {"source-table" 1}}
          q2 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 1 nil]
                                             #js ["field" 2 nil]
                                             #js ["field" 3 nil]
                                             #js ["field" 4 nil]
                                             #js ["field" 4 nil] ; duplicates are okay
                                             #js ["field" 4 nil]
                                             #js ["field" 5 nil]
                                             #js ["field" 6 nil]
                                             #js ["field" 7 nil]]}}
            ;; Note that the order is not relevant; they get grouped.
            ;; Duplicates are okay, and are tracked.
          field-ids #js [1 2 6 7 3 5 4 4 4]]
      (is (not (lib.js/query= q1 q2))
          "the field-ids must be provided to populate q1")
      (is (lib.js/query= q1 q1 field-ids))
      (is (not (lib.js/query= q1 q2 (conj (vec field-ids) 2)))
          "duplicates are tracked, so an extra dupe breaks it")))

  (testing "missing and extra fields"
    (let [q1 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 1 nil]
                                             #js ["field" 2 nil]]}}

          ;; Same fields, different order.
          q2 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 2 nil]
                                             #js ["field" 1 nil]]}}
          ;; Different fields
          q3 #js {"query" #js {"source-table" 1
                               "fields" #js [#js ["field" 3 nil]
                                             #js ["field" 1 nil]]}}]
      (is (lib.js/query= q1 q2))
      (is (not (lib.js/query= q1 q3)))
      (is (not (lib.js/query= q2 q3))))))

(deftype FakeJoin [guts]
  Object
  (raw [_this] guts))

(deftest query=-unwrapping-test
  (testing "JS wrapper types like Join get unwrapped"
    ;; This doesn't use the real Join classes, just pretends it has one.
    (let [join         #js {"alias" "Products"
                            "condition" #js ["=" #js ["field" 7 nil] #js ["field" 19 nil]]}
          join-class   (FakeJoin. join)
          basic-query  #js {"type"  "query"
                            "query" #js {"joins" #js [join]}}
          classy-query #js {"type"  "query"
                            "query" #js {"joins" #js [join-class]}}
          ]
      (is (not= join join-class))
      (is (not= (js->clj join) (js->clj join-class)))
      (is (lib.js/query= basic-query classy-query)))))
