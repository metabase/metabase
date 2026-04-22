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
;; Y-CRDT's YXmlElement stores attrs as strings (`.setAttribute(String,
;; String)`), so numeric PM attrs come back as strings after a round trip
;; through the YDoc. This is the SAME behavior TipTap's
;; @tiptap/extension-collaboration produces — the frontend's TipTap schema
;; recovers types on parse via each node's `parseHTML` handler. Our server
;; never re-types attrs because it only shuffles the YDoc state through.
;;
;; The value of the schema port is NOT typed attrs — it's that unknown
;; node types fail loudly instead of silently dropping, and that content
;; models get validated.

(deftest ^:parallel heading-level-round-trip-test
  (testing "heading.level survives the YDoc round trip (as string, per wire format)"
    (let [doc {:type "doc"
               :content [{:type    "heading"
                          :attrs   {:level 2}
                          :content [{:type "text" :text "Title"}]}]}
          rt  (round-trip doc)]
      (is (= "heading" (get-in rt [:content 0 :type])))
      ;; Numeric attrs come back as strings — TipTap re-types on the client.
      (is (= "2" (get-in rt [:content 0 :attrs :level]))))))

(deftest ^:parallel ordered-list-start-round-trip-test
  (let [doc {:type "doc"
             :content [{:type    "orderedList"
                        :attrs   {:start 3}
                        :content [{:type "listItem"
                                   :content [{:type "paragraph"
                                              :content [{:type "text" :text "three"}]}]}]}]}
        rt (round-trip doc)]
    (is (= "3" (get-in rt [:content 0 :attrs :start])))))

(deftest ^:parallel card-embed-round-trip-test
  (testing "cardEmbed node with id + name survives the round trip"
    (let [doc {:type "doc"
               :content [{:type  "cardEmbed"
                          :attrs {:id 42 :name "My card"}}]}
          rt  (round-trip doc)]
      (is (= "cardEmbed" (get-in rt [:content 0 :type])))
      (is (= "42" (get-in rt [:content 0 :attrs :id])))
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
      (is (= "7" (get-in node [:attrs :entityId])))
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
    (is (= "500" (get-in rt [:content 0 :attrs :height])))
    (is (= "300" (get-in rt [:content 0 :attrs :minHeight])))))

(deftest ^:parallel json-string-input-accepted-test
  (testing "pm-json->ydoc-bytes accepts both maps and JSON strings"
    (let [pm-str   "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}]}"
          bytes    (collab.prose-mirror/pm-json->ydoc-bytes pm-str)
          round-tripped (collab.prose-mirror/ydoc-bytes->pm-json bytes)]
      (is (= "hi" (get-in round-tripped [:content 0 :content 0 :text]))))))

(deftest ^:parallel unknown-node-type-fails-test
  (testing "schema validation rejects unknown node types (loud failure, not silent drop)"
    (let [doc {:type "doc" :content [{:type "definitelyNotAThing" :attrs {}}]}]
      (is (thrown? Exception (collab.prose-mirror/pm-json->ydoc-bytes doc))))))
