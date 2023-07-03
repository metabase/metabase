(ns metabase.lib.native-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]
              [metabase.test.util.js :as test.js]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.native :as lib.native]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.humanization :as u.humanization]))

(deftest ^:parallel variable-tag-test
  (are [exp input] (= exp (set (keys (lib.native/extract-template-tags input))))
    #{"foo"} "SELECT * FROM table WHERE {{foo}} AND some_field IS NOT NULL"
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar}}"
    ;; Duplicates are flattened.
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar  }} OR {{  foo}}"
    ;; Ignoring non-alphanumeric vars
    #{} "SELECT * FROM table WHERE {{&foo}}"))

(deftest ^:parallel snippet-tag-test
  (are [exp input] (= exp (set (keys (lib.native/extract-template-tags input))))
    #{"snippet:   foo  "} "SELECT * FROM table WHERE {{snippet:   foo  }} AND some_field IS NOT NULL"
    #{"snippet:   foo  *#&@"} "SELECT * FROM table WHERE {{snippet:   foo  *#&@}}"
    ;; TODO: This logic should trim the whitespace and unify these two snippet names.
    ;; I think this is a bug in the original code but am aiming to reproduce it exactly for now.
    #{"snippet: foo" "snippet:foo"} "SELECT * FROM table WHERE {{snippet: foo}} AND {{snippet:foo}}"))

(deftest ^:parallel card-tag-test
  (are [exp input] (= exp (set (keys (lib.native/extract-template-tags input))))
    #{"#123"} "SELECT * FROM table WHERE {{ #123 }} AND some_field IS NOT NULL"
    ;; TODO: This logic should trim the whitespace and unify these two card tags.
    ;; I think this is a bug in the original code but am aiming to reproduce it exactly for now.
    #{"#123" "#123-with-slug"} "SELECT * FROM table WHERE {{ #123 }} AND {{  #123-with-slug  }}"
    #{"#123"} "SELECT * FROM table WHERE {{ #not-this }} AND {{#123}}"
    #{} "{{ #123foo }}"))

(deftest ^:parallel template-tags-test
  (testing "snippet tags"
    (is (=? {"snippet:foo" {:type         :snippet
                            :name         "snippet:foo"
                            :snippet-name "foo"
                            :id           string?}}
            (lib.native/extract-template-tags "SELECT * FROM table WHERE {{snippet:foo}}")))
    (is (=? {"snippet:foo"  {:type         :snippet
                             :name         "snippet:foo"
                             :snippet-name "foo"
                             :id           string?}
             "snippet: foo" {:type         :snippet
                             :name         "snippet: foo"
                             :snippet-name "foo"
                             :id           string?}}
            ;; TODO: This should probably be considered a bug - whitespace matters for the name.
            (lib.native/extract-template-tags "SELECT * FROM {{snippet: foo}} WHERE {{snippet:foo}}"))))

  (testing "renaming a variable"
    (let [old-tag {:type         :text
                   :name         "foo"
                   :display-name "Foo"
                   :id           (str (m/random-uuid))}]
      (testing "changes display-name if the original is not customized"
        (is (=? {"bar" {:type         :text
                        :name         "bar"
                        :display-name "Bar"
                        :id           (:id old-tag)}}
                (lib.native/extract-template-tags "SELECT * FROM {{bar}}"
                                                  {"foo" old-tag}))))
      (testing "keeps display-name if it's customized"
        (is (=? {"bar" {:type         :text
                        :name         "bar"
                        :display-name "Custom Name"
                        :id           (:id old-tag)}}
                (lib.native/extract-template-tags "SELECT * FROM {{bar}}"
                                                  {"foo" (assoc old-tag :display-name "Custom Name")}))))

      (testing "works with other variables present, if they don't change"
        (let [other {:type         :text
                     :name         "other"
                     :display-name "Some Var"
                     :id           (str (m/random-uuid))}]
          (is (=? {"other" other
                   "bar"   {:type         :text
                            :name         "bar"
                            :display-name "Bar"
                            :id           (:id old-tag)}}
                  (lib.native/extract-template-tags "SELECT * FROM {{bar}} AND field = {{other}}"
                                                    {"foo"   old-tag
                                                     "other" other})))))))

  (testing "general case, add and remove"
    (let [mktag (fn [base]
                  (merge {:type    :text
                          :display-name (u.humanization/name->human-readable-name :simple (:name base))
                          :id           string?}
                         base))
          v1    (mktag {:name "foo"})
          v2    (mktag {:name "bar"})
          v3    (mktag {:name "baz"})
          s1    (mktag {:name         "snippet:first snippet"
                        :snippet-name "first snippet"
                        :type         :snippet})
          s2    (mktag {:name         "snippet:another snippet"
                        :snippet-name "another snippet"
                        :type         :snippet})

          c1    (mktag {:name    "#123-card-1"
                        :type    :card
                        :card-id 123})
          c2    (mktag {:name    "#321"
                        :type    :card
                        :card-id 321})]
      (is (=? {"foo"                   v1
               "#123-card-1"           c1
               "snippet:first snippet" s1}
              (lib.native/extract-template-tags
                "SELECT * FROM {{#123-card-1}} WHERE {{foo}} AND {{  snippet:first snippet}}")))
      (is (=? {"bar"                     v2
               "baz"                     v3
               "snippet:another snippet" s2
               "#321"                    c2}
              (lib.native/extract-template-tags
                "SELECT * FROM {{#321}} WHERE {{baz}} AND {{bar}} AND {{snippet:another snippet}}"
                {"foo"                   (assoc v1 :id (str (random-uuid)))
                 "#123-card-1"           (assoc c1 :id (str (random-uuid)))
                 "snippet:first snippet" (assoc s1 :id (str (random-uuid)))}))))))

#?(:cljs
   (deftest ^:parallel converters-test
            (let [clj-tags {"a"  {:id           "c5ad010c-632a-4498-b667-9188fbe965f9"
                                  :name         "a"
                                  :display-name "A"
                                  :type         :text}
                     "#123-foo"  {:id           "7e58e086-5d63-4986-8fe7-87e05dfa4089"
                                  :name         "#123-foo"
                                  :display-name "#123-foo"
                                  :type         :card
                                  :card-id      123}
                     "snippet:b" {:id           "604131d0-a74c-4822-b113-8e9515b1a985"
                                  :name         "snippet:b"
                                  :display-name "Snippet B"
                                  :type         :snippet
                                  :snippet-name "b"}}
           js-tags  #js {"a"         #js {"id"           "c5ad010c-632a-4498-b667-9188fbe965f9"
                                          "name"         "a"
                                          "display-name" "A"
                                          "type"         "text"}
                         "#123-foo"  #js {"id"           "7e58e086-5d63-4986-8fe7-87e05dfa4089"
                                          "name"         "#123-foo"
                                          "display-name" "#123-foo"
                                          "type"         "card"
                                          "card-id"      123}
                         "snippet:b" #js {"id"           "604131d0-a74c-4822-b113-8e9515b1a985"
                                          "name"         "snippet:b"
                                          "display-name" "Snippet B"
                                          "type"         "snippet"
                                          "snippet-name" "b"}}]
       (testing "incoming converter works"
         (is (= clj-tags (#'lib.native/->TemplateTags js-tags))))
       (testing "outgoing converter works"
         (is (test.js/= js-tags (#'lib.native/TemplateTags-> clj-tags))))
       (testing "round trips work"
         (is (=         clj-tags (-> clj-tags (#'lib.native/TemplateTags->) (#'lib.native/->TemplateTags))))
         (is (test.js/= js-tags  (-> js-tags  (#'lib.native/->TemplateTags) (#'lib.native/TemplateTags->))))))))

(deftest ^:parallel native-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid string?}
                       :native      "SELECT * FROM VENUES;"}]}
          (lib/native-query meta/metadata-provider meta/qp-results-metadata "SELECT * FROM VENUES;"))))

(deftest ^:parallel native-query-suggested-name-test
  (let [query (lib/native-query meta/metadata-provider meta/qp-results-metadata "SELECT * FROM VENUES;")]
    (is (= "Native query"
           (lib.metadata.calculation/describe-query query)))
    (is (nil? (lib.metadata.calculation/suggested-name query)))))

(deftest ^:parallel native-query-building
  (let [query (lib/native-query meta/metadata-provider "select * from venues where id = {{myid}}")]
    (testing "Updating query keeps template tags in sync"
      (is (=? ["select * from venues where id = {{myid}}"
               {"myid" {:type :text,
                        :name "myid",
                        :id string?
                        :display-name "Myid"}}]
              ((juxt lib/raw-native-query lib/template-tags) query)))
      (is (=? ["select * from venues where id = {{myid}} and x = {{y}}"
               {"myid" {} "y" {}}]
              (-> query
                  (lib/with-native-query "select * from venues where id = {{myid}} and x = {{y}}")
                  ((juxt lib/raw-native-query lib/template-tags)))))
      (is (=? ["select * from venues where id = {{myrenamedid}}"
               {"myrenamedid" {}}]
              (-> query
                  (lib/with-native-query "select * from venues where id = {{myrenamedid}}")
                  ((juxt lib/raw-native-query lib/template-tags)))))
      (is (empty?
            (-> query
                (lib/with-native-query "select * from venues")
                lib/template-tags))))))

(deftest ^:parallel with-template-tags-test
  (let [query (lib/native-query meta/metadata-provider "select * from venues where id = {{myid}}")
        original-tags (lib/template-tags query)]
    (is (= (assoc-in original-tags ["myid" :display-name] "My ID")
           (-> query
               (lib/with-template-tags {"myid" (assoc (get original-tags "myid") :display-name "My ID")})
               lib/template-tags)))
    (testing "Changing query keeps updated template tags"
      (is (= (assoc-in original-tags ["myid" :display-name] "My ID")
             (-> query
                 (lib/with-template-tags {"myid" (assoc (get original-tags "myid") :display-name "My ID")})
                 (lib/with-native-query "select * from venues where category_id = {{myid}}")
                 lib/template-tags))))
    (testing "Doesn't introduce garbage"
      (is (= original-tags
             (-> query
                 (lib/with-template-tags {"garbage" (assoc (get original-tags "myid") :display-name "Foobar")})
                 lib/template-tags))))))
