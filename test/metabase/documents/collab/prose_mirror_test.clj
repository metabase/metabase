(ns metabase.documents.collab.prose-mirror-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.collab.prose-mirror :as collab.prose-mirror]))

(set! *warn-on-reflection* true)

(defn- round-trip [pm-json]
  (collab.prose-mirror/ydoc-bytes->pm-json
   (collab.prose-mirror/pm-json->ydoc-bytes pm-json)))

(deftest ^:parallel empty-state-bytes-returns-empty-doc-test
  (is (= {:type "doc" :content []}
         (collab.prose-mirror/ydoc-bytes->pm-json nil)))
  (is (= {:type "doc" :content []}
         (collab.prose-mirror/ydoc-bytes->pm-json (byte-array 0)))))

(deftest ^:parallel empty-pm-doc-round-trip-test
  (is (= {:type "doc" :content []}
         (round-trip {:type "doc" :content []}))))

(deftest ^:parallel paragraph-round-trip-test
  (let [doc {:type    "doc"
             :content [{:type    "paragraph"
                        :content [{:type "text" :text "Hello world"}]}]}
        rt  (round-trip doc)]
    (is (= "Hello world" (get-in rt [:content 0 :content 0 :text])))
    (is (= "paragraph"   (get-in rt [:content 0 :type])))))

(deftest ^:parallel mark-round-trip-boolean-test
  (testing "boolean marks (bold, italic) round-trip as {:type mark-name}"
    (let [doc {:type "doc"
               :content [{:type "paragraph"
                          :content [{:type  "text"
                                     :text  "bold text"
                                     :marks [{:type "bold"}]}]}]}
          rt  (round-trip doc)]
      (is (= "bold text" (get-in rt [:content 0 :content 0 :text])))
      (is (= [{:type "bold"}] (get-in rt [:content 0 :content 0 :marks]))))))

(deftest ^:parallel mark-round-trip-with-attrs-test
  (testing "marks with attrs round-trip with :attrs preserved"
    (let [doc {:type "doc"
               :content [{:type "paragraph"
                          :content [{:type  "text"
                                     :text  "click me"
                                     :marks [{:type "link" :attrs {:href "https://example.com"}}]}]}]}
          rt  (round-trip doc)]
      (is (= "click me" (get-in rt [:content 0 :content 0 :text])))
      (let [marks (get-in rt [:content 0 :content 0 :marks])]
        (is (= 1 (count marks)))
        (is (= "link" (-> marks first :type)))
        (is (= "https://example.com" (-> marks first :attrs :href)))))))

;; ---------------------------------------------------------------
;; Typed-attr round-trip notes
;; ---------------------------------------------------------------
;; ycrdt v0.2+ preserves attribute runtime types through the YDoc round
;; trip: integers stay `Long`, floats stay `Double`, strings stay `String`.
;; Prior (v0.1.x) versions coerced every attribute to `String` on read,
;; which forced clients to re-type via TipTap's `parseHTML`; that coercion
;; is gone. Numeric attrs now come back as integers directly.

(deftest ^:parallel heading-level-round-trip-test
  (testing "heading.level survives the YDoc round trip as an integer"
    (let [doc {:type "doc"
               :content [{:type    "heading"
                          :attrs   {:level 2}
                          :content [{:type "text" :text "Title"}]}]}
          rt  (round-trip doc)]
      (is (= "heading" (get-in rt [:content 0 :type])))
      (is (= 2 (get-in rt [:content 0 :attrs :level]))))))

(deftest ^:parallel ordered-list-start-round-trip-test
  (let [doc {:type "doc"
             :content [{:type    "orderedList"
                        :attrs   {:start 3}
                        :content [{:type "listItem"
                                   :content [{:type "paragraph"
                                              :content [{:type "text" :text "three"}]}]}]}]}
        rt (round-trip doc)]
    (is (= 3 (get-in rt [:content 0 :attrs :start])))))

(deftest ^:parallel card-embed-round-trip-test
  (testing "cardEmbed node with id + name survives the round trip"
    (let [doc {:type "doc"
               :content [{:type  "cardEmbed"
                          :attrs {:id 42 :name "My card"}}]}
          rt  (round-trip doc)]
      (is (= "cardEmbed" (get-in rt [:content 0 :type])))
      (is (= 42 (get-in rt [:content 0 :attrs :id])))
      (is (= "My card" (get-in rt [:content 0 :attrs :name]))))))

(deftest ^:parallel smart-link-round-trip-test
  (testing "smartLink inline atom node preserves all attrs"
    (let [doc {:type "doc"
               :content [{:type "paragraph"
                          :content [{:type "smartLink"
                                     :attrs {:entityId 7 :model "card"
                                             :label "Sales" :href "/card/7"}}]}]}
          rt     (round-trip doc)
          node   (get-in rt [:content 0 :content 0])]
      (is (= "smartLink" (:type node)))
      (is (= 7 (get-in node [:attrs :entityId])))
      (is (= "card" (get-in node [:attrs :model])))
      (is (= "Sales" (get-in node [:attrs :label])))
      (is (= "/card/7" (get-in node [:attrs :href]))))))

(deftest ^:parallel resize-node-round-trip-test
  (let [doc {:type "doc"
             :content [{:type  "resizeNode"
                        :attrs {:height 500 :minHeight 300}
                        :content [{:type  "cardEmbed"
                                   :attrs {:id 1 :name "x"}}]}]}
        rt  (round-trip doc)]
    (is (= 500 (get-in rt [:content 0 :attrs :height])))
    (is (= 300 (get-in rt [:content 0 :attrs :minHeight])))))

(deftest ^:parallel json-string-input-accepted-test
  (testing "pm-json->ydoc-bytes accepts both maps and JSON strings"
    (let [pm-str   "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}]}"
          bytes    (collab.prose-mirror/pm-json->ydoc-bytes pm-str)
          round-tripped (collab.prose-mirror/ydoc-bytes->pm-json bytes)]
      (is (= "hi" (get-in round-tripped [:content 0 :content 0 :text]))))))

;; ---------------------------------------------------------------
;; Coverage for every ported node/mark — round-trip by name
;; ---------------------------------------------------------------

(deftest ^:parallel blockquote-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "blockquote"
                        :content [{:type "paragraph"
                                   :content [{:type "text" :text "quoted"}]}]}]}
        rt  (round-trip doc)]
    (is (= "blockquote" (get-in rt [:content 0 :type])))
    (is (= "quoted"     (get-in rt [:content 0 :content 0 :content 0 :text])))))

(deftest ^:parallel code-block-round-trip-test
  (let [doc {:type "doc"
             :content [{:type    "codeBlock"
                        :attrs   {:language "clojure"}
                        :content [{:type "text" :text "(+ 1 2)"}]}]}
        rt  (round-trip doc)]
    (is (= "codeBlock" (get-in rt [:content 0 :type])))
    (is (= "clojure"   (get-in rt [:content 0 :attrs :language])))
    (is (= "(+ 1 2)"   (get-in rt [:content 0 :content 0 :text])))))

(deftest ^:parallel bullet-list-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "bulletList"
                        :content [{:type "listItem"
                                   :content [{:type "paragraph"
                                              :content [{:type "text" :text "one"}]}]}
                                  {:type "listItem"
                                   :content [{:type "paragraph"
                                              :content [{:type "text" :text "two"}]}]}]}]}
        rt  (round-trip doc)]
    (is (= "bulletList" (get-in rt [:content 0 :type])))
    (is (= 2            (count (get-in rt [:content 0 :content]))))))

(deftest ^:parallel hard-break-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "paragraph"
                        :content [{:type "text" :text "line1"}
                                  {:type "hardBreak"}
                                  {:type "text" :text "line2"}]}]}
        rt  (round-trip doc)
        content (get-in rt [:content 0 :content])]
    (is (some #(= "hardBreak" (:type %)) content))))

(deftest ^:parallel horizontal-rule-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "paragraph" :content [{:type "text" :text "before"}]}
                       {:type "horizontalRule"}
                       {:type "paragraph" :content [{:type "text" :text "after"}]}]}
        rt  (round-trip doc)]
    (is (= "horizontalRule" (get-in rt [:content 1 :type])))))

(deftest ^:parallel image-round-trip-test
  (let [doc {:type "doc"
             :content [{:type  "image"
                        :attrs {:src "https://example.com/x.png"
                                :alt "example"
                                :title "an image"}}]}
        rt  (round-trip doc)]
    (is (= "image" (get-in rt [:content 0 :type])))
    (is (= "https://example.com/x.png" (get-in rt [:content 0 :attrs :src])))
    (is (= "example"                   (get-in rt [:content 0 :attrs :alt])))))

(deftest ^:parallel supporting-text-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "supportingText"
                        :content [{:type "paragraph"
                                   :content [{:type "text" :text "supporting"}]}]}]}
        rt  (round-trip doc)]
    (is (= "supportingText" (get-in rt [:content 0 :type])))
    (is (= "supporting"     (get-in rt [:content 0 :content 0 :content 0 :text])))))

(deftest ^:parallel flex-container-round-trip-test
  (testing "flexContainer with two supportingText children (within {1,3} content constraint)"
    (let [doc {:type "doc"
               :content [{:type "flexContainer"
                          :content [{:type    "supportingText"
                                     :content [{:type "paragraph"
                                                :content [{:type "text" :text "left"}]}]}
                                    {:type    "supportingText"
                                     :content [{:type "paragraph"
                                                :content [{:type "text" :text "right"}]}]}]}]}
          rt  (round-trip doc)]
      (is (= "flexContainer" (get-in rt [:content 0 :type])))
      (is (= 2 (count (get-in rt [:content 0 :content]))))
      (is (= "left"  (get-in rt [:content 0 :content 0 :content 0 :content 0 :text])))
      (is (= "right" (get-in rt [:content 0 :content 1 :content 0 :content 0 :text]))))))

(deftest ^:parallel metabot-round-trip-test
  (testing "metabot block with :code true :marks \"\""
    (let [doc {:type "doc"
               :content [{:type    "metabot"
                          :content [{:type "text" :text "ask something"}]}]}
          rt  (round-trip doc)]
      (is (= "metabot" (get-in rt [:content 0 :type])))
      (is (= "ask something" (get-in rt [:content 0 :content 0 :text]))))))

(deftest ^:parallel italic-mark-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "paragraph"
                        :content [{:type "text" :text "tilted"
                                   :marks [{:type "italic"}]}]}]}
        rt  (round-trip doc)]
    (is (= [{:type "italic"}] (get-in rt [:content 0 :content 0 :marks])))))

(deftest ^:parallel strike-mark-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "paragraph"
                        :content [{:type "text" :text "nope"
                                   :marks [{:type "strike"}]}]}]}
        rt  (round-trip doc)]
    (is (= [{:type "strike"}] (get-in rt [:content 0 :content 0 :marks])))))

(deftest ^:parallel code-mark-round-trip-test
  (let [doc {:type "doc"
             :content [{:type "paragraph"
                        :content [{:type "text" :text "inline"
                                   :marks [{:type "code"}]}]}]}
        rt  (round-trip doc)]
    (is (= [{:type "code"}] (get-in rt [:content 0 :content 0 :marks])))))

(deftest ^:parallel unknown-node-type-fails-test
  (testing "schema validation rejects unknown node types (loud failure, not silent drop)"
    (let [doc {:type "doc" :content [{:type "definitelyNotAThing" :attrs {}}]}]
      (is (thrown-with-msg? com.atlassian.prosemirror.model.RangeError
                            #"Unknown node type"
                            (collab.prose-mirror/pm-json->ydoc-bytes doc))))))
