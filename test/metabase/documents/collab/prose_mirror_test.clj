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
                        :content [{:type "text" :text "Hello world"}]}]}]
    (is (= doc (round-trip doc)))))

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
      (is (= [{:type "link" :attrs {:href "https://example.com"}}]
             (get-in rt [:content 0 :content 0 :marks]))))))

(deftest ^:parallel unknown-node-type-preserved-test
  (testing "schema-free walker preserves custom TipTap-style nodes (cardEmbed)"
    (let [doc {:type "doc"
               :content [{:type  "cardEmbed"
                          :attrs {:id "42" :model "card"}}]}
          rt  (round-trip doc)]
      (is (= "cardEmbed" (get-in rt [:content 0 :type])))
      (is (= {:id "42" :model "card"} (get-in rt [:content 0 :attrs]))))))

(deftest ^:parallel node-attrs-round-trip-test
  (testing "node attrs are preserved as strings"
    (let [doc {:type "doc"
               :content [{:type  "heading"
                          :attrs {:level "1"}
                          :content [{:type "text" :text "Title"}]}]}
          rt  (round-trip doc)]
      (is (= "heading" (get-in rt [:content 0 :type])))
      (is (= {:level "1"} (get-in rt [:content 0 :attrs])))
      (is (= "Title" (get-in rt [:content 0 :content 0 :text]))))))

(deftest ^:parallel json-string-input-accepted-test
  (testing "pm-json->ydoc-bytes accepts both maps and JSON strings"
    (let [pm-str   "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}]}]}"
          bytes    (collab.prose-mirror/pm-json->ydoc-bytes pm-str)
          round-tripped (collab.prose-mirror/ydoc-bytes->pm-json bytes)]
      (is (= "hi" (get-in round-tripped [:content 0 :content 0 :text]))))))
