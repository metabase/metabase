(ns metabase.channel.template.handlebars-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.util :as u])
  (:import
   (com.github.jknack.handlebars Helper)))

(set! *warn-on-reflection* true)

(def custom-hbs
  (doto (handlebars/registry (handlebars/default-loader))
    (.registerHelper "uppercase" (reify Helper
                                   (apply [_this arg _options]
                                     (u/upper-case-en arg))))))

(deftest render-string-test
  (testing "Render a template string with a context."
    (are [expected template context]
         (= expected (handlebars/render-string template context))

      "Hello Ngoc" "Hello {{name}}"                                 {:name "Ngoc"}
      "Hello Ngoc" "Hello {{name}}"                                 {"name" "Ngoc"}
      "Hello Ngoc" "Hello {{who.name}}"                             {:who {:name "Ngoc"}}
      "Hello "     "Hello {{#unless hide_name}}{{name}}{{/unless}}" {:name "Ngoc" :hide_name true}
      "" "" {})
    (testing "with custom registry"
      (is (= "NGOC" (handlebars/render-string custom-hbs "{{uppercase name}}" {:name "Ngoc"}))))))

(deftest render-resource-by-relative-name-test
  (testing "renders a template by its relative name (without the .hbs suffix)"
    (is (= "Hello Ngoc!" (str/trim (handlebars/render "test_greeting" {:name "Ngoc"})))))
  (testing "renders a template regardless of which template directory holds it"
    (let [out (handlebars/render "hello_world" {:payload {:event_info {:object {:first_name "Ngoc"}}}
                                                :context {:site_name "Metabase"}})]
      (is (str/includes? out "Hello Ngoc"))
      (is (str/includes? out "Welcome to Metabase")))))

(deftest partials-resolve-test
  (testing "renders a template that includes a partial by relative name"
    (let [out (handlebars/render "test_with_partial" {:name "X"})]
      (is (str/includes? out "before"))
      (is (str/includes? out "[partial:X]"))
      (is (str/includes? out "after")))))

(deftest valid-template-name-test
  (testing "accepts relative template names"
    (is (true? (handlebars/valid-template-name? "password_reset")))
    (is (true? (handlebars/valid-template-name? "notification_card")))
    (is (true? (handlebars/valid-template-name? "hello_world"))))
  (testing "rejects malformed names"
    (is (false? (handlebars/valid-template-name? "")))
    (is (false? (handlebars/valid-template-name? "   ")))
    (is (false? (handlebars/valid-template-name? "/foo_bar")))
    (is (false? (handlebars/valid-template-name? "../foo_bar")))
    (is (false? (handlebars/valid-template-name? "foo/../bar")))
    (testing "rejects a name that includes the .hbs suffix"
      (is (false? (handlebars/valid-template-name? "foo_bar.hbs"))))))

(defn- template-basenames
  "Set of `.hbs` basenames (suffix stripped) in the classpath dir at `prefix`,
  unioned across every classpath entry containing that dir."
  [prefix]
  (let [path   (str/replace prefix #"^/|/$" "")
        loader (.getContextClassLoader (Thread/currentThread))]
    (->> (enumeration-seq (.getResources loader path))
         (filter #(= "file" (.getProtocol ^java.net.URL %)))
         (mapcat #(.listFiles (io/file %)))
         (filter #(str/ends-with? (.getName ^java.io.File %) ".hbs"))
         (map #(str/replace (.getName ^java.io.File %) #"\.hbs$" ""))
         set)))

(deftest template-names-do-not-collide-test
  (testing "no template name appears in more than one template directory"
    (let [prefix->names (into {} (for [prefix @#'handlebars/template-dirs]
                                   [prefix (template-basenames prefix)]))]
      (doseq [[prefix names] prefix->names]
        (testing prefix
          (is (seq names) "each template directory contains templates")))
      (let [shared (->> (mapcat seq (vals prefix->names))
                        frequencies
                        (keep (fn [[basename n]] (when (< 1 n) basename)))
                        set)]
        (is (empty? shared)
            (str "template name appears in multiple directories: " shared))))))

(deftest dotted-path-resolution-works-on-maps-test
  (are [template context]
       (= "" (handlebars/render-string template context))
    "{{x.y}}"       {"x" "a string"}
    "{{x.y}}"       {"x" 42}
    "{{x.toString}}" {"x" 42}
    "{{x.y.z}}"     {"x" {"y" (Object.)}})
  (is (= "hello" (handlebars/render-string "{{x.y}}" {"x" {"y" "hello"}})))
  (is (= "deep" (handlebars/render-string "{{a.b.c}}" {"a" {"b" {"c" "deep"}}}))))
