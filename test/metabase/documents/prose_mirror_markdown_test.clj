(ns metabase.documents.prose-mirror-markdown-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [clojure.walk :as walk]
   [metabase.documents.prose-mirror-markdown :as pmm]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- helpers ----------------------------------------------------

(defn- doc*
  [blocks]
  {:type "doc" :content (vec blocks)})

(defn- doc
  [& blocks]
  (doc* blocks))

(defn- para
  [id & inline]
  {:type "paragraph" :attrs {:_id id} :content (vec inline)})

(defn- text
  ([s] {:type "text" :text s})
  ([s marks] {:type "text" :text s :marks marks}))

(defn- ids
  "Every `_id` in the tree, in document order."
  [ast]
  (keep #(get-in % [:attrs :_id]) (tree-seq :content :content ast)))

(defn- strip-ids
  "Drop every `_id` so a parsed tree, whose ids are freshly minted, compares against the one it came from."
  [ast]
  (walk/postwalk (fn [node]
                   (cond-> node
                     (and (map? node) (:_id node)) (dissoc :_id)))
                 ast))

(defn- round-trip
  "AST -> Markdown -> AST, with `_id`s dropped so the freshly-minted ones compare equal."
  [ast]
  (strip-ids (pmm/markdown->ast (pmm/ast->markdown ast))))

(defn- assert-round-trips
  [ast]
  (is (= (strip-ids ast) (round-trip ast))))

;;; ------------------------------------------- AST -> Markdown --------------------------------------------------

(deftest ^:parallel prose-blocks-test
  (testing "headings, paragraphs, lists, quotes, code, and rules render as CommonMark"
    (let [ast (doc {:type "heading" :attrs {:_id "h" :level 2} :content [(text "Q3 summary")]}
                   (para "p" (text "Revenue was up 12%."))
                   {:type "bulletList" :attrs {:_id "ul"}
                    :content [{:type "listItem" :content [(para "li1" (text "EMEA"))]}
                              {:type "listItem" :content [(para "li2" (text "APAC"))]}]}
                   {:type "orderedList" :attrs {:_id "ol" :start 1 :type nil}
                    :content [{:type "listItem" :content [(para "oli" (text "First"))]}]}
                   {:type "blockquote" :attrs {:_id "bq"} :content [(para "bqp" (text "A caveat."))]}
                   {:type "codeBlock" :attrs {:_id "cb" :language "sql"}
                    :content [(text "select 1")]}
                   {:type "horizontalRule"})]
      (is (= (str "## Q3 summary\n\n"
                  "Revenue was up 12%.\n\n"
                  "- EMEA\n- APAC\n\n"
                  "1. First\n\n"
                  "> A caveat.\n\n"
                  "```sql\nselect 1\n```\n\n"
                  "---")
             (pmm/ast->markdown ast)))
      (assert-round-trips ast))))

(deftest ^:parallel marks-test
  (testing "every mark the editor carries has a Markdown form"
    (let [ast (doc (para "p"
                         (text "plain ")
                         (text "bold" [{:type "bold"}])
                         (text " ")
                         (text "italic" [{:type "italic"}])
                         (text " ")
                         (text "struck" [{:type "strike"}])
                         (text " ")
                         (text "under" [{:type "underline"}])
                         (text " ")
                         (text "code" [{:type "code"}])
                         (text " ")
                         (text "link" [{:type "link" :attrs {:href "https://metabase.com"}}])))]
      (is (= "plain **bold** *italic* ~~struck~~ <u>under</u> `code` [link](https://metabase.com)"
             (pmm/ast->markdown ast)))
      (assert-round-trips ast))))

(deftest ^:parallel token-test
  (testing "card embeds and smart links render as the tokens the editor's own nodes emit"
    (let [ast (doc {:type "resizeNode" :attrs {:height 442 :minHeight 280}
                    :content [{:type "cardEmbed" :attrs {:_id "c" :id 118 :name "Revenue by region"}}]}
                   (para "p"
                         (text "Full picture: ")
                         {:type "smartLink" :attrs {:entityId 42 :model "dashboard" :label "Ops" :href "/dashboard/42"}}
                         (text ".")))]
      (is (= (str "{% card id=118 name=\"Revenue by region\" %}\n\n"
                  "Full picture: {% entity id=42 model=\"dashboard\" label=\"Ops\" href=\"/dashboard/42\" %}.")
             (pmm/ast->markdown ast)))
      (assert-round-trips ast)))
  (testing "a resized card carries its height"
    (is (= "{% card id=7 height=800 %}"
           (pmm/ast->markdown (doc {:type "resizeNode" :attrs {:height 800 :minHeight 280}
                                    :content [{:type "cardEmbed" :attrs {:_id "c" :id 7 :name nil}}]}))))))

(deftest ^:parallel layout-container-test
  (testing "columns round-trip with their widths, heights, and mixed card / supporting-text children"
    (let [ast (doc {:type "resizeNode" :attrs {:height 600 :minHeight 280}
                    :content [{:type "flexContainer" :attrs {:columnWidths [50 50]}
                               :content [{:type "supportingText" :attrs {:_id "st"}
                                          :content [(para "stp" (text "Left commentary."))]}
                                         {:type "cardEmbed" :attrs {:_id "c" :id 9 :name "Trend"}}]}]})]
      (is (= (str "{% columns widths=[50,50] height=600 %}\n"
                  "{% column %}\nLeft commentary.\n{% /column %}\n"
                  "{% column %}\n{% card id=9 name=\"Trend\" %}\n{% /column %}\n"
                  "{% /columns %}")
             (pmm/ast->markdown ast)))
      (assert-round-trips ast))))

(deftest ^:parallel transient-node-test
  (testing "the metabot prompt block is dropped from the projection"
    (is (= "Before\n\nAfter"
           (pmm/ast->markdown (doc (para "a" (text "Before"))
                                   {:type "metabot" :content [(text "summarize this")]}
                                   (para "b" (text "After"))))))))

(deftest ^:parallel escaping-test
  (testing "Markdown syntax and token openers in prose survive a round trip as literal text"
    (doseq [s ["a * b _ c ` d [e] ~f~ <g>"
               "{% card id=1 %} is a token"
               "1. not a list"
               "# not a heading"
               "- not a bullet"]]
      (let [ast (doc (para "p" (text s)))]
        (is (= [(text s)]
               (get-in (round-trip ast) [:content 0 :content]))
            s)))))

(def ^:private editor-document
  "A document in the shape the editor actually saves — see `e2e/support/document-initial-data.ts`."
  (doc (para "1" (text "Testing drag and drop functionality"))
       {:type "resizeNode" :attrs {:height 350 :minHeight 280 :_id "2"}
        :content [{:type "cardEmbed" :attrs {:id 1 :name nil :_id "2a"}}]}
       (para "3" (text "Some text between cards"))
       {:type "resizeNode" :attrs {:height 350 :minHeight 280 :_id "4"}
        :content [{:type "flexContainer" :attrs {:_id "4a"}
                   :content [{:type "cardEmbed" :attrs {:id 2 :name nil :_id "4a1"}}
                             {:type "cardEmbed" :attrs {:id 3 :name nil :_id "4a2"}}]}]}
       {:type "paragraph" :attrs {:_id "5"}}))

(deftest ^:parallel editor-document-test
  (testing "a document as the editor saves it projects to Markdown, empty trailing paragraph and all"
    (is (= (str "Testing drag and drop functionality\n\n"
                "{% card id=1 height=350 %}\n\n"
                "Some text between cards\n\n"
                "{% columns height=350 %}\n"
                "{% column %}\n{% card id=2 %}\n{% /column %}\n"
                "{% column %}\n{% card id=3 %}\n{% /column %}\n"
                "{% /columns %}")
           (pmm/ast->markdown editor-document))))
  (testing "a block with no Markdown projection is invisible to an edit, and so survives it"
    (let [{:keys [ast]} (pmm/apply-edits editor-document
                                         [{:old_str "Some text between cards" :new_str "Rewritten"}])]
      (is (= {:type "paragraph" :attrs {:_id "5"}} (last (:content ast))))
      (is (= (get-in editor-document [:content 3]) (get-in ast [:content 3]))))))

;;; ------------------------------------------- Markdown -> AST --------------------------------------------------

(deftest ^:parallel parse-test
  (testing "an agent's minimal token forms parse into the canonical wrapped nodes"
    (is (= (doc {:type "resizeNode" :attrs {:height 442 :minHeight 280}
                 :content [{:type "cardEmbed" :attrs {:id 118 :name nil}}]})
           (strip-ids (pmm/markdown->ast "{% card id=118 %}")))))
  (testing "a smart link written without a label or href gets the schema's default href"
    (is (= {:type "smartLink" :attrs {:href "/" :entityId 42 :model "dashboard"}}
           (get-in (pmm/markdown->ast "See {% entity id=42 model=\"dashboard\" %}.")
                   [:content 0 :content 1]))))
  (testing "tokens inside a fenced code block are code, not tokens"
    (let [ast (pmm/markdown->ast "```\n{% card id=1 %}\n```")]
      (is (= "codeBlock" (get-in ast [:content 0 :type])))
      (is (= "{% card id=1 %}" (get-in ast [:content 0 :content 0 :text])))))
  (testing "every parsed block that anchors comments gets an _id"
    (is (every? some? (ids (pmm/markdown->ast "# Title\n\nBody\n\n- item"))))))

(deftest ^:parallel column-content-test
  (testing "a column mixing prose with a card token throws instead of dropping the card"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"holds either prose or a single .*card.* token, never both"
         (pmm/markdown->ast (str "{% columns %}\n"
                                 "{% column %}\nSome intro text.\n{% card id=5 %}\n{% /column %}\n"
                                 "{% column %}\nMore text\n{% /column %}\n"
                                 "{% /columns %}")))))
  (testing "a column holding two cards throws instead of dropping the second"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"holds either prose or a single .*card.* token, never both"
         (pmm/markdown->ast (str "{% columns %}\n"
                                 "{% column %}\n{% card id=1 %}\n{% card id=2 %}\n{% /column %}\n"
                                 "{% column %}\nMore text\n{% /column %}\n"
                                 "{% /columns %}")))))
  (testing "a column nesting another {% columns %} block throws instead of dropping it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"can't nest another"
         (pmm/markdown->ast (str "{% columns %}\n"
                                 "{% column %}\n"
                                 "{% columns widths=[50,50] %}\n"
                                 "{% column %}\nA\n{% /column %}\n"
                                 "{% column %}\nB\n{% /column %}\n"
                                 "{% /columns %}\n"
                                 "{% /column %}\n"
                                 "{% column %}\nMore text\n{% /column %}\n"
                                 "{% /columns %}"))))))

;;; ---------------------------------------------- edit splice ---------------------------------------------------

(def ^:private edit-doc
  (doc {:type "heading" :attrs {:_id "id-heading" :level 2} :content [(text "Q3 summary")]}
       (para "id-first" (text "Revenue was up 12% on strong EMEA demand."))
       {:type "resizeNode" :attrs {:height 442 :minHeight 280}
        :content [{:type "cardEmbed" :attrs {:_id "id-card" :id 118 :name "Revenue by region"}}]}
       (para "id-last" (text "More to come."))))

(deftest ^:parallel splice-preserves-untouched-blocks-test
  (let [{:keys [ast orphaned-block-ids]}
        (pmm/apply-edits edit-doc [{:old_str "up 12%" :new_str "up 14%"}])]
    (testing "the edited block is re-created, so its id changes and its comment threads orphan"
      (is (= #{"id-first"} orphaned-block-ids))
      (is (= "Revenue was up 14% on strong EMEA demand."
             (get-in ast [:content 1 :content 0 :text])))
      (is (not= "id-first" (get-in ast [:content 1 :attrs :_id]))))
    (testing "every other block keeps its exact node, id, and attrs"
      (is (= (get-in edit-doc [:content 0]) (get-in ast [:content 0])))
      (is (= (get-in edit-doc [:content 2]) (get-in ast [:content 2])))
      (is (= (get-in edit-doc [:content 3]) (get-in ast [:content 3]))))))

(deftest ^:parallel splice-across-blocks-test
  (testing "a match spanning two blocks re-creates both and orphans both ids"
    (let [{:keys [ast orphaned-block-ids]}
          (pmm/apply-edits edit-doc [{:old_str "## Q3 summary\n\nRevenue was up 12%"
                                      :new_str "## Q4 summary\n\nRevenue was up 3%"}])]
      (is (= #{"id-heading" "id-first"} orphaned-block-ids))
      (is (= "Q4 summary" (get-in ast [:content 0 :content 0 :text])))
      (is (= (get-in edit-doc [:content 2]) (get-in ast [:content 2]))))))

(deftest ^:parallel splice-card-embed-test
  (testing "editing a card token re-creates the embed and orphans the threads anchored to it"
    (let [{:keys [ast orphaned-block-ids]}
          (pmm/apply-edits edit-doc [{:old_str "{% card id=118 name=\"Revenue by region\" %}"
                                      :new_str "{% card id=200 name=\"Revenue by month\" %}"}])]
      (is (= #{"id-card"} orphaned-block-ids))
      (is (= {:id 200 :name "Revenue by month"}
             (dissoc (get-in ast [:content 2 :content 0 :attrs]) :_id))))))

(deftest ^:parallel splice-append-test
  (testing "appending a section anchored to the end of the previous one leaves earlier blocks alone"
    (let [{:keys [ast orphaned-block-ids]}
          (pmm/apply-edits edit-doc [{:old_str "More to come."
                                      :new_str "More to come.\n\n## Next steps\n\nShip it."}])]
      (is (= #{"id-last"} orphaned-block-ids))
      (is (= ["Q3 summary" "Revenue was up 12% on strong EMEA demand." "More to come." "Next steps" "Ship it."]
             (->> (tree-seq :content :content ast) (keep :text))))
      (is (= ["id-heading" "id-first" "id-card"]
             (take 3 (ids ast)))))))

(deftest ^:parallel splice-deletion-test
  (testing "an edit that empties a block removes it, and the ids it took with it are reported"
    (let [{:keys [ast orphaned-block-ids]}
          (pmm/apply-edits edit-doc [{:old_str "More to come." :new_str ""}])]
      (is (= #{"id-last"} orphaned-block-ids))
      (is (= 3 (count (:content ast)))))))

(deftest ^:parallel match-discipline-test
  (let [ast (doc (para "a" (text "the same line"))
                 (para "b" (text "the same line")))]
    (testing "no match names the fix"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No match for old_str"
                            (pmm/apply-edits ast [{:old_str "absent" :new_str "x"}]))))
    (testing "several matches report the count and name the fix"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"matched 2 times"
                            (pmm/apply-edits ast [{:old_str "the same line" :new_str "x"}])))
      (is (= {:matches 2 :old_str "the same line" :status-code 400}
             (try (pmm/apply-edits ast [{:old_str "the same line" :new_str "x"}])
                  (catch clojure.lang.ExceptionInfo e (ex-data e))))))
    (testing "replace_all takes every occurrence"
      (let [{:keys [ast orphaned-block-ids]}
            (pmm/apply-edits ast [{:old_str "the same line" :new_str "a new line" :replace_all true}])]
        (is (= #{"a" "b"} orphaned-block-ids))
        (is (= ["a new line" "a new line"] (->> (tree-seq :content :content ast) (keep :text))))))))

(deftest ^:parallel sequential-edits-test
  (testing "later edits anchor against the projection the earlier ones produced"
    (let [{:keys [ast orphaned-block-ids]}
          (pmm/apply-edits edit-doc [{:old_str "up 12%" :new_str "up 14%"}
                                     {:old_str "up 14% on strong EMEA" :new_str "up 14% on strong APAC"}])]
      (is (= #{"id-first"} orphaned-block-ids))
      (is (= "Revenue was up 14% on strong APAC demand."
             (get-in ast [:content 1 :content 0 :text]))))))

;;; ------------------------------------------- edit splice property ----------------------------------------------

(defn- nth-block
  "The i-th block of a document, made unique so its Markdown chunk can only match itself."
  [kind i]
  (case kind
    :paragraph {:type "paragraph" :attrs {:_id (str "id-" i)}
                :content [{:type "text" :text (str "paragraph body " i)}]}
    :heading   {:type "heading" :attrs {:_id (str "id-" i) :level 2}
                :content [{:type "text" :text (str "Heading " i)}]}
    :quote     {:type "blockquote" :attrs {:_id (str "id-" i)}
                :content [{:type "paragraph" :attrs {:_id (str "qp-" i)}
                           :content [{:type "text" :text (str "quoted " i)}]}]}
    :card      {:type "resizeNode" :attrs {:height 442 :minHeight 280}
                :content [{:type "cardEmbed" :attrs {:_id (str "id-" i) :id (inc i) :name (str "Card " i)}}]}
    :columns   {:type "resizeNode" :attrs {:height 442 :minHeight 280}
                :content [{:type "flexContainer" :attrs {:columnWidths [50 50]}
                           :content [{:type "supportingText" :attrs {:_id (str "id-" i)}
                                      :content [{:type "paragraph" :attrs {:_id (str "cp-" i)}
                                                 :content [{:type "text" :text (str "col text " i)}]}]}
                                     {:type "cardEmbed" :attrs {:_id (str "cc-" i) :id (+ 100 i)
                                                                :name (str "Col card " i)}}]}]}
    :metabot   {:type "metabot" :content [{:type "text" :text (str "prompt " i)}]}))

(defspec splice-matches-a-direct-parse-and-leaves-the-rest-untouched 200
  (prop/for-all [kinds   (gen/vector (gen/elements [:paragraph :heading :quote :card :columns :metabot]) 1 6)
                 target  gen/nat
                 new-str (gen/elements ["rewritten" "" "one\n\ntwo" "# a heading"])]
    (let [blocks   (vec (map-indexed #(nth-block %2 %1) kinds))
          ast      (doc* blocks)
          markdown (pmm/ast->markdown ast)
          chunks   (remove str/blank? (str/split markdown #"\n\n"))]
      ;; a document of nothing but dropped (metabot) blocks has no projection and so nothing to edit
      (or (empty? chunks)
          (let [old-str    (nth chunks (mod target (count chunks)))
                touched    (first (keep-indexed (fn [i block]
                                                  (when (= old-str (pmm/ast->markdown (doc* [block])))
                                                    i))
                                                blocks))
                {:keys [ast orphaned-block-ids]}
                (pmm/apply-edits ast [{:old_str old-str :new_str new-str}])
                edited     (:content ast)
                trailing   (subvec blocks (inc touched))
                middle     (subvec edited touched (- (count edited) (count trailing)))]
            (and (= (subvec blocks 0 touched)
                    (subvec edited 0 touched))
                 (= trailing
                    (vec (take-last (count trailing) edited)))
                 ;; the spliced region is exactly what parsing new-str on its own produces
                 (= (strip-ids (:content (pmm/markdown->ast new-str)))
                    (strip-ids middle))
                 ;; the touched block's own ids, and only they, are reported orphaned
                 (= (set (ids (nth blocks touched)))
                    orphaned-block-ids)))))))
