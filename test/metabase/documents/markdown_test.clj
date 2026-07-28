(ns metabase.documents.markdown-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.documents.markdown :as md]))

(set! *warn-on-reflection* true)

(defn- strip-ids
  [ast]
  (walk/postwalk #(if (map? %) (dissoc % :_id) %) ast))

(defn- para
  [text]
  {:type "paragraph" :attrs {:_id (str (random-uuid))} :content [{:type "text" :text text}]})

(defn- text+marks
  [node]
  ((juxt :text :marks) node))

(defn- reserialize
  [ast]
  (:markdown (md/serialize ast)))

;;; ------------------------------------------------ Round-trip ----------------------------------------------------

(deftest ^:parallel round-trip-every-node-type-test
  (testing "serialize∘parse is a fixed point over a document exercising every node type"
    (let [ast {:type "doc"
               :content
               [{:type "heading" :attrs {:level 2 :_id "h1"} :content [{:type "text" :text "Q3 summary"}]}
                {:type "paragraph" :attrs {:_id "p1"}
                 :content [{:type "text" :text "Revenue was "}
                           {:type "text" :text "up 12%" :marks [{:type "bold"}]}
                           {:type "text" :text " on "}
                           {:type "text" :text "EMEA" :marks [{:type "italic"}]}
                           {:type "text" :text " with "}
                           {:type "text" :text "inline code" :marks [{:type "code"}]}
                           {:type "text" :text " and a "}
                           {:type "text" :text "link"
                            :marks [{:type "link" :attrs {:href   "https://example.com"
                                                          :target "_blank"
                                                          :rel    "noopener noreferrer nofollow"}}]}
                           {:type "text" :text "."}]}
                {:type "resizeNode" :attrs {:height 442 :minHeight 280}
                 :content [{:type "cardEmbed" :attrs {:id 118 :name "Revenue by region" :_id "c1"}}]}
                {:type "resizeNode" :attrs {:height 300 :minHeight 200}
                 :content [{:type "cardEmbed" :attrs {:id 119 :name nil :_id "c2"}}]}
                {:type "bulletList" :attrs {:_id "l1"}
                 :content [{:type "listItem" :content [(para "first")]}
                           {:type "listItem" :content [(para "second")]}]}
                {:type "orderedList" :attrs {:start 1 :type nil :_id "l2"}
                 :content [{:type "listItem" :content [(para "one")]}]}
                {:type "blockquote" :attrs {:_id "q1"} :content [(para "quoted")]}
                {:type "codeBlock" :attrs {:language "sql" :_id "cb1"}
                 :content [{:type "text" :text "SELECT *\nFROM orders"}]}
                {:type "horizontalRule"}
                {:type "metabot" :attrs {} :content [{:type "text" :text "scratch"}]}
                {:type "resizeNode" :attrs {:height 442 :minHeight 280}
                 :content [{:type "flexContainer" :attrs {:columnWidths [60 40]}
                            :content [{:type "supportingText" :attrs {:_id "st1"}
                                       :content [(para "Supporting prose.")]}
                                      {:type "cardEmbed" :attrs {:id 120 :name "Trend" :_id "c3"}}]}]}
                {:type "paragraph" :attrs {:_id "pz"}}]}
          {m1 :markdown} (md/serialize ast)
          reparsed       (md/parse m1)
          expected       (strip-ids (update ast :content (fn [c] (vec (remove #(= "metabot" (:type %)) c)))))]
      (is (= expected (strip-ids reparsed)))
      (is (= m1 (reserialize reparsed)))
      (is (not (str/includes? m1 "scratch")) "metabot nodes emit nothing"))))

(deftest ^:parallel serialize-deterministic-test
  (let [ast {:type "doc" :content [(para "hello") (para "world")]}]
    (is (= (md/serialize ast) (md/serialize ast)))))

(deftest ^:parallel parse-is-in-editor-normal-form-test
  (testing "a text node's marks are in the editor schema's rank order"
    (is (= [["outer " ["italic"]]
            ["code" ["code" "italic"]]
            [" and " ["italic"]]
            ["bold" ["bold" "italic"]]
            [" here" ["italic"]]]
           (for [node (get-in (md/parse "*outer `code` and **bold** here*") [:content 0 :content])]
             [(:text node) (mapv :type (:marks node))]))))
  (testing "a childless node omits :content, the way ProseMirror's own toJSON does"
    (is (= [{:type "paragraph" :attrs {}}]
           (strip-ids (:content (md/parse "")))))
    (is (= [{:type "codeBlock" :attrs {:language nil}} {:type "paragraph" :attrs {}}]
           (strip-ids (:content (md/parse "```\n```"))))))
  (testing "every attribute the editor's schema declares is present, so no default is filled in on load"
    (is (= {:start 1 :type nil}
           (-> (md/parse "1. one") :content first :attrs (dissoc :_id))))
    (is (= {:href "https://example.com" :target "_blank" :rel "noopener noreferrer nofollow"}
           (-> (md/parse "[x](https://example.com)") :content first :content first :marks first :attrs)))))

(deftest ^:parallel body-ends-in-a-paragraph-test
  (testing "a body whose last block isn't a paragraph gets an empty one, the way the editor's trailingNode plugin would"
    (doseq [markdown ["# Heading"
                      "> quoted"
                      "- a\n- b"
                      "```\ncode\n```"
                      "---"
                      "{% card id=118 %}"
                      "::: flex {columns=[60,40]}\n{% card id=1 %}\n{% card id=2 %}\n:::"]]
      (is (= {:type "paragraph" :attrs {}}
             (strip-ids (peek (:content (md/parse markdown)))))
          markdown)))
  (testing "a body already ending in a paragraph is left alone"
    (is (= ["heading" "paragraph"]
           (mapv :type (:content (md/parse "# Heading\n\nProse."))))))
  (testing "an edit that leaves a non-paragraph last gets one appended, and re-editing doesn't stack them up"
    (let [ast     (md/parse "Intro.\n\nOutro.")
          ser     (md/serialize ast)
          start   (str/index-of (:markdown ser) "Outro.")
          spliced (md/splice ast ser start (+ start (count "Outro.")) "# Heading")]
      (is (= ["paragraph" "heading" "paragraph"] (mapv :type (:content spliced))))
      (let [ser (md/serialize spliced)]
        (is (= ["paragraph" "heading" "paragraph"]
               (mapv :type (:content (md/splice spliced ser 0 (count "Intro.") "Preamble."))))))))
  (testing "an empty body is floored to a single paragraph"
    (is (= [{:type "paragraph" :attrs {}}]
           (strip-ids (:content (md/parse "")))))))

(deftest ^:parallel loose-embeds-get-a-resize-wrapper-test
  (testing "a bare card token becomes a resize-wrapped embed — the wrapper is the only thing carrying a height"
    (is (= [{:type    "resizeNode"
             :attrs   {:height 442 :minHeight 280}
             :content [{:type "cardEmbed" :attrs {:id 118 :name "Revenue"}}]}
            {:type "paragraph" :attrs {}}]
           (strip-ids (:content (md/parse "{% card id=118 name=\"Revenue\" %}"))))))
  (testing "a bare flex container gets one too"
    (is (= ["resizeNode" "paragraph"]
           (mapv :type (:content (md/parse "::: flex {columns=[60,40]}\n{% card id=1 %}\n{% card id=2 %}\n:::"))))))
  (testing "an explicit ::: resize fence keeps its own dimensions and is not double-wrapped"
    (is (= [{:type    "resizeNode"
             :attrs   {:height 600 :minHeight 300}
             :content [{:type "cardEmbed" :attrs {:id 118 :name nil}}]}
            {:type "paragraph" :attrs {}}]
           (strip-ids (:content (md/parse "::: resize {height=600 minHeight=300}\n{% card id=118 %}\n:::"))))))
  (testing "an edit that introduces a card token wraps it, leaving untouched blocks alone"
    (let [ast      (md/parse "Intro.\n\nOutro.")
          ser      (md/serialize ast)
          start    (str/index-of (:markdown ser) "Outro.")
          spliced  (md/splice ast ser start (+ start (count "Outro.")) "{% card id=118 %}")]
      (is (= ["paragraph" "resizeNode" "paragraph"] (mapv :type (:content spliced))))
      (is (= (get-in ast [:content 0 :attrs :_id])
             (get-in spliced [:content 0 :attrs :_id]))))))

;;; ------------------------------------------------ Token scanning ------------------------------------------------

(deftest ^:parallel code-block-token-opacity-test
  (testing "card tokens and container fences inside a fenced code block are content, not structure"
    (let [ast {:type "doc"
               :content [{:type "codeBlock" :attrs {:language nil :_id "cb"}
                          :content [{:type "text" :text "{% card id=118 %}\n::: flex\ntext"}]}
                         {:type "paragraph" :attrs {:_id "pz"}}]}
          {m :markdown} (md/serialize ast)
          reparsed      (md/parse m)]
      (is (= (strip-ids ast) (strip-ids reparsed)))
      (is (= ["codeBlock" "paragraph"] (mapv :type (:content reparsed))))))
  (testing "a tilde fence is opaque too"
    (let [reparsed (md/parse "~~~\n{% card id=118 %}\n~~~")]
      (is (= ["codeBlock" "paragraph"] (mapv :type (:content reparsed)))))))

(deftest ^:parallel unclosed-token-never-overflows-test
  (testing "a very long unclosed token parses as plain text instead of overflowing the regex engine"
    (let [text (str "{% entity " (apply str (repeat 100000 "a")))]
      (is (= ["paragraph"] (mapv :type (:content (md/parse text)))))))
  (testing "an absurdly long card token body is a teaching error, not a crash"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"attributes exceed"
                          (md/parse (str "{% card " (apply str (repeat 100000 "a")) " %}"))))))

(deftest ^:parallel oversized-numeric-token-test
  (testing "a >18-digit id stays a string and hits the token's own teaching error"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid card token"
                          (md/parse "{% card id=99999999999999999999 %}")))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"height must be a number"
                          (md/parse "::: resize {height=99999999999999999999}\n{% card id=1 %}\n:::")))))

;;; ------------------------------------------------ Inline conversion ---------------------------------------------

(deftest ^:parallel bare-url-autolink-test
  (testing "a bare URL gets a link mark and the run around it converts normally"
    (let [inlines (get-in (md/parse "cost *5* at http://x.com ok") [:content 0 :content])]
      (is (some (fn [n] (some #(= "link" (:type %)) (:marks n))) inlines))))
  (testing "escapes near a bare URL don't double on re-serialization"
    (let [m1 (reserialize (md/parse "cost *5* at http://x.com ok"))
          m2 (reserialize (md/parse m1))]
      (is (= m1 m2)))))

(deftest ^:parallel emphasis-boundary-whitespace-test
  (testing "boundary whitespace moves outside the delimiters so the mark survives re-parse"
    (let [ast {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                      :content [{:type "text" :text "see "}
                                                {:type "text" :text " word " :marks [{:type "bold"}]}
                                                {:type "text" :text "end"}]}]}
          {m :markdown} (md/serialize ast)]
      (is (= "see  **word** end" m))
      (is (= [["see  " nil] ["word" [{:type "bold"}]] [" end" nil]]
             (mapv text+marks (get-in (md/parse m) [:content 0 :content]))))))
  (testing "a leading-space italic can't turn the paragraph into a list"
    (let [ast {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                      :content [{:type "text" :text " hi" :marks [{:type "italic"}]}
                                                {:type "text" :text " after"}]}]}
          {m :markdown} (md/serialize ast)]
      (is (= ["paragraph"] (mapv :type (:content (md/parse m)))))))
  (testing "whole-whitespace marked text drops its delimiters"
    (let [ast {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                      :content [{:type "text" :text "a"}
                                                {:type "text" :text "   " :marks [{:type "bold"}]}
                                                {:type "text" :text "b"}]}]}]
      (is (= "a   b" (:markdown (md/serialize ast)))))))

(deftest ^:parallel code-span-delimiter-test
  (testing "content with backtick runs gets a longer delimiter and round-trips"
    (let [ast {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                      :content [{:type "text" :text "a``b" :marks [{:type "code"}]}]}]}
          {m :markdown} (md/serialize ast)]
      (is (= [["a``b" [{:type "code"}]]]
             (mapv text+marks (get-in (md/parse m) [:content 0 :content]))))))
  (testing "content with symmetric edge spaces is padded and round-trips"
    (let [ast {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                      :content [{:type "text" :text " x " :marks [{:type "code"}]}]}]}
          {m :markdown} (md/serialize ast)]
      (is (= [[" x " [{:type "code"}]]]
             (mapv text+marks (get-in (md/parse m) [:content 0 :content])))))))

(deftest ^:parallel link-destination-test
  (testing "hrefs with spaces and parens keep their link mark through a round trip"
    (doseq [[href expected] [["/a b(c)" "/a%20b(c)"]
                             ["https://x.com/q?a=(1)" "https://x.com/q?a=(1)"]
                             ["/plain" "/plain"]]]
      (let [ast {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                        :content [{:type "text" :text "go"
                                                   :marks [{:type "link" :attrs {:href href}}]}]}]}
            {m :markdown} (md/serialize ast)
            reparsed      (md/parse m)]
        (is (= expected (get-in reparsed [:content 0 :content 0 :marks 0 :attrs :href]))
            (str "href " (pr-str href)))
        (is (= m (reserialize reparsed)))))))

;;; ------------------------------------------------ Block serialization -------------------------------------------

(deftest ^:parallel indented-paragraph-stays-paragraph-test
  (let [ast {:type "doc" :content [(para "    indented start")]}
        {m :markdown} (md/serialize ast)]
    (is (= ["paragraph"] (mapv :type (:content (md/parse m)))))))

(deftest ^:parallel card-name-escaping-test
  (testing "backslashes, quotes, and newlines in a card name survive the token round trip"
    (let [ast {:type "doc" :content [{:type "cardEmbed" :attrs {:id 5 :name "back\\slash\" q\nnewline" :_id "c"}}]}
          {m :markdown} (md/serialize ast)
          reparsed      (md/parse m)]
      (is (= ["cardEmbed"] (mapv :type (get-in reparsed [:content 0 :content]))))
      (is (= "back\\slash\" q newline" (get-in reparsed [:content 0 :content 0 :attrs :name]))))))

(deftest ^:parallel heading-single-line-test
  (testing "hardBreak renders as a space inside a heading"
    (let [ast {:type "doc" :content [{:type "heading" :attrs {:level 2 :_id "h"}
                                      :content [{:type "text" :text "one"}
                                                {:type "hardBreak"}
                                                {:type "text" :text "two"}]}]}
          {m :markdown} (md/serialize ast)
          reparsed      (md/parse m)]
      (is (= ["heading" "paragraph"] (mapv :type (:content reparsed))))
      (is (= "one two" (get-in reparsed [:content 0 :content 0 :text])))))
  (testing "a trailing hash run is not stripped as an ATX closing sequence"
    (let [ast {:type "doc" :content [{:type "heading" :attrs {:level 1 :_id "h"}
                                      :content [{:type "text" :text "foo #"}]}]}
          {m :markdown} (md/serialize ast)]
      (is (= "foo #" (get-in (md/parse m) [:content 0 :content 0 :text]))))))

(deftest ^:parallel adjacent-same-type-lists-test
  (let [li  (fn [t] {:type "listItem" :content [(para t)]})
        ast {:type "doc" :content [{:type "bulletList" :attrs {:_id "l1"} :content [(li "a") (li "b")]}
                                   {:type "bulletList" :attrs {:_id "l2"} :content [(li "c")]}
                                   {:type "paragraph" :attrs {:_id "pz"}}]}
        {m :markdown} (md/serialize ast)
        reparsed      (md/parse m)]
    (is (= ["bulletList" "bulletList" "paragraph"] (mapv :type (:content reparsed))))
    (is (= (strip-ids ast) (strip-ids reparsed)))))

(deftest ^:parallel serialize-coerces-or-rejects-attr-types-test
  (testing "numeric-looking string attrs coerce"
    (is (= "{% card id=118 %}"
           (:markdown (md/serialize {:type "doc" :content [{:type "cardEmbed" :attrs {:id "118" :_id "c"}}]}))))
    (is (str/includes?
         (:markdown (md/serialize {:type "doc"
                                   :content [{:type "resizeNode" :attrs {:height "442" :minHeight 280}
                                              :content [{:type "cardEmbed" :attrs {:id 1 :_id "c"}}]}]}))
         "{height=442 minHeight=280}")))
  (testing "non-coercible attrs are teaching errors, not ClassCastException/NPE"
    (doseq [ast [{:type "doc" :content [{:type "cardEmbed" :attrs {:id nil :_id "c"}}]}
                 {:type "doc" :content [{:type "cardEmbed" :attrs {:id "nope" :_id "c"}}]}
                 {:type "doc" :content [{:type "resizeNode" :attrs {:height {:x 1} :minHeight 280}
                                         :content [{:type "cardEmbed" :attrs {:id 1 :_id "c"}}]}]}
                 {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                         :content [{:type "smartLink" :attrs {:entityId "bad" :model "card"}}]}]}]]
      (is (= 400 (try (md/serialize ast)
                      ::no-error
                      (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))))))))

;;; ------------------------------------------------ Smart links ---------------------------------------------------

(deftest unresolved-smart-link-defaults-test
  (testing "an entity token whose id doesn't resolve keeps the node with default label/href"
    (let [reparsed (md/parse "x {% entity id=\"987654321\" model=\"dashboard\" %} y")]
      (is (= {:entityId 987654321 :model "dashboard" :label nil :href "/"}
             (get-in reparsed [:content 0 :content 1 :attrs]))))))

;;; ------------------------------------------------ Splice --------------------------------------------------------

(deftest ^:parallel splice-preserves-untouched-siblings-test
  (let [ast {:type "doc" :content [(para "block one") (para "block two") (para "block three")]}
        ser (md/serialize ast)
        s   (str/index-of (:markdown ser) "two")
        out (md/splice ast ser s (+ s 3) "TWO")]
    (is (identical? (nth (:content ast) 0) (nth (:content out) 0)))
    (is (identical? (nth (:content ast) 2) (nth (:content out) 2)))
    (is (= "block TWO" (get-in out [:content 1 :content 0 :text])))
    (is (not= (get-in ast [:content 1 :attrs :_id])
              (get-in out [:content 1 :attrs :_id])))))

(deftest ^:parallel splice-descends-into-containers-test
  (let [ast {:type "doc"
             :content [{:type "resizeNode" :attrs {:height 300 :minHeight 280}
                        :content [{:type "flexContainer" :attrs {:columnWidths nil}
                                   :content [{:type "supportingText" :attrs {:_id "st"}
                                              :content [(para "inner one") (para "inner two")]}]}]}]}
        ser (md/serialize ast)
        s   (str/index-of (:markdown ser) "inner one")
        out (md/splice ast ser s (+ s 9) "INNER ONE")]
    (is (= "st" (get-in out [:content 0 :content 0 :content 0 :attrs :_id])))
    (is (identical? (get-in ast [:content 0 :content 0 :content 0 :content 1])
                    (get-in out [:content 0 :content 0 :content 0 :content 1])))))

(deftest ^:parallel splice-empty-result-floors-to-one-paragraph-test
  (let [ast (md/parse "hello world")
        ser (md/serialize ast)
        out (md/splice ast ser 0 11 "")]
    (is (= 1 (count (:content out))))
    (is (= "paragraph" (:type (first (:content out)))))
    (is (some? (get-in out [:content 0 :attrs :_id])))))

(deftest ^:parallel splice-stale-markdown-test
  (let [ast (md/parse "hello world")
        ser (md/serialize ast)]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"re-serialize"
                          (md/splice ast (update ser :markdown str "x") 0 1 "y")))))

(deftest ^:parallel splice-without-fast-path-keys-test
  (testing "a caller passing only :markdown gets the re-serialize fallback"
    (let [ast {:type "doc" :content [(para "alpha") (para "beta")]}
          {m :markdown} (md/serialize ast)
          s   (str/index-of m "beta")
          out (md/splice ast {:markdown m} s (+ s 4) "BETA")]
      (is (identical? (nth (:content ast) 0) (nth (:content out) 0)))
      (is (= "BETA" (get-in out [:content 1 :content 0 :text]))))))
