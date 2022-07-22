(ns metabase.shared.parameters.parameters-test
  (:require [clojure.test :as t]
            [metabase.shared.parameters.parameters :as params]))

(defn- tag-names
  [text]
  (let [result (params/tag_names text)]
    #?(:clj result
       :cljs (set (js->clj result)))))

(t/deftest parse-tag-names-test
  (t/testing "Tag names are correctly parsed from text card contents"
    (t/are [text tags] (= tags (tag-names text))
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
      {"foo" {:type :string/= :value "bar"}}
      "bar"

      "{{foo}}"
      {"foo" {:type :string/= :value ["bar"]}}
      "bar"

      "{{foo}}"
      {"foo" {:type :string/= :value ["bar", "baz"]}}
      "bar and baz"

      "{{foo}} and {{bar}}"
      {"foo" {:type :string/= :value "A"}
       "bar" {:type :string/= :value "B"}}
      "A and B"

      "{{foo}} and {{foo}}"
      {"foo" {:type :string/= :value "A"}
       "bar" {:type :string/= :value "B"}}
      "A and A"

      ;; All string types are substituted as simple values, regardless of operator
      "{{foo}}"
      {"foo" {:type :string/does-not-contain :value ["bar"]}}
      "bar"

      "{{foo}}"
      {"foo" {:type :number/= :value 1}}
      "1"

      "{{foo}}"
      {"foo" {:type :number/= :value [1]}}
      "1"

      "{{foo}}"
      {"foo" {:type :number/= :value [1 2 3]}}
      "1\\, 2 and 3"

      "{{foo}}"
      {"foo" {:type :number/between :value [1 5]}}
      "1 and 5"

      "{{foo}}"
      {"foo" {:type :id :value "1"}}
      "1"

      "{{foo}}"
      {"foo" {:type :date/relative :value "today"}}
      "Today"

      "{{foo}}"
      {"foo" {:type :date/relative :value "past7days"}}
      "Previous 7 Days"

      "{{foo}}"
      {"foo" {:type :date/relative :value "thismonth"}}
      "This Month"))

  (t/testing "Special characters (with semantic meaning in Markdown) are escaped in formatted values"
    (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param))
      "{{foo}}"
      {"foo" {:type :string/= :value "*bar*"}}
      "\\*bar\\*"

      "{{foo}}"
      {"foo" {:type :string/= :value "<script>alert(1)</script>"}}
      "\\<script\\>alert\\(1\\)\\<\\/script\\>"

      ;; Characters in the original text are not escaped
      "_*{{foo}}*_"
      {"foo" {:type :string/= :value "*bar*"}}
      "_*\\*bar\\**_"))

  (t/testing "No substitution is done when no parameter is provided, or the parameter is invalid"
    (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param))
      ;; Nil input
      nil
      {}
      nil

      ;; No parameters
      "{{foo}}"
      {}
      "{{foo}}"

      ;; No parameter with matching name
      "{{foo}}"
      {"bar" {:type :string/= :value nil}}
      "{{foo}}"

      ;; Parameter with nil value
      "{{foo}}"
      {"foo" {:type :string/= :value nil}}
      "{{foo}}"

      ;; Parameter with no value
      "{{foo}}"
      {"foo" {:type :string/=}}
      "{{foo}}"

      ;; Parameter with no type: stringify the value with no additional formatting
      "{{foo}}"
      {"foo" {:value "today"}}
      "today"))

 (t/testing "Date values are formatted correctly"
   (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param))
     "{{foo}}"
     {"foo" {:type :date/single :value "2022-07-09"}}
     "July 9\\, 2022"

     "{{foo}}"
     {"foo" {:type :date/range :value "2022-07-06~2022-07-09"}}
     "July 6\\, 2022 \\- July 9\\, 2022"

     "{{foo}}"
     {"foo" {:type :date/month-year :value "2022-07"}}
     "July\\, 2022"

     "{{foo}}"
     {"foo" {:type :date/quarter-year :value "Q2-2022"}}
     "Q2\\, 2022"

     "{{foo}}"
     {"foo" {:type :date/all-options :value "~2022-07-09"}}
     "July 9\\, 2022"

     "{{foo}}"
     {"foo" {:type :date/all-options :value "2022-07-06~2022-07-09"}}
     "July 6\\, 2022 \\- July 9\\, 2022")

   (t/testing "Date values are formatted using the locale passed in as an argument"
     (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param "es"))
       "{{foo}}"
       {"foo" {:type :date/single :value "2022-07-09"}}
       "julio 9\\, 2022"

       "{{foo}}"
       {"foo" {:type :date/range :value "2022-01-06~2022-04-09"}}
       "enero 6\\, 2022 \\- abril 9\\, 2022"

       "{{foo}}"
       {"foo" {:type :date/month-year :value "2019-08"}}
       "agosto\\, 2019"))))

(t/deftest substitute-tags-optional-blocks-test
  (t/testing "Optional blocks are removed when necessary"
    (t/are [text tag->param expected] (= expected (params/substitute_tags text tag->param))
      "[[{{foo}}]]"
      {}
      ""

      "[[{{foo}}]]"
      {"foo" {:type :string/= :value "bar"}}
      "bar"

      "Customers[[ with over {{order_count}} orders]]"
      {"order_count" {:type :number/= :value nil}}
      "Customers"

      "Customers[[ with over {{order_count}} orders]]"
      {"order_count" {:type :number/= :value 10}}
      "Customers with over 10 orders"

      ;; Optional block is retained when *any* parameters within are substituted
      "[[{{foo}} {{baz}}]]"
      {"foo" {:type :string/= :value "bar"}}
      "bar {{baz}}"

      ;; Make sure `join-consecutive-strings` retains consecutive non-strings (this was a bug during implementation)
      "[[{{foo}}{{foo}}]]"
      {"foo" {:type :string/= :value "foo"}}
      "foofoo"

      "[[{{foo}}]] [[{{bar}}]]"
      {"foo" {:type :string/= :value 1} "bar" {:type :string/= :value 2}}
      "1 2"

      "[[{{foo}}]"
      {"foo" {:type :string/= :value "bar"}}
      "[[bar]"

      "[{{foo}}]]"
      {"foo" {:type :string/= :value "bar"}}
      "[bar]]"

      ;; Don't strip square brackets that are in parameter values
      "{{foo}}"
      {"foo" {:type :string/= :value "[[bar]]"}}
      "\\[\\[bar\\]\\]")))
