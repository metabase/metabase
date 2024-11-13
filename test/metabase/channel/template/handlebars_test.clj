(ns metabase.channel.template.handlebars-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.util :as u])
  (:import
   (com.github.jknack.handlebars
    Parser Helper Template)
   (com.github.jknack.handlebars.io
    TemplateSource)))

(set! *warn-on-reflection* true)

(def custom-hbs
  (doto (handlebars/registry (handlebars/classpath-loader "/" ""))
    (.registerHelper "uppercase" (reify Helper
                                   (apply [_this arg _options]
                                     (u/upper-case-en arg))))))

(defn do-with-temp-template!
  [filename content thunk]
  ;; create the channel_template folder if not exists
  (let [filename  (format "channel_template/%s" filename)
        temp-file (format "test_resources/%s" filename)]
    (try
      (spit temp-file content)
      (thunk filename)
      (finally
        (io/delete-file temp-file)))))

(defmacro with-temp-template!
  [[filename-binding filename content] & body]
  `(do-with-temp-template! ~filename ~content (fn [~filename-binding] ~@body)))

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
    (with-temp-template! [tmpl-name "tmpl.hbs" "Hello {{name}}"]
      (is (= "Hello Ngoc" (handlebars/render tmpl-name {:name "Ngoc"}))))
    (with-temp-template! [tmpl-name "tmpl.handlebars" "Hello {{name}}"]
      (is (= "Hello Ngoc" (handlebars/render tmpl-name {:name "Ngoc"})))))

  (testing "with custom req"
    (with-temp-template! [tmpl-name "tmpl.hbs" "Hello {{uppercase name}}"]
      (is (= "Hello NGOC" (handlebars/render custom-hbs tmpl-name {:name "Ngoc"}))))))

(deftest reload-template-if-it's-changed
  (testing "reload template if it's changed"
    (with-temp-template! [tmpl-name (u.random/random-name) "Hello {{name}}"]
      (is (= "Hello Ngoc" (handlebars/render tmpl-name {:name "Ngoc"})))
      (spit (format "test_resources/%s" tmpl-name) "Hello {{name}} updated!")
      (is (= "Hello Ngoc updated!" (handlebars/render tmpl-name {:name "Ngoc"}))))))

(deftest atom-template-cache-test
  (let [parser-calls    (atom [])
        parser          (reify Parser
                          (parse [_ source]
                            (swap! parser-calls conj (.filename source))
                            Template/EMPTY))
        get-cache       (fn [cache source]
                          (.apply (.get cache source parser) {}))
        template-source (fn [filename lastmodified]
                          (reify TemplateSource
                            (filename [_] filename)
                            (lastModified [_] lastmodified)
                            (content [_ _] (slurp filename))
                            (equals [_ other] (= filename (.filename other)))))]
    (testing "should reuse the template if it's loaded"
      (let [cache (#'handlebars/make-atom-template-cache false)]
        (reset! parser-calls [])
        (get-cache cache (template-source "metabase" 0))
        (get-cache cache (template-source "metabase" 0))
        (testing "parser only called once for the same template"
          (is (= ["metabase"] @parser-calls)))
        (get-cache cache (template-source "metabase-2" 0))
        (is (= ["metabase" "metabase-2"] @parser-calls))))

    (testing "reload=false will not reload the template even though it's changed"
      (let [cache (#'handlebars/make-atom-template-cache false)]
        (reset! parser-calls [])
        (get-cache cache (template-source "metabase" 0))
        (get-cache cache (template-source "metabase" 1))
        (is (= ["metabase"] @parser-calls))
        (testing "reload=true will reload the template if it's changed"
          (.setReload cache true)
          (get-cache cache (template-source "metabase" 1))
          (is (= ["metabase" "metabase"] @parser-calls)))))))
