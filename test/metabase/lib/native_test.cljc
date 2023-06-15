(ns metabase.lib.native-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.native :as lib.native]
   #?@(:clj  ([medley.core :as m]
              [metabase.util.humanization :as u.humanization])
       :cljs ([metabase.test.util.js :as test.js]))))

(deftest ^:parallel variable-tag-test
  (are [exp input] (= exp (lib.native/recognize-template-tags input))
    #{"foo"} "SELECT * FROM table WHERE {{foo}} AND some_field IS NOT NULL"
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar}}"
    ;; Duplicates are flattened.
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar  }} OR {{  foo}}"
    ;; Ignoring non-alphanumeric vars
    #{} "SELECT * FROM table WHERE {{&foo}}"))

(deftest ^:parallel snippet-tag-test
  (are [exp input] (= exp (lib.native/recognize-template-tags input))
    #{"snippet:   foo  "} "SELECT * FROM table WHERE {{snippet:   foo  }} AND some_field IS NOT NULL"
    #{"snippet:   foo  *#&@"} "SELECT * FROM table WHERE {{snippet:   foo  *#&@}}"
    ;; TODO: This logic should trim the whitespace and unify these two snippet names.
    ;; I think this is a bug in the original code but am aiming to reproduce it exactly for now.
    #{"snippet: foo" "snippet:foo"} "SELECT * FROM table WHERE {{snippet: foo}} AND {{snippet:foo}}"))

(deftest ^:parallel card-tag-test
  (are [exp input] (= exp (lib.native/recognize-template-tags input))
    #{"#123"} "SELECT * FROM table WHERE {{ #123 }} AND some_field IS NOT NULL"
    ;; TODO: This logic should trim the whitespace and unify these two card tags.
    ;; I think this is a bug in the original code but am aiming to reproduce it exactly for now.
    #{"#123" "#123-with-slug"} "SELECT * FROM table WHERE {{ #123 }} AND {{  #123-with-slug  }}"
    #{"#123"} "SELECT * FROM table WHERE {{ #not-this }} AND {{#123}}"
    #{} "{{ #123foo }}"))

#?(:clj
   ;; TODO: This is only CLJ-only because =? from Hawk is not available in CLJS currently.
   ;; I don't think there's any reason why it can't work there too.
   (deftest ^:parallel template-tags-test
     (testing "snippet tags"
       (is (=? {"snippet:foo" {:type         :snippet
                               :name         "snippet:foo"
                               :snippet-name "foo"
                               :id           uuid?}}
               (lib.native/template-tags "SELECT * FROM table WHERE {{snippet:foo}}")))
       (is (=? {"snippet:foo"  {:type         :snippet
                                :name         "snippet:foo"
                                :snippet-name "foo"
                                :id           uuid?}
                "snippet: foo" {:type         :snippet
                                :name         "snippet: foo"
                                :snippet-name "foo"
                                :id           uuid?}}
                 ;; TODO: This should probably be considered a bug - whitespace matters for the name.
               (lib.native/template-tags "SELECT * FROM {{snippet: foo}} WHERE {{snippet:foo}}"))))

     (testing "renaming a variable"
       (let [old-tag {:type         :text
                      :name         "foo"
                      :display-name "Foo"
                      :id           (m/random-uuid)}]
         (testing "changes display-name if the original is not customized"
           (is (=? {"bar" {:type         :text
                           :name         "bar"
                           :display-name "Bar"
                           :id           (:id old-tag)}}
                   (lib.native/template-tags "SELECT * FROM {{bar}}"
                                             {"foo" old-tag}))))
         (testing "keeps display-name if it's customized"
           (is (=? {"bar" {:type         :text
                           :name         "bar"
                           :display-name "Custom Name"
                           :id           (:id old-tag)}}
                   (lib.native/template-tags "SELECT * FROM {{bar}}"
                                             {"foo" (assoc old-tag :display-name "Custom Name")}))))

         (testing "works with other variables present, if they don't change"
           (let [other {:type         :text
                        :name         "other"
                        :display-name "Some Var"
                        :id           (m/random-uuid)}]
             (is (=? {"other" other
                      "bar"   {:type         :text
                               :name         "bar"
                               :display-name "Bar"
                               :id           (:id old-tag)}}
                     (lib.native/template-tags "SELECT * FROM {{bar}} AND field = {{other}}"
                                               {"foo"   old-tag
                                                "other" other})))))))

     (testing "general case, add and remove"
       (let [mktag (fn [base]
                     (merge {:type    :text
                             :display-name (u.humanization/name->human-readable-name :simple (:name base))
                             :id           uuid?}
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
                 (lib.native/template-tags
                  "SELECT * FROM {{#123-card-1}} WHERE {{foo}} AND {{  snippet:first snippet}}")))
         (is (=? {"bar"                     v2
                  "baz"                     v3
                  "snippet:another snippet" s2
                  "#321"                    c2}
                 (lib.native/template-tags
                  "SELECT * FROM {{#321}} WHERE {{baz}} AND {{bar}} AND {{snippet:another snippet}}"
                  {"foo"                   (assoc v1 :id (random-uuid))
                   "#123-card-1"           (assoc c1 :id (random-uuid))
                   "snippet:first snippet" (assoc s1 :id (random-uuid))})))))))

#?(:cljs
   (deftest converters-test
     (let [clj-tags {"a"         {:id           "c5ad010c-632a-4498-b667-9188fbe965f9"
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
