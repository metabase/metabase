(ns metabase.channel.template.handlebars-helper-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.channel.template.handlebars-helper :as handlebars-helper]
   [metabase.test :as mt]
   [metabase.util :as u]))

(def custom-hbs
  (handlebars/registry (handlebars/classpath-loader "/" "")))

(handlebars-helper/defhelper
  format-name
  "Format a name with title and uppercase options."
  [name _params {:keys [title uppercase] :or {title "Mr."}} _options]
  (if uppercase
    (str title (u/upper-case-en name))
    (str title name)))

(deftest helper-with-keyword-params-test
  (let [hbs (handlebars/registry (handlebars/classpath-loader "/" ""))]
    (handlebars-helper/register-helper hbs "format-name" format-name)
    (is (= "Mr.Romeo" (handlebars/render-string hbs "{{format-name name}}" {:name "Romeo"})))
    (is (= "Ms.JULIET" (handlebars/render-string hbs "{{format-name name title=\"Ms.\" uppercase=true}}" {:name "Juliet"})))))

(handlebars-helper/defhelper
  ifequals
  "ifequals"
  [x [y] _kparams options]
  (if (= x y)
    (handlebars-helper/option-block-body options)
    (handlebars-helper/option-else-block options)))

(deftest block-body-test
  (let [hbs (handlebars/registry (handlebars/classpath-loader "/" ""))
        hot-dog-not-hot-dog #(handlebars/render-string hbs "{{#ifequals food \"Hot Dog\"}}It's a Hot Dog{{else}}Not Hot Dog{{/ifequals}}" {:food %})]
    (handlebars-helper/register-helper hbs "ifequals" ifequals)
    (is (= "It's a Hot Dog" (hot-dog-not-hot-dog "Hot Dog")))
    (is (= "Not Hot Dog" (hot-dog-not-hot-dog "Pho")))))

;; predefined helper tests
(deftest equals-test
  (let [hot-dog-not-hot-dog #(handlebars/render-string "{{#if (equals product.name \"Hot Dog\")}}Hot Dog{{else}}Not Hot Dog{{/if}}" {:product %})]
    (is (= "Hot Dog" (hot-dog-not-hot-dog {:name "Hot Dog"})))
    (is (= "Not Hot Dog" (hot-dog-not-hot-dog {:name "Pho"})))))

(deftest format-date-test
  (let [format-date #(handlebars/render-string "{{format-date date 'dd-MM-YY'}}" {:date %})]
    (testing "argument can be a string"
      (is (= "30-01-00" (format-date "2000-01-30"))))
    (testing "argument can be a datetime object"
      (is (= "30-01-00" (format-date (t/instant "2000-01-30T00:00:00Z")))))))

(deftest now-test
  (mt/with-clock #t "2019-12-10T00:00-08:00[US/Pacific]"
    (is (= "2019-12-10T08:00:00Z" (handlebars/render-string "{{now}}" {})))))
