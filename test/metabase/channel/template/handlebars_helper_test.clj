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
(deftest eq-test
  (let [hot-dog-not-hot-dog #(handlebars/render-string "{{#if (eq product.name \"Hot Dog\")}}Hot Dog{{else}}Not Hot Dog{{/if}}" {:product %})]
    (is (= "Hot Dog" (hot-dog-not-hot-dog {:name "Hot Dog"})))
    (is (= "Not Hot Dog" (hot-dog-not-hot-dog {:name "Pho"})))))

(deftest format-date-test
  (let [format-date #(handlebars/render-string "{{format-date date 'dd-MM-YY'}}" {:date %})]
    (testing "argument can be a string"
      (is (= "30-01-00" (format-date "2000-01-30"))))
    (testing "argument can be a datetime object"
      (is (= "30-01-00" (format-date (t/instant "2000-01-30T00:00:00Z")))))))

(deftest string-helpers-test
  (are [expected template context]
       (= expected (handlebars/render-string template context))
    ;; empty
    "true" "{{#if (empty items)}}true{{else}}false{{/if}}" {:items ""}
    "false" "{{#if (empty items)}}true{{else}}false{{/if}}" {:items "some"}
    ;; contains
    "true" "{{#if (contains text \"foo\")}}true{{else}}false{{/if}}" {:text "foo bar"}
    "false" "{{#if (contains text \"foo\")}}true{{else}}false{{/if}}" {:text "bar baz"}
    ;; starts with
    "true" "{{#if (starts-with text \"foo\")}}true{{else}}false{{/if}}" {:text "foo bar"}
    "false" "{{#if (starts-with text \"foo\")}}true{{else}}false{{/if}}" {:text "bar baz"}
    ;; ends with
    "true" "{{#if (ends-with text \"bar\")}}true{{else}}false{{/if}}" {:text "foo bar"}
    "false" "{{#if (ends-with text \"bar\")}}true{{else}}false{{/if}}" {:text "bar baz"}
    ;; split
    "item: x item: y " "{{#each (split text \".\")}}item: {{this}} {{/each}}" {:text "x.y"}))

(deftest collection-helpers-test
  (are [expected template context]
       (= expected (handlebars/render-string template context))
    ;; empty
    "true" "{{#if (empty items)}}true{{else}}false{{/if}}" {:items []}
    "false" "{{#if (empty items)}}true{{else}}false{{/if}}" {:items [1 2 3]}
    "true" "{{#if (empty items)}}true{{else}}false{{/if}}" {:items nil}
    "true" "{{#if (empty items)}}true{{else}}false{{/if}}" {:items '()}

    ;; count
    "3" "{{count items}}" {:items [1 2 3]}
    "0" "{{count items}}" {:items []}
    "0" "{{count items}}" {:items nil}
    "0" "{{count items}}" {:items '()}))

(deftest boolean-helpers-test
  (are [expected template context]
       (= expected (handlebars/render-string template context))
    ;; eq
    "true" "{{#if (eq product.name \"Hot Dog\")}}true{{else}}false{{/if}}" {:product {:name "Hot Dog"}}
    "false" "{{#if (eq product.name \"Hot Dog\")}}true{{else}}false{{/if}}" {:product {:name "Pho"}}

    ;; ne
    "false" "{{#if (ne product.name \"Hot Dog\")}}true{{else}}false{{/if}}" {:product {:name "Hot Dog"}}
    "true" "{{#if (ne product.name \"Hot Dog\")}}true{{else}}false{{/if}}" {:product {:name "Pho"}}

    ;; gt
    "false" "{{#if (gt product.price 10)}}true{{else}}false{{/if}}" {:product {:price 5}}
    "true" "{{#if (gt product.price 10)}}true{{else}}false{{/if}}" {:product {:price 15}}

    ;; gte
    "false" "{{#if (gte product.price 10)}}true{{else}}false{{/if}}" {:product {:price 5}}
    "true" "{{#if (gte product.price 10)}}true{{else}}false{{/if}}" {:product {:price 15}}

    ;; lt
    "true" "{{#if (lt product.price 10)}}true{{else}}false{{/if}}" {:product {:price 5}}
    "false" "{{#if (lt product.price 10)}}true{{else}}false{{/if}}" {:product {:price 15}}

    ;; lte
    "true" "{{#if (lte product.price 10)}}true{{else}}false{{/if}}" {:product {:price 5}}
    "false" "{{#if (lte product.price 10)}}true{{else}}false{{/if}}" {:product {:price 15}}

    ;; regexp
    "true" "{{#if (regexp text \"^foo.*\")}}true{{else}}false{{/if}}" {:text "foo bar"}
    "false" "{{#if (regexp text \"^foo.*\")}}true{{else}}false{{/if}}" {:text "bar baz"}))

(deftest now-test
  (mt/with-clock #t "2019-12-10T00:00-08:00[US/Pacific]"
    (is (= "2019-12-10T08:00:00Z" (handlebars/render-string "{{now}}" {})))))
