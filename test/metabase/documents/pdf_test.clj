(ns metabase.documents.pdf-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.pdf :as pdf]))

(deftest text-node-test
  (is (= "hello"
         (pdf/ast-node->hiccup {:type "text" :text "hello"} {}))))

(deftest text-with-bold-mark-test
  (is (= [:strong "bold"]
         (pdf/ast-node->hiccup {:type "text" :text "bold" :marks [{:type "bold"}]} {}))))

(deftest text-with-multiple-marks-test
  (is (= [:em [:strong "both"]]
         (pdf/ast-node->hiccup {:type "text" :text "both" :marks [{:type "bold"} {:type "italic"}]} {}))))

(deftest text-with-link-mark-test
  (is (= [:a {:href "https://example.com"} "link"]
         (pdf/ast-node->hiccup {:type "text" :text "link"
                                :marks [{:type "link" :attrs {:href "https://example.com"}}]}
                               {}))))

(deftest text-with-code-mark-test
  (is (= [:code "inline"]
         (pdf/ast-node->hiccup {:type "text" :text "inline" :marks [{:type "code"}]} {}))))

(deftest text-with-underline-mark-test
  (is (= [:u "underlined"]
         (pdf/ast-node->hiccup {:type "text" :text "underlined" :marks [{:type "underline"}]} {}))))

(deftest text-with-strikethrough-mark-test
  (is (= [:s "struck"]
         (pdf/ast-node->hiccup {:type "text" :text "struck" :marks [{:type "strikethrough"}]} {}))))

(deftest paragraph-test
  (is (= [:p "hello"]
         (pdf/ast-node->hiccup {:type "paragraph"
                                :content [{:type "text" :text "hello"}]}
                               {}))))

(deftest empty-paragraph-test
  (is (= [:p]
         (pdf/ast-node->hiccup {:type "paragraph"} {}))))

(deftest heading-test
  (testing "heading levels"
    (doseq [level (range 1 7)]
      (is (= [(keyword (str "h" level)) "Title"]
             (pdf/ast-node->hiccup {:type "heading"
                                    :attrs {:level level}
                                    :content [{:type "text" :text "Title"}]}
                                   {}))))))

(deftest bullet-list-test
  (is (= [:ul [:li [:p "item"]]]
         (pdf/ast-node->hiccup {:type "bulletList"
                                :content [{:type "listItem"
                                           :content [{:type "paragraph"
                                                      :content [{:type "text" :text "item"}]}]}]}
                               {}))))

(deftest ordered-list-test
  (is (= [:ol [:li [:p "first"]]]
         (pdf/ast-node->hiccup {:type "orderedList"
                                :content [{:type "listItem"
                                           :content [{:type "paragraph"
                                                      :content [{:type "text" :text "first"}]}]}]}
                               {}))))

(deftest blockquote-test
  (is (= [:blockquote [:p "quoted"]]
         (pdf/ast-node->hiccup {:type "blockquote"
                                :content [{:type "paragraph"
                                           :content [{:type "text" :text "quoted"}]}]}
                               {}))))

(deftest code-block-test
  (is (= [:pre [:code [:<> "code here"]]]
         (pdf/ast-node->hiccup {:type "codeBlock"
                                :content [{:type "text" :text "code here"}]}
                               {}))))

(deftest horizontal-rule-test
  (is (= [:hr]
         (pdf/ast-node->hiccup {:type "horizontalRule"} {}))))

(deftest hard-break-test
  (is (= [:br]
         (pdf/ast-node->hiccup {:type "hardBreak"} {}))))

(deftest card-embed-with-png-test
  (testing "no :format key defaults to :png (backward compat)"
    (let [card-images {42 {:status :ok :data-uri "data:image/png;base64,abc" :card-name "My Chart"}}]
      (is (= [:div {:class "card-embed"}
              [:div {:class "card-title"} "My Chart"]
              [:img {:src "data:image/png;base64,abc" :class "card-image"}]]
             (pdf/ast-node->hiccup {:type "cardEmbed" :attrs {:id 42}} card-images)))))
  (testing "explicit :format :png"
    (let [card-images {42 {:status :ok :format :png :data-uri "data:image/png;base64,abc" :card-name "My Chart"}}]
      (is (= [:div {:class "card-embed"}
              [:div {:class "card-title"} "My Chart"]
              [:img {:src "data:image/png;base64,abc" :class "card-image"}]]
             (pdf/ast-node->hiccup {:type "cardEmbed" :attrs {:id 42}} card-images))))))

(deftest card-embed-with-svg-test
  (let [svg-content "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"10\" height=\"10\"/></svg>"
        card-images {42 {:status :ok :format :svg :content svg-content :card-name "SVG Chart"}}
        result      (pdf/ast-node->hiccup {:type "cardEmbed" :attrs {:id 42}} card-images)]
    (is (= :div (first result)))
    (is (= {:class "card-embed"} (second result)))
    (is (= [:div {:class "card-title"} "SVG Chart"] (nth result 2)))
    (let [content-div (nth result 3)]
      (is (= :div (first content-div)))
      (is (= {:class "card-content"} (second content-div)))
      (is (instance? metabase.documents.pdf.RawContent (nth content-div 2))))))

(deftest card-embed-with-html-test
  (let [html-content "<div class=\"smart-scalar\"><span>100</span></div>"
        card-images {42 {:status :ok :format :html :content html-content :card-name "HTML Card"}}
        result      (pdf/ast-node->hiccup {:type "cardEmbed" :attrs {:id 42}} card-images)]
    (is (= :div (first result)))
    (is (= {:class "card-embed"} (second result)))
    (is (= [:div {:class "card-title"} "HTML Card"] (nth result 2)))
    (let [content-div (nth result 3)]
      (is (= :div (first content-div)))
      (is (= {:class "card-content"} (second content-div)))
      (let [raw (nth content-div 2)]
        (is (instance? metabase.documents.pdf.RawContent raw))
        (is (= html-content (:content raw)))))))

(deftest card-embed-with-error-test
  (let [card-images {42 {:status :error :message "Query failed"}}]
    (is (= [:div {:class "card-embed card-error"}
            [:div {:class "card-title"} "Card 42"]
            [:div {:class "error-message"} "Query failed"]]
           (pdf/ast-node->hiccup {:type "cardEmbed" :attrs {:id 42}} card-images)))))

(deftest card-embed-missing-image-test
  (is (= [:div {:class "card-embed card-error"}
          [:div {:class "card-title"} "Card 99"]
          [:div {:class "error-message"} "Unable to render this card"]]
         (pdf/ast-node->hiccup {:type "cardEmbed" :attrs {:id 99}} {}))))

(deftest card-embed-uses-node-name-when-available-test
  (let [card-images {42 {:status :ok :data-uri "data:image/png;base64,abc" :card-name "Server Name"}}]
    (is (= "Custom Name"
           (-> (pdf/ast-node->hiccup {:type "cardEmbed" :attrs {:id 42 :name "Custom Name"}} card-images)
               (get-in [1 1]))))))

(deftest flex-container-test
  (let [result (pdf/ast-node->hiccup
                {:type "flexContainer"
                 :attrs {:columnWidths [30 70]}
                 :content [{:type "cardEmbed" :attrs {:id 1}}
                           {:type "cardEmbed" :attrs {:id 2}}]}
                {})]
    (is (= :table (first result)))
    (is (= "flex-container" (get-in result [1 :class])))))

(deftest flex-container-equal-widths-test
  (let [result (pdf/ast-node->hiccup
                {:type "flexContainer"
                 :content [{:type "text" :text "a"}
                           {:type "text" :text "b"}]}
                {})]
    (is (= :table (first result)))))

(deftest resize-node-passthrough-test
  (is (= [:div [:p "inside"]]
         (pdf/ast-node->hiccup {:type "resizeNode"
                                :attrs {:height 350}
                                :content [{:type "paragraph"
                                           :content [{:type "text" :text "inside"}]}]}
                               {}))))

(deftest supporting-text-test
  (is (= [:div {:class "supporting-text"} [:p "text"]]
         (pdf/ast-node->hiccup {:type "supportingText"
                                :content [{:type "paragraph"
                                           :content [{:type "text" :text "text"}]}]}
                               {}))))

(deftest smart-link-with-label-test
  (let [result (pdf/ast-node->hiccup {:type "smartLink"
                                      :attrs {:entityId 42 :model "card" :label "My Question"}}
                                     {})]
    (is (= :a (first result)))
    (is (= "smart-link" (:class (second result))))
    (is (some? (:href (second result))))
    (is (= "My Question" (nth result 2)))))

(deftest smart-link-unknown-model-test
  (let [result (pdf/ast-node->hiccup {:type "smartLink"
                                      :attrs {:entityId 1 :model "unknown" :label "Fallback"}}
                                     {})]
    (is (= [:span {:class "smart-link"} "Fallback"] result))))

(deftest image-test
  (is (= [:img {:src "https://example.com/img.png" :alt "photo" :class "inline-image"}]
         (pdf/ast-node->hiccup {:type "image"
                                :attrs {:src "https://example.com/img.png" :alt "photo"}}
                               {}))))

(deftest doc-node-test
  (is (= [:div [:p "hello"] [:p "world"]]
         (pdf/ast-node->hiccup
          {:type "doc"
           :content [{:type "paragraph"
                      :content [{:type "text" :text "hello"}]}
                     {:type "paragraph"
                      :content [{:type "text" :text "world"}]}]}
          {}))))

(deftest raw-content-xhtml-serialization-test
  (testing "RawContent is emitted without XML escaping"
    (let [xhtml (#'pdf/hiccup->xhtml-str
                 [:div (pdf/->RawContent "<svg><rect/></svg>")])]
      (is (= "<div><svg><rect/></svg></div>" xhtml))))
  (testing "normal strings are still escaped"
    (let [xhtml (#'pdf/hiccup->xhtml-str
                 [:div "a < b & c"])]
      (is (= "<div>a &lt; b &amp; c</div>" xhtml)))))

(deftest sanitize-svg-for-pdf-test
  (testing "replaces fill=transparent with fill-opacity"
    (let [sanitize #'pdf/sanitize-svg-for-pdf]
      (is (= "<rect fill-opacity=\"0.0\"/>"
             (sanitize "<rect fill=\"transparent\"/>")))))
  (testing "removes <style> elements"
    (let [sanitize #'pdf/sanitize-svg-for-pdf]
      (is (= "<svg></svg>"
             (sanitize "<svg><style type=\"text/css\">.foo:hover{color:red}</style></svg>"))))))

(deftest full-document-ast-test
  (testing "a realistic document AST converts correctly"
    (let [ast {:type "doc"
               :content [{:type "heading"
                          :attrs {:level 1}
                          :content [{:type "text" :text "Report"}]}
                         {:type "paragraph"
                          :content [{:type "text" :text "See the "}
                                    {:type "text" :text "chart" :marks [{:type "bold"}]}
                                    {:type "text" :text " below:"}]}
                         {:type "resizeNode"
                          :attrs {:height 350}
                          :content [{:type "cardEmbed"
                                     :attrs {:id 42}}]}
                         {:type "horizontalRule"}
                         {:type "paragraph"
                          :content [{:type "text" :text "End."}]}]}
          card-images {42 {:status :ok :data-uri "data:img" :card-name "Sales"}}
          result (pdf/ast-node->hiccup ast card-images)]
      (is (= :div (first result)))
      (is (= 5 (count (rest result)))))))
