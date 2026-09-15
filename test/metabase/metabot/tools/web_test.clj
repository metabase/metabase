(ns metabase.metabot.tools.web-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.web :as tools.web]
   [metabase.test :as mt]
   [metabase.util.http :as u.http])
  (:import
   (org.jsoup Jsoup)))

(set! *warn-on-reflection* true)

(def ^:private serper-response
  {:organic [{:title   "Metabase 0.60 release notes"
              :link    "https://www.metabase.com/releases/0.60"
              :snippet "What's new in 0.60 & beyond"
              :date    "Aug 1, 2026"}
             {:title   "Metabase on GitHub"
              :link    "https://github.com/metabase/metabase"
              :snippet "The open source BI tool"}]
   :answerBox {:title "Metabase" :answer "Metabase is an open source BI tool."}})

(deftest web-search-tool-test
  (mt/with-dynamic-fn-redefs [tools.web/serper-search (constantly serper-response)]
    (let [{:keys [output structured-output data-parts]} (tools.web/web-search-tool {:query "metabase release"})]
      (testing "output is XML the LLM can read, with entities escaped"
        (is (str/includes? output "<web_search_results query=\"metabase release\" count=\"2\">"))
        (is (str/includes? output "url=\"https://www.metabase.com/releases/0.60\""))
        (is (str/includes? output "What's new in 0.60 &amp; beyond"))
        (is (str/includes? output "<answer_box title=\"Metabase\">")))
      (testing "structured output only carries persistable keys"
        (is (= {:result-type :web_search
                :total_count 2
                :results     [{:title "Metabase 0.60 release notes" :url "https://www.metabase.com/releases/0.60"}
                              {:title "Metabase on GitHub" :url "https://github.com/metabase/metabase"}]}
               structured-output)))
      (testing "the data part lists the sites for the chain-of-thought UI"
        (is (= [{:type      :data
                 :data-type "web_search_results"
                 :data      {:total_count 2
                             :results     [{:title   "Metabase 0.60 release notes"
                                            :url     "https://www.metabase.com/releases/0.60"
                                            :domain  "metabase.com"
                                            :snippet "What's new in 0.60 & beyond"}
                                           {:title   "Metabase on GitHub"
                                            :url     "https://github.com/metabase/metabase"
                                            :domain  "github.com"
                                            :snippet "The open source BI tool"}]}}]
               data-parts))))))

(deftest web-search-tool-provider-error-test
  (mt/with-dynamic-fn-redefs [tools.web/serper-search (fn [_] (throw (ex-info "the search provider returned HTTP 403" {})))]
    (is (= {:output "Web search failed: the search provider returned HTTP 403"}
           (tools.web/web-search-tool {:query "anything"})))))

(def ^:private sample-html
  "<html><head><title>Sample Page</title><meta property=\"og:title\" content=\"OG Sample\"></head>
   <body>
     <nav><a href=\"/\">Home</a> <a href=\"/about\">About</a></nav>
     <script>window.tracking = true;</script>
     <article>
       <h1>Quarterly results</h1>
       <p>Revenue grew   12% year over year, driven by   the enterprise segment.</p>
       <p>Churn fell to 3%.</p>
     </article>
     <footer>Copyright 2026</footer>
   </body></html>")

(deftest extract-page-text-test
  (let [{:keys [title content]} (tools.web/extract-page-text (Jsoup/parse ^String sample-html "https://example.com/report"))]
    (is (= "Sample Page" title))
    (testing "boilerplate is stripped and whitespace collapsed"
      (is (= "Quarterly results\nRevenue grew 12% year over year, driven by the enterprise segment.\nChurn fell to 3%."
             content))
      (is (not (str/includes? content "Home")))
      (is (not (str/includes? content "tracking")))
      (is (not (str/includes? content "Copyright"))))))

(deftest extract-page-text-truncates-test
  (let [long-html (str "<html><body><article><p>" (apply str (repeat 10000 "x")) "</p></article></body></html>")
        {:keys [content]} (tools.web/extract-page-text (Jsoup/parse ^String long-html "https://example.com"))]
    (is (str/ends-with? content "\n[truncated]"))
    (is (= (+ 8000 (count "\n[truncated]")) (count content)))))

(deftest read-web-page-tool-test
  (mt/with-dynamic-fn-redefs [u.http/fetch-bytes (fn [url _opts]
                                                   (when (= url "https://www.example.com/report")
                                                     {:bytes (.getBytes ^String sample-html "UTF-8") :content-type "text/html"}))]
    (let [{:keys [output data-parts]} (tools.web/read-web-page-tool
                                       {:urls ["https://www.example.com/report" "https://blocked.example.com/x"]})]
      (testing "readable pages carry their text, unreadable ones an error"
        (is (str/includes? output "<page url=\"https://www.example.com/report\" title=\"Sample Page\">"))
        (is (str/includes? output "Churn fell to 3%."))
        (is (str/includes? output "<page url=\"https://blocked.example.com/x\">\n    <error>")))
      (testing "only readable pages reach the chain-of-thought UI"
        (is (= [{:type      :data
                 :data-type "web_search_results"
                 :data      {:total_count 1
                             :results     [{:title  "Sample Page"
                                            :url    "https://www.example.com/report"
                                            :domain "example.com"}]}}]
               data-parts))))))
