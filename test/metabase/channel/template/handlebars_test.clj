(ns metabase.channel.template.handlebars-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.util :as u]
   [metabase.util.random :as u.random])
  (:import
   (com.github.jknack.handlebars
    Helper)))

(set! *warn-on-reflection* true)

(def custom-hbs (doto (handlebars/registry (handlebars/classpath-loader "/" ".hbs"))
                  (.registerHelper "uppercase" (reify Helper
                                                 (apply [_this arg _options]
                                                   (u/upper-case-en arg))))))

(defn do-with-temp-template
  [content thunk]
  (let [filename  (u.random/random-name)
        temp-file (format "test_resources/%s.hbs" filename)]
    (try
      (spit temp-file content)
      (thunk filename)
      (finally
        (io/delete-file temp-file)))))

(defmacro with-temp-template
  [[filename-binding content] & body]
  `(do-with-temp-template ~content (fn [~filename-binding] ~@body)))


(deftest render-string-test
  (testing "Render a template string with a context."
    (are [expected template context]
         (= expected (handlebars/render-string template context))

         "Hello Ngoc" "Hello {{name}}"                                 {:name "Ngoc"}
         "Hello Ngoc" "Hello {{name}}"                                 {"name" "Ngoc"}
         "Hello Ngoc" "Hello {{who.name}}"                             {:who {:name "Ngoc"}}
         "Hello "     "Hello {{#unless hide_name}}{{name}}{{/unless}}" {:name "Ngoc" :hide_name true}
         "" "" {})

    (testing "with custom reqistry"
      (is (= "NGOC" (handlebars/render-string custom-hbs "{{uppercase name}}" {:name "Ngoc"}))))))

(deftest render-test
  (testing "Render a template with a context."
    (with-temp-template [tmpl-name "Hello {{name}}"]
      (is (= "Hello Ngoc" (handlebars/render tmpl-name {:name "Ngoc"})))))

  (testing "with custom req"
    (with-temp-template [tmpl-name "Hello {{uppercase name}}"]
      (is (= "Hello NGOC" (handlebars/render custom-hbs tmpl-name {:name "Ngoc"}))))))
