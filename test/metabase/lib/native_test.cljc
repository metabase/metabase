(ns metabase.lib.native-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.native :as lib.native]
   [metabase.util.humanization :as u.humanization]))

(deftest variable-tag-test
  (are [exp input] (= exp (lib.native/recognize-template-tags input))
    #{"foo"} "SELECT * FROM table WHERE {{foo}} AND some_field IS NOT NULL"
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar}}"
    ;; Duplicates are flattened.
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar  }} OR {{  foo}}"
    ;; Ignoring non-alphanumeric vars
    #{} "SELECT * FROM table WHERE {{&foo}}"))

(deftest snippet-tag-test
  (are [exp input] (= exp (lib.native/recognize-template-tags input))
    #{"snippet:   foo  "} "SELECT * FROM table WHERE {{snippet:   foo  }} AND some_field IS NOT NULL"
    #{"snippet:   foo  *#&@"} "SELECT * FROM table WHERE {{snippet:   foo  *#&@}}"
    ;; TODO: This logic should trim the whitespace and unify these two snippet names.
    ;; I think this is a bug in the original code but am aiming to reproduce it exactly for now.
    #{"snippet: foo" "snippet:foo"} "SELECT * FROM table WHERE {{snippet: foo}} AND {{snippet:foo}}"))

(deftest card-tag-test
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
   (deftest template-tags-test
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
                   {"foo"                   v1
                    "#123-card-1"           c1
                    "snippet:first snippet" s1})))))))
