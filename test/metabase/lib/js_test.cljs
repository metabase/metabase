(ns metabase.lib.js-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [goog.object :as gobject]
   [metabase.lib.js :as lib.js]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.test.util.js :as test.js]))

(deftest ^:parallel query=-test
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

(deftest ^:parallel query=-unwrapping-test
  (testing "JS wrapper types like Join get unwrapped"
    ;; This doesn't use the real Join classes, just pretends it has one.
    (let [join         #js {"alias" "Products"
                            "condition" #js ["=" #js ["field" 7 nil] #js ["field" 19 nil]]}
          join-class   (FakeJoin. join)
          basic-query  #js {"type"  "query"
                            "query" #js {"joins" #js [join]}}
          classy-query #js {"type"  "query"
                            "query" #js {"joins" #js [join-class]}}]
      (is (not= join join-class))
      (is (not= (js->clj join) (js->clj join-class)))
      (is (lib.js/query= basic-query classy-query)))))

(deftest ^:parallel available-join-strategies-test
  (testing "available-join-strategies returns an array of opaque strategy objects (#32089)"
    (let [strategies (lib.js/available-join-strategies lib.tu/query-with-join -1)]
      (is (array? strategies))
      (is (= [{:lib/type :option/join.strategy, :strategy :left-join, :default true}
              {:lib/type :option/join.strategy, :strategy :right-join}
              {:lib/type :option/join.strategy, :strategy :inner-join}]
             (vec strategies))))))

(deftest ^:parallel required-native-extras-test
  (let [db                (update meta/database :features conj :native-requires-specified-collection)
        metadata-provider (lib.tu/mock-metadata-provider {:database db})
        extras            (lib.js/required-native-extras (:id db) metadata-provider)]
    ;; apparently #js ["collection"] is not equal to #js ["collection"]
    (is (= js/Array
           (type extras))
        "should be a JS array")
    (is (= ["collection"]
           (js->clj extras)))))

(defn- add-undefined-params
  "This simulates the FE setting some parameters to js/undefined."
  [template-tags param-name]
  (doto (gobject/get template-tags param-name)
    (gobject/add "options" js/undefined)
    (gobject/add "default" js/undefined))
  template-tags)

(deftest ^:parallel template-tags-test
  (testing "Snippets in template tags round trip correctly (#33546)"
    (let [db meta/database
          snippet-name "snippet: my snippet"
          snippets {snippet-name
                    {:type :snippet
                     :name "snippet: my snippet"
                     :id "fd5e96f7-08f8-486b-9919-b2ab72857db4"
                     :display-name "Snippet: My Snippet"
                     :snippet-name "my snippet"
                     :snippet-id 1}}
          query (lib.js/with-template-tags
                  (lib.js/native-query (:id db) meta/metadata-provider "select * from foo {{snippet: my snippet}}")
                  (add-undefined-params (clj->js snippets) snippet-name))]
      (is (= snippets
             (get-in query [:stages 0 :template-tags])))
      (is (test.js/= (clj->js snippets)
                     (lib.js/template-tags query))))))

(deftest ^:parallel extract-template-tags-test
  (testing "Undefined parameters are ignored (#34729)"
    (let [tag-name "foo"
          tags {tag-name {:type         :text
                          :name         tag-name
                          :display-name "Foo"
                          :id           (str (random-uuid))}}]
      (is (= {"bar" {"type"         "text"
                     "name"         "bar"
                     "display-name" "Bar"
                     "id"           (get-in tags [tag-name :id])}}
             (-> (lib.js/extract-template-tags "SELECT * FROM table WHERE {{bar}}"
                                               (add-undefined-params (clj->js tags) tag-name))
                 js->clj))))))

(deftest ^:parallel is-column-metadata-test
  (is (true? (lib.js/is-column-metadata (meta/field-metadata :venues :id))))
  (is (false? (lib.js/is-column-metadata 1))))
