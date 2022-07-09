(ns metabase.shared.util.parameters-test
  #?@
   (:clj
    [(:require [clojure.test :as t]
               [metabase.shared.util.parameters :as params])]
    :cljs
    [(:require [clojure.test :as t]
               [metabase.shared.util.parameters :as params])]))

(t/deftest parse-tag-names-test
  (t/testing "Tag names are correctly parsed from text card contents"
    (t/are [text tags] (= tags (@#'params/tag-names-impl text))
      ;; Valid tags
      "{{foo}}"           #{"foo"}
      "{{ foo }}"         #{"foo"}
      "{{ Foo.123_ }}"    #{"Foo.123_"}
      "{{ 123 }}"         #{"123"}
      "{{{{foo}}}"        #{"foo"}
      "{{foo}} {{bar}}"   #{"foo" "bar"}
      "{{foo}} {{foo}}"   #{"foo"}
      "{{foo}} {{Foo}}"   #{"foo" "Foo"}
      "{{foo}} {{ foo }}" #{"foo"}
      "{{foo}} bar"       #{"foo"}
      "{{foo {{bar}}"     #{"bar"}
      "{{foo {{bar}}}}"   #{"bar"}
      ;; Invalid or no tags
      ""                  #{}
      "foo"               #{}
      "{}"                #{}
      "{{}}"              #{}
      "{{ }}"             #{}
      "{{foo"             #{}
      "foo}}"             #{}
      "{foo}"             #{}
      "{{foo}"            #{}
      "{{*foo*}}"         #{}
      "{{&()'}}"          #{})))

(t/deftest substitute-tags-test
  (t/testing "Tags are correctly substituted into card text, and formatted appropriately based on their type"
    (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param))
      "{{foo}}"
      {"foo" {:type :string/= :value ["bar"]}}
      "bar"

      "{{foo}}"
      {"foo" {:type :string/= :value ["bar", "baz"]}}
      "bar and baz"

      "{{foo}}"
      {"foo" {:type :date/relative :value "today"}}
      "Today"

      "{{foo}}"
      {"foo" {:type :date/relative :value "thismonth"}}
      "This Month"))

  (t/testing "Markdown characters are escaped in formatted values"
    (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param))
      "{{foo}}"
      {"foo" {:type :string/= :value ["*bar*"]}}
      "\\*bar\\*"

      ;; Characters in the original text are not escaped
      "_*{{foo}}*_"
      {"foo" {:type :string/= :value ["*bar*"]}}
      "_*\\*bar\\**_"))

  #?(:cljs
     (t/testing "Date/time values are formatted correctly when called in CLJS (TODO: update this test when Clojure
                implementation is added)"
       (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param))
         "{{foo}}"
         {"foo" {:type :date/month-year :value "2022-06"}}
         "June\\, 2022"))))
