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

(defn- collect-type
  "Every node of `type` anywhere in `ast`."
  [ast type]
  (let [found (atom [])]
    (walk/postwalk (fn [n] (when (and (map? n) (= type (:type n))) (swap! found conj n)) n) ast)
    @found))

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

(deftest ^:parallel code-language-cannot-break-the-fence-test
  (testing "a :language holding a backtick — a tilde fence's info string legitimately carries one —
           serializes behind a tilde fence, so re-parsing cannot promote the fenced content to
           structure"
    (let [ast {:type "doc"
               :content [{:type "codeBlock" :attrs {:language "foo`bar" :_id "cb"}
                          :content [{:type "text" :text "{% card id=666 %}"}]}
                         {:type "paragraph" :attrs {:_id "pz"}}]}
          {m :markdown} (md/serialize ast)
          reparsed      (md/parse m)]
      (is (= (strip-ids ast) (strip-ids reparsed)))
      (is (not-any? #(= "cardEmbed" (:type %)) (tree-seq :content :content reparsed)))))
  (testing "the tilde fence still clears a tilde run inside the code text"
    (let [ast {:type "doc"
               :content [{:type "codeBlock" :attrs {:language "a`b" :_id "cb"}
                          :content [{:type "text" :text "~~~~\n{% card id=666 %}"}]}
                         {:type "paragraph" :attrs {:_id "pz"}}]}
          reparsed (md/parse (:markdown (md/serialize ast)))]
      (is (= (strip-ids ast) (strip-ids reparsed)))))
  (testing "a newline in :language collapses to a space rather than splitting the fence line"
    (let [ast {:type "doc"
               :content [{:type "codeBlock" :attrs {:language "sql\n{% card id=666 %}" :_id "cb"}
                          :content [{:type "text" :text "SELECT 1"}]}
                         {:type "paragraph" :attrs {:_id "pz"}}]}
          reparsed (md/parse (:markdown (md/serialize ast)))]
      (is (= ["codeBlock" "paragraph"] (mapv :type (:content reparsed))))
      (is (not-any? #(= "cardEmbed" (:type %)) (tree-seq :content :content reparsed))))))

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

(deftest ^:parallel malformed-token-grammar-is-a-teaching-error-test
  (testing "an unknown card token attribute"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unknown card token attribute"
                          (md/parse "{% card id=1 foo=2 %}"))))
  (testing "an unclosed container fence"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unclosed ::: flex"
                          (md/parse "::: flex\n{% card id=1 %}"))))
  (testing "an unknown container fence attribute"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unknown ::: resize attribute"
                          (md/parse "::: resize {bogus=1}\n{% card id=1 %}\n:::"))))
  (testing "flex columns that aren't a numeric array"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"numeric array"
                          (md/parse "::: flex {columns=abc}\n{% card id=1 %}\n:::")))))

;;; ------------------------------------------------ Container content models --------------------------------------

(deftest ^:parallel container-content-model-violations-are-teaching-errors-test
  (testing "a resize container wrapping prose"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resize container must wrap"
                          (md/parse "::: resize\nprose\n:::"))))
  (testing "a flex container holding a bare paragraph"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"flex container must hold"
                          (md/parse "::: flex\nsome prose\n:::"))))
  (testing "a flex container with four columns"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"flex container must hold"
                          (md/parse (str "::: flex\n"
                                         "{% card id=1 %}\n{% card id=2 %}\n{% card id=3 %}\n{% card id=4 %}\n"
                                         ":::")))))
  (testing "a supporting block holding a card embed"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"supporting block can only hold"
                          (md/parse "::: supporting\n{% card id=1 %}\n:::"))))
  (testing "a splice whose re-parse breaks the touched container's content model"
    (let [ast (md/parse "::: resize\n{% card id=118 %}\n:::")
          ser (md/serialize ast)
          i   (str/index-of (:markdown ser) "{% card id=118 %}")]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resize container must wrap"
                            (md/splice ast ser i (+ i (count "{% card id=118 %}")) "just prose"))))))

;;; ------------------------------------------------ Nesting depth -------------------------------------------------

(defn- deeply-nested-markdown
  "Markdown nested `n` levels deep by each structure whose conversion recurses. Every one of these
   overflowed the stack before a depth bound existed, at inputs as small as 8KB. Deep bullet lists
   are deliberately absent: past four columns CommonMark reads the indentation as a code block
   rather than a deeper list, so they cannot actually nest — and blockquotes already exercise the
   same `convert-block` recursion a list would."
  [n]
  {"container fences" (str (apply str (repeat n "::: flex\n")) (apply str (repeat n ":::\n")))
   "blockquotes"      (str (apply str (repeat n "> ")) "hi")
   ;; This one overflows inside flexmark itself, before any of our conversion runs, so only a
   ;; StackOverflowError backstop can turn it into an error response.
   "emphasis runs"    (str (apply str (repeat n "*")) "x" (apply str (repeat n "*")))})

(defn- parse-outcome
  "`:parsed`, or the ex-data of the teaching error, or `:stack-overflow`. Deliberately not
   `thrown-with-msg?`: a StackOverflowError is an Error rather than an ExceptionInfo, so it would
   sail straight through that assertion — the distinction between the two is the whole point here."
  [markdown]
  (try (md/parse markdown)
       :parsed
       (catch clojure.lang.ExceptionInfo e (assoc (ex-data e) ::message (ex-message e)))
       (catch StackOverflowError _ :stack-overflow)))

(deftest ^:parallel deep-nesting-is-a-teaching-error-not-a-stack-overflow-test
  (testing "input nested far past anything a document can express is refused with a 400 naming the
           problem. A StackOverflowError would be worse than a poor message: it is an Error, so it
           slips past the `catch Exception` that sanitizes every MCP tool failure and reaches the
           client as an unhandled 500. Note the exact depth at which the stack gives out shifts with
           the caller's own frame depth, so the bound — not the overflow — has to be what rejects
           these."
    (doseq [[label markdown] (deeply-nested-markdown 4000)]
      (testing label
        (let [outcome (parse-outcome markdown)]
          (is (= 400 (:status-code outcome))
              (format "%s should be a 400 teaching error, got %s" label (pr-str outcome)))
          ;; Without this the container case would pass on its content-model error alone, which
          ;; says nothing about whether a depth bound exists.
          (is (re-find #"(?i)nest|deep" (str (::message outcome)))
              (format "%s should name nesting depth as the problem, got %s"
                      label (pr-str (::message outcome)))))))))

(deftest ^:parallel legitimate-nesting-still-round-trips-test
  (testing "the bound sits far above anything a real document holds, so ordinary nesting is
           untouched. Layout containers are checked at their true maximum — resize > flex >
           supporting is as deep as the content model allows — rather than at an arbitrary depth,
           which would be rejected for violating the content model and prove nothing."
    (doseq [[label markdown] {"blockquotes"     (str (apply str (repeat 20 "> ")) "hi")
                              "emphasis runs"   (str (apply str (repeat 20 "*")) "x" (apply str (repeat 20 "*")))
                              "container stack" (str "::: resize {height=442 minHeight=280}\n"
                                                     "::: flex {columns=[60,40]}\n"
                                                     "::: supporting\nProse.\n:::\n"
                                                     "{% card id=1 %}\n:::\n:::")}]
      (testing label
        (let [ast (md/parse markdown)
              m1  (:markdown (md/serialize ast))]
          (is (seq (:content ast)))
          (is (= m1 (reserialize (md/parse m1)))))))))

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

(def ^:private token-lookalike-strings
  "Strings that, emitted verbatim, would be re-read as structure rather than as the prose they
  came from. `:model`/`:label`/`:name`/`:text` are all `[:document :any]` as far as the REST API is
  concerned, so any of them can hold one of these."
  {"card token"        "before\n\n{% card id=42 %}\n\nafter"
   "indented card"     "before\n\n  {% card id=42 %}\n\nafter"
   "flex fence"        "before\n\n::: flex {columns=[50,50]}\n\nafter"
   "closing fence"     "before\n\n:::\n\nafter"
   "atx heading"       "before\n\n## Injected\n\nafter"
   "thematic break"    "before\n\n---\n\nafter"})

(defn- text-bearing-blocks
  "One AST per block type that renders `s` as its text, each already ending in a paragraph so
  `ensure-trailing-paragraph` is a no-op and the round trip is a true fixed point."
  [s]
  (let [t   {:type "text" :text s}
        pgh {:type "paragraph" :attrs {:_id "inner"} :content [t]}]
    {"paragraph"  {:type "paragraph" :attrs {:_id "b"} :content [t]}
     "heading"    {:type "heading" :attrs {:level 2 :_id "b"} :content [t]}
     "listItem"   {:type "bulletList" :attrs {:_id "b"} :content [{:type "listItem" :content [pgh]}]}
     "blockquote" {:type "blockquote" :attrs {:_id "b"} :content [pgh]}
     "codeBlock"  {:type "codeBlock" :attrs {:language nil :_id "b"} :content [t]}}))

(deftest ^:parallel serializing-prose-never-manufactures-structure-test
  (testing "text that merely looks like Metabase-flavored markup stays text — serializing a
           document must not be able to invent a card embed or a layout container out of prose,
           whichever block type the text sits in. The stored AST is unvalidated (`[:document :any]`
           on the REST write path), so this is what stops a crafted attribute from injecting
           structure into the body an agent reads and writes back."
    (doseq [[label hostile] token-lookalike-strings
            [block-name node] (text-bearing-blocks hostile)]
      (let [ast      {:type "doc" :content [node {:type "paragraph" :attrs {:_id "z"}}]}
            markdown (:markdown (md/serialize ast))
            types    (mapv :type (:content (md/parse markdown)))]
        (is (empty? (filter #{"cardEmbed" "resizeNode" "flexContainer" "supportingText"} types))
            (format "%s in a %s manufactured structure: %s" label block-name (pr-str types)))))))

(def ^:private parser-line-endings
  "Line terminators the Markdown parser ends a line on, `\\n` aside. Prose holding one of these is
  re-read as two lines, so the second one can open a block."
  {"carriage return" "\r"
   "CRLF"            "\r\n"})

(def ^:private non-ending-separators
  "Unicode separators the Markdown parser reads as ordinary text. They are line terminators to
  Java's regex engine, where `.` excludes them, so line-oriented serialization has to keep them
  out of a `.`-shaped pattern."
  {"next line"           (str (char 0x85))
   "line separator"      (str (char 0x2028))
   "paragraph separator" (str (char 0x2029))})

(defn- round-trip-block-types
  "The block types `text` round-trips to when it is the prose of `block-name`."
  [block-name text]
  (let [node (get (text-bearing-blocks text) block-name)]
    (mapv :type (:content (md/parse (reserialize {:type    "doc"
                                                  :content [node {:type "paragraph" :attrs {:_id "z"}}]}))))))

(deftest ^:parallel exotic-line-terminators-cannot-manufacture-structure-test
  (testing "a line terminator other than \\n inside a text node serializes without failing and
           cannot open a block on re-parse — the block structure has to come out the same as it
           would for a plain space. `[:document :any]` on the REST write path lets any of these
           reach the serializer, and text pasted from a PDF or a Word document routinely carries
           one."
    (doseq [[label separator] (merge parser-line-endings non-ending-separators)
            block-name        (keys (text-bearing-blocks ""))]
      (let [types (round-trip-block-types block-name (str "before" separator "# Injected"))]
        (is (= (round-trip-block-types block-name "before # Injected") types)
            (format "%s in a %s changed the block structure: %s" label block-name (pr-str types)))))))

(defn- code-block-in
  "A document holding one code block whose text is `text`, nested in `container`."
  [container text]
  (let [code {:type "codeBlock" :attrs {:language nil :_id "code"} :content [{:type "text" :text text}]}]
    {:type    "doc"
     :content [(case container
                 "blockquote" {:type "blockquote" :attrs {:_id "b"} :content [code]}
                 "bulletList" {:type    "bulletList" :attrs {:_id "b"}
                               :content [{:type "listItem" :content [code]}]})
               {:type "paragraph" :attrs {:_id "z"}}]}))

(defn- code-block-texts
  "The text of every codeBlock in `ast`, however deeply nested."
  [ast]
  (->> (tree-seq :content :content ast)
       (filter #(= "codeBlock" (:type %)))
       (mapv #(apply str (map :text (:content %))))))

(deftest ^:parallel nested-code-block-survives-its-line-endings-test
  (testing "code block content is emitted raw — it is the one text the serializer must not escape
           — so the line prefixes a blockquote or list adds have to be applied per line the parser
           will see. Miss one and the closing fence lands outside the prefix, which does not merely
           render oddly: it re-opens as a new block, the code's tail leaks out as top-level prose,
           and `splice` writes that structure back to the document column on the next edit."
    (doseq [[label separator] parser-line-endings
            container         ["blockquote" "bulletList"]]
      (let [reparsed (md/parse (reserialize (code-block-in container (str "foo" separator "bar"))))]
        (testing "the code survives as one code block, its line endings normalized to \\n"
          (is (= ["foo\nbar"] (code-block-texts reparsed))
              (format "%s in a code block inside a %s" label container)))
        (testing "and the document is shaped exactly as the same code written with \\n"
          (is (= (strip-ids (:content (md/parse (reserialize (code-block-in container "foo\nbar")))))
                 (strip-ids (:content reparsed)))
              (format "%s in a code block inside a %s" label container)))))))

(deftest ^:parallel non-ending-separators-survive-round-trip-test
  (testing "a separator the parser reads as text stays in the prose verbatim — it is not a line
           boundary to the grammar, so nothing about it needs normalizing away. The prefixes are
           the ones that send the line down an escaping branch, where a pattern that stops at the
           separator would drop the rest of the line."
    (doseq [[label separator] non-ending-separators
            prefix            ["before" "1. before" "# before" "- before" "> before"]]
      (let [text (str prefix separator "after")
            ast  {:type "doc" :content [(para text) {:type "paragraph" :attrs {:_id "z"}}]}]
        (is (= text (get-in (md/parse (reserialize ast)) [:content 0 :content 0 :text]))
            (format "%s after %s did not survive the round trip" label (pr-str prefix)))))))

;;; ------------------------------------------------ HTML ---------------------------------------------------------

(def ^:private html-line-start-strings
  "Prose that opens a line with `<`. Emitted verbatim, each one is re-read as HTML rather than as
  the text it came from — and an HTML comment block converts to no nodes at all, so the prose is
  silently gone by the time the document is written back."
  {"html comment"         "<!-- secret note -->"
   "block-level tag"      "<div>hi</div>"
   "inline tag"           "<span>hi</span>"
   "declaration"          "<!DOCTYPE html>"
   "processing intruction" "<?php echo 1; ?>"
   "cdata"                "<![CDATA[x]]>"})

(deftest ^:parallel html-at-line-start-survives-round-trip-test
  (testing "text that begins with `<` stays text through serialize → parse. An HTML comment is the
           worst of these: `convert-block` maps `HtmlCommentBlock` to no nodes, so the paragraph
           comes back empty and the prose is lost with no error anywhere."
    (doseq [[label text] html-line-start-strings]
      (let [ast      {:type "doc" :content [(para text)]}
            reparsed (md/parse (reserialize ast))]
        (is (= text (get-in reparsed [:content 0 :content 0 :text]))
            (format "%s at paragraph start did not survive the round trip" label))
        (is (= (strip-ids (:content ast)) (strip-ids (:content reparsed)))
            (format "%s at paragraph start changed the document" label))))))

(deftest ^:parallel html-at-line-start-in-a-blockquote-keeps-its-content-test
  (testing "a container whose only child is prose starting with `<` still has children after the
           round trip — the editor's schema declares `block+`, so a blockquote that loses its
           paragraph is a document the editor cannot load"
    (doseq [[label text] html-line-start-strings]
      (let [ast      {:type    "doc"
                      :content [{:type "blockquote" :attrs {:_id "q"} :content [(para text)]}
                                {:type "paragraph" :attrs {:_id "z"}}]}
            quoted   (get-in (md/parse (reserialize ast)) [:content 0])]
        (is (= "blockquote" (:type quoted))
            (format "%s in a blockquote changed the block type" label))
        (is (seq (:content quoted))
            (format "%s in a blockquote left the container with no :content" label))
        (is (= text (get-in quoted [:content 0 :content 0 :text]))
            (format "%s in a blockquote did not survive the round trip" label))))))

(deftest ^:parallel html-mid-paragraph-survives-round-trip-test
  (testing "a `<` that is not at the start of a line needs no escape and still round-trips — the
           escape is line-start only, so it must not fire mid-prose"
    (doseq [[label html] html-line-start-strings]
      (let [text     (str "before " html " after")
            ast      {:type "doc" :content [(para text)]}
            {m :markdown} (md/serialize ast)]
        (is (= text (get-in (md/parse m) [:content 0 :content 0 :text]))
            (format "%s mid-paragraph did not survive the round trip" label))
        (is (not (str/includes? m "\\<"))
            (format "%s mid-paragraph was escaped: %s" label (pr-str m)))))))

(def ^:private childless-container-types
  "Node types the editor's schema will not accept without children: `blockquote`, `listItem` and
  `supportingText` hold blocks, the lists hold list items, and the layout containers hold one to
  three of theirs."
  #{"blockquote" "listItem" "bulletList" "orderedList" "supportingText" "flexContainer" "resizeNode"})

(defn- contentless-containers
  "The types of every node in `ast` that must have children and came back with none."
  [ast]
  (->> (tree-seq :content :content ast)
       (filter #(and (childless-container-types (:type %)) (empty? (:content %))))
       (mapv :type)))

(def ^:private nothing-to-show-markdown
  "Markdown whose container ends up holding nothing a document can render: an HTML comment converts
  to no nodes at all, and a bare `>` or `-` never had a child to begin with. The serializer escapes
  a line-start `<` so it never writes the first shape, but `document_write` takes `content_markdown`
  straight from the agent, so all of these reach `parse` anyway."
  {"blockquote holding only a comment"   "> <!-- secret note -->"
   "bullet item holding only a comment"  "- <!-- secret note -->"
   "ordered item holding only a comment" "1. <!-- secret note -->"
   "blockquote with no children"         ">"
   "bullet item with no children"        "-"})

(deftest ^:parallel container-with-nothing-to-show-is-dropped-test
  (testing "a container whose children all convert to nothing is dropped rather than emitted empty.
           The editor's content model requires children, so a container without them is a document
           body that cannot be loaded at all — the write succeeds and the document never opens."
    (doseq [[label markdown] nothing-to-show-markdown]
      (let [ast (md/parse markdown)]
        (is (= [] (contentless-containers ast))
            (format "%s produced a container with no :content" label))
        (is (= ["paragraph"] (mapv :type (:content ast)))
            (format "%s left more than the trailing paragraph behind: %s" label (pr-str (:content ast))))))))

(deftest ^:parallel comment-in-a-list-costs-only-its-own-item-test
  (testing "an item holding only a comment leaves the list — and the items around it — alone"
    (let [ast (md/parse "- a\n- <!-- secret note -->\n- c")]
      (is (= [] (contentless-containers ast)))
      (is (= ["bulletList" "paragraph"] (mapv :type (:content ast))))
      (is (= [["a"] ["c"]]
             (for [item (get-in ast [:content 0 :content])]
               (mapv #(get-in % [:content 0 :text]) (:content item))))))))

(deftest ^:parallel comment-beside-prose-keeps-the-prose-and-the-container-test
  (testing "a comment accompanied by real content costs that content nothing — the container stays
           and keeps its structure, with only the comment gone"
    (doseq [[label markdown] {"blockquote" "> <!-- secret note -->\n> real prose"
                              "list item"  "- <!-- secret note -->\n\n  real prose"}]
      (let [ast       (md/parse markdown)
            container (get-in ast [:content 0])]
        (is (= [] (contentless-containers ast)) label)
        (is (= (if (= "blockquote" label) "blockquote" "bulletList") (:type container)) label)
        (is (= ["real prose"]
               (->> (tree-seq :content :content container)
                    (filter #(= "paragraph" (:type %)))
                    (map #(get-in % [:content 0 :text]))))
            (format "%s lost the prose beside the comment: %s" label (pr-str container)))))))

;;; ------------------------------------------------ Tables -------------------------------------------------------

(def ^:private table-markdown
  "A GFM pipe table. The editor's schema has no table node, so this can only ever come back as
  prose — but every row is its own line, and a paragraph joins its lines with a space, so without
  help the whole grid collapses onto one line and stops being readable as a table at all."
  (str "| Region | Revenue |\n"
       "| --- | --- |\n"
       "| EMEA | 12 |\n"
       "| APAC | 9 |"))

(def ^:private table-rows
  ["| Region | Revenue |" "| --- | --- |" "| EMEA | 12 |" "| APAC | 9 |"])

(defn- block-lines
  "The text of each line of a block node, split at its `hardBreak`s."
  [node]
  (reduce (fn [lines {:keys [type text]}]
            (if (= "hardBreak" type)
              (conj lines "")
              (update lines (dec (count lines)) str text)))
          [""]
          (:content node)))

(deftest ^:parallel table-rows-keep-their-own-lines-test
  (testing "a table parses to one paragraph per table, with a line break between rows. LLM agents
           emit tables constantly and the rows arrive separated by soft line breaks, which convert
           to spaces — the pipes survive but the grid does not, so what comes back is one run-on
           line no reader can recover the table from."
    (is (= table-rows (block-lines (first (:content (md/parse table-markdown)))))))
  (testing "a line of prose ahead of the table is a line of the same paragraph and keeps its break too"
    (is (= (into ["Quarterly numbers:"] table-rows)
           (block-lines (first (:content (md/parse (str "Quarterly numbers:\n" table-markdown)))))))))

(deftest ^:parallel table-survives-round-trip-test
  (testing "serialize → parse is a fixed point on a table, and the Markdown written back still has
           one row per line — a document read after a write has to show the agent the table it sent"
    (let [ast      (md/parse table-markdown)
          markdown (reserialize ast)
          lines    (str/split-lines markdown)]
      (is (= 4 (count lines))
          (format "table did not serialize one row per line: %s" (pr-str markdown)))
      (is (every? #(str/starts-with? % "|") lines)
          (format "a serialized table row lost its leading pipe: %s" (pr-str markdown)))
      (is (= (strip-ids (:content ast)) (strip-ids (:content (md/parse markdown))))
          (format "table round trip changed the document: %s" (pr-str markdown))))))

(deftest ^:parallel table-in-a-container-keeps-its-rows-test
  (testing "a table nested in a blockquote or a list item keeps its rows, and the line prefixes the
           serializer adds are applied to every line the parser will see"
    (doseq [[label markdown] {"blockquote" (str/join "\n" (map #(str "> " %) table-rows))
                              "list item"  (str "- " (str/join "\n  " table-rows))}]
      (let [reparsed (md/parse (reserialize (md/parse markdown)))
            table    (->> (tree-seq :content :content reparsed)
                          (filter #(= "paragraph" (:type %)))
                          (some #(when (seq (:content %)) %)))]
        (is (= table-rows (block-lines table))
            (format "table in a %s did not survive the round trip" label))))))

(deftest ^:parallel wrapped-prose-still-joins-its-lines-test
  (testing "an ordinary soft-wrapped paragraph is not a table and keeps CommonMark's behavior — its
           lines join with a space and no hard break is invented for them"
    (is (= ["one two three"] (block-lines (first (:content (md/parse "one\ntwo\nthree"))))))
    (is (not (str/includes? (reserialize (md/parse "one\ntwo\nthree")) "\\"))))
  (testing "a run of pipes that is not a table — no delimiter row — is prose too"
    (is (= ["a | b c | d"] (block-lines (first (:content (md/parse "a | b\nc | d"))))))))

;;; -------------------------------------------- Reference links --------------------------------------------------

(def ^:private reference-link-markdown
  (str "See [the docs][d] and [d] for more.\n"
       "\n"
       "[d]: https://example.com/docs"))

(defn- link-hrefs
  [ast]
  (->> (tree-seq :content :content ast)
       (mapcat :marks)
       (keep #(when (= "link" (:type %)) (get-in % [:attrs :href])))
       vec))

(deftest ^:parallel reference-link-keeps-its-url-test
  (testing "a reference link resolves to a link mark carrying the definition's URL. `LinkRef` has no
           branch of its own, so it used to fall through to its source text and the URL — which
           lives in a separate definition block that converts to nothing — was gone from the
           document with nothing to recover it from."
    (let [ast (md/parse reference-link-markdown)]
      (is (= ["https://example.com/docs" "https://example.com/docs"] (link-hrefs ast)))
      (is (= ["See the docs and d for more."] (block-lines (first (:content ast))))))))

(deftest ^:parallel reference-link-survives-round-trip-test
  (testing "the resolved link round-trips as an inline link — the definition it came from is
           consumed, so the second pass has nothing left to resolve"
    (let [ast      (md/parse reference-link-markdown)
          markdown (reserialize ast)]
      (is (str/includes? markdown "https://example.com/docs")
          (format "the URL is not in the serialized document: %s" (pr-str markdown)))
      (is (= (strip-ids (:content ast)) (strip-ids (:content (md/parse markdown))))
          (format "reference link round trip changed the document: %s" (pr-str markdown))))))

(deftest ^:parallel undefined-reference-link-stays-text-test
  (testing "a reference with no definition is not a link — CommonMark leaves it as literal text, and
           so does the round trip"
    (let [ast (md/parse "See [the docs][missing] for more.")]
      (is (= [] (link-hrefs ast)))
      (is (= "See [the docs][missing] for more."
             (get-in (md/parse (reserialize ast)) [:content 0 :content 0 :text]))))))

(deftest ^:parallel unused-reference-definition-keeps-its-url-test
  (testing "a definition no link consumed still holds a URL a reader can use, so it stays as prose
           rather than converting to nothing"
    (let [ast (md/parse "[d]: https://example.com/docs")]
      (is (= ["[d]: https://example.com/docs"] (block-lines (first (:content ast)))))
      (testing "and its text survives the round trip. Not an AST fixed point: the URL is bare prose
               now, so the second pass gives it the autolink mark any prose URL gets."
        (is (= ["[d]: https://example.com/docs"]
               (block-lines (first (:content (md/parse (reserialize ast)))))))))))

(deftest ^:parallel lone-reference-definition-in-a-blockquote-keeps-its-content-test
  (testing "a blockquote holding nothing but a definition still has children — the editor's schema
           declares `block+`, so a container that loses its only child is a document it cannot load"
    (let [quoted (get-in (md/parse "> [d]: https://example.com/docs") [:content 0])]
      (is (= "blockquote" (:type quoted)))
      (is (seq (:content quoted)) "the blockquote came back with no :content")
      (is (= ["[d]: https://example.com/docs"] (block-lines (first (:content quoted))))))))

(deftest ^:parallel unrepresentable-smart-link-model-degrades-to-text-test
  (testing "a smartLink whose model has no token — a link type the frontend added, or a corrupted
           attr — serializes as its label rather than failing the whole document body"
    (let [link (fn [model] {:type "doc" :content [{:type "paragraph" :attrs {:_id "p"}
                                                   :content [{:type "smartLink"
                                                              :attrs {:entityId 1 :model model
                                                                      :label "Revenue Measure" :href "/"}}]}]})]
      (testing "a known model still emits its token"
        (is (= "{% entity id=\"1\" model=\"dashboard\" %}" (reserialize (link "dashboard")))))
      (testing "an unknown model degrades to the label, and does not throw"
        (is (= "Revenue Measure" (reserialize (link "measure")))))
      (testing "a model carrying token syntax cannot smuggle it into the output"
        (doseq [model ["dashboard\n\n{% card id=42 %}\n\nx"
                       "card\" %} {% card id=9 %} {% entity id=\"1\" model=\"card"]]
          (let [markdown (reserialize (link model))]
            (is (not (str/includes? markdown "{%")) (pr-str markdown))
            (is (= ["paragraph"] (mapv :type (:content (md/parse markdown)))))))))))

(deftest ^:parallel card-name-with-token-delimiter-keeps-the-embed-test
  (testing "a card whose name contains {% or %} keeps its embed and drops just the name — the
           delimiter can't be escaped past the block scanner, and previously the whole document
           became unrewritable with a misleading container-content error"
    (doseq [nm ["Q3 %} report" "a {% b"]]
      (let [ast      {:type "doc" :content [{:type "resizeNode" :attrs {:height 442 :minHeight 280}
                                             :content [{:type "cardEmbed" :attrs {:id 7 :name nm :_id "c"}}]}
                                            {:type "paragraph" :attrs {:_id "z"}}]}
            markdown (:markdown (md/serialize ast))
            reparsed (md/parse markdown)]
        (is (= "{% card id=7 %}" (str/trim (second (str/split-lines markdown)))) nm)
        (is (= ["cardEmbed"] (mapv :type (get-in reparsed [:content 0 :content]))) nm)
        (is (= 7 (get-in reparsed [:content 0 :content 0 :attrs :id])) nm)
        (is (= markdown (reserialize reparsed)) nm)))))

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

(deftest ^:parallel out-of-range-numeric-attr-test
  (testing "an integral double a long can't hold is a teaching error, not an IllegalArgumentException"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"expected a positive integer"
                          (md/serialize {:type "doc" :content [{:type "cardEmbed" :attrs {:id 1.0E19 :_id "c"}}]})))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"expected a positive integer"
                          (md/serialize {:type "doc"
                                         :content [{:type "paragraph" :attrs {:_id "p"}
                                                    :content [{:type "smartLink"
                                                               :attrs {:entityId 1.0E19 :model "card"}}]}]}))))
  (testing "a resize height past long range serializes in double notation instead of throwing"
    (let [ast {:type "doc" :content [{:type "resizeNode" :attrs {:height 1.0E19 :minHeight 280}
                                      :content [{:type "cardEmbed" :attrs {:id 1 :_id "c"}}]}]}]
      (is (str/includes? (:markdown (md/serialize ast)) "height=1.0E19")))))

;;; ------------------------------------------------ Smart links ---------------------------------------------------

(deftest ^:parallel unresolved-smart-link-defaults-test
  (testing "an entity token whose id doesn't resolve keeps the node with default label/href"
    (let [reparsed (md/parse "x {% entity id=\"987654321\" model=\"dashboard\" %} y")]
      (is (= {:entityId 987654321 :model "dashboard" :label nil :href "/"}
             (get-in reparsed [:content 0 :content 1 :attrs]))))))

(defn- smart-links-in
  [ast]
  (filter #(= "smartLink" (:type %)) (tree-seq :content :content ast)))

(deftest ^:parallel entity-token-guards-test
  (testing "an entity token inside an inline code span stays literal code text"
    (let [reparsed (md/parse "use `{% entity id=\"1\" model=\"card\" %}` here")
          code     (some #(when (some (comp #{"code"} :type) (:marks %)) %)
                         (tree-seq :content :content reparsed))]
      (is (empty? (smart-links-in reparsed)))
      (is (= "{% entity id=\"1\" model=\"card\" %}" (:text code)))))
  (testing "an entity token with a model this grammar has no node for stays prose"
    (is (empty? (smart-links-in (md/parse "{% entity id=\"1\" model=\"bogus\" %} x")))))
  (testing "an entity token with a non-positive id stays prose"
    (is (empty? (smart-links-in (md/parse "{% entity id=\"0\" model=\"card\" %} x"))))))

;;; ------------------------------------------------ Splice --------------------------------------------------------

(defn- splice-replacing
  "Splice `old-text` -> `new-text` in the serialization of `markdown-src`, returning the resulting
   top-level node types and re-serialized body."
  [markdown-src old-text new-text]
  (let [ast (md/parse markdown-src)
        ser (md/serialize ast)
        i   (str/index-of (:markdown ser) old-text)
        out (md/splice ast ser i (+ i (count old-text)) new-text)]
    [(mapv :type (:content out)) (reserialize out)]))

(deftest ^:parallel splice-can-convert-a-block-to-another-type-test
  (testing "an edit that turns a block into a different type must work. `convertible-block-types`
           deliberately lets a paragraph pair with a bulletList or blockquote so the block keeps its
           `:_id` and its comment anchors, but a paragraph's `:content` is inline while a list's is
           blocks — reconciling ids down both at once fed text nodes to a block renderer and blew up
           with `Cannot serialize unknown block node type \"text\"`. \"Turn this into a bulleted
           list\" is an everyday edit, and it failed for every target type whose content is blocks."
    (doseq [[label src old-text new-text expected-types]
            [["paragraph to bullet list, following an existing list"
              "- a\n- b\n\nplain para\n\ntail" "plain para" "- converted" ["bulletList" "bulletList" "paragraph"]]
             ["paragraph to bullet list on its own"
              "intro\n\nplain para\n\ntail" "plain para" "- converted" ["paragraph" "bulletList" "paragraph"]]
             ["paragraph to blockquote"
              "intro\n\nplain para\n\ntail" "plain para" "> quoted" ["paragraph" "blockquote" "paragraph"]]
             ;; This direction always worked — heading content is inline, like a paragraph's — so it
             ;; pins that the fix did not narrow what already converted.
             ["paragraph to heading"
              "intro\n\nplain para\n\ntail" "plain para" "## Heading" ["paragraph" "heading" "paragraph"]]
             ["blockquote back to a paragraph"
              "intro\n\n> quoted\n\ntail" "> quoted" "now plain" ["paragraph" "paragraph" "paragraph"]]
             ["list back to a paragraph"
              "- a\n- b\n\ntail" "- a\n- b" "now plain" ["paragraph" "paragraph"]]]]
      (testing label
        (is (= expected-types (first (splice-replacing src old-text new-text))))))))

(deftest ^:parallel splice-leaves-earlier-siblings-byte-identical-test
  (testing "splicing a block cannot disturb the serialized text before it — untouched siblings are
           reused by identity and serialization is deterministic. Worth pinning because the
           same-type-list separator (`<!-- -->`) is emitted between blocks, so a converted block can
           change a separator; that stays safe only because the longer separator extends \"\\n\\n\"
           rather than replacing it."
    (doseq [[label src old-text new-text]
            [["plain edit"            "alpha\n\nbeta\n\ngamma" "gamma" "GAMMA"]
             ["separator-changing"    "- a\n- b\n\nplain para\n\ntail" "plain para" "- converted"]
             ["inside a blockquote"   "intro\n\n> quoted text\n\ntail" "quoted text" "changed text"]
             ["block removed"         "one\n\ntwo\n\nthree" "two" ""]]]
      (testing label
        (let [before (:markdown (md/serialize (md/parse src)))
              i      (str/index-of before old-text)
              after  (second (splice-replacing src old-text new-text))]
          (is (= (subs before 0 i) (subs after 0 (min i (count after))))))))))

(deftest ^:parallel splice-preserves-untouched-siblings-test
  (let [ast {:type "doc" :content [(para "block one") (para "block two") (para "block three")]}
        ser (md/serialize ast)
        s   (str/index-of (:markdown ser) "two")
        out (md/splice ast ser s (+ s 3) "TWO")]
    (is (identical? (nth (:content ast) 0) (nth (:content out) 0)))
    (is (identical? (nth (:content ast) 2) (nth (:content out) 2)))
    (is (= "block TWO" (get-in out [:content 1 :content 0 :text])))
    (testing "the rewritten block keeps its node id, so comments anchored to it stay anchored"
      (is (= (get-in ast [:content 1 :attrs :_id])
             (get-in out [:content 1 :attrs :_id]))))))

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

(deftest ^:parallel splice-deep-replacement-is-a-teaching-error-test
  (testing "the replacement text re-parses behind the same StackOverflowError backstop [[md/parse]]
           has — a raw Error would sail past the `catch Exception` that sanitizes tool failures"
    (let [ast (md/parse "alpha\n\nomega")
          ser (md/serialize ast)
          i   (str/index-of (:markdown ser) "omega")]
      (doseq [[label replacement] (deeply-nested-markdown 4000)]
        (testing label
          (let [outcome (try (md/splice ast ser i (+ i (count "omega")) replacement)
                             :spliced
                             (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))
                             (catch StackOverflowError _ :stack-overflow))]
            (is (= 400 outcome)
                (format "%s should be a 400 teaching error, got %s" label (pr-str outcome)))))))))

(deftest ^:parallel splice-span-bounds-test
  (testing "an out-of-range or non-int span is a teaching error, not a StringIndexOutOfBoundsException"
    (let [ast (md/parse "alpha")
          ser (md/serialize ast)
          n   (count (:markdown ser))]
      (doseq [[s e] [[-1 1] [2 1] [0 (inc n)] [nil 1] [0.5 1]]]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid splice span"
                              (md/splice ast ser s e "x")))))))

(deftest ^:parallel splice-insertion-between-blocks-test
  (testing "a pure insertion (start = end) inside the separator between two blocks parses the
           replacement alone and reuses both neighbours by identity"
    (let [ast (md/parse "alpha\n\nomega")
          ser (md/serialize ast)
          pos (dec (str/index-of (:markdown ser) "omega"))
          out (md/splice ast ser pos pos "middle")]
      (is (= [["paragraph" "alpha"] ["paragraph" "middle"] ["paragraph" "omega"]]
             (mapv (juxt :type #(get-in % [:content 0 :text])) (:content out))))
      (is (identical? (nth (:content ast) 0) (nth (:content out) 0)))
      (is (identical? (nth (:content ast) 1) (nth (:content out) 2))))))

(deftest ^:parallel splice-separator-only-span-test
  (testing "a span confined to the separator between two blocks re-parses both neighbours; a
           replacement that joins them merges into one block keeping the head block's id"
    (let [ast (md/parse "alpha\n\nomega")
          ser (md/serialize ast)
          s   (str/index-of (:markdown ser) "\n\n")
          out (md/splice ast ser s (+ s 2) " ")]
      (is (= 1 (count (remove #(empty? (:content %)) (:content out)))))
      (is (= "alpha omega" (get-in out [:content 0 :content 0 :text])))
      (is (= (get-in ast [:content 0 :attrs :_id]) (get-in out [:content 0 :attrs :_id])))))
  (testing "deleting the separator outright merges the blocks the same way"
    (let [ast (md/parse "alpha\n\nomega")
          ser (md/serialize ast)
          s   (str/index-of (:markdown ser) "\n\n")
          out (md/splice ast ser s (+ s 2) "")]
      (is (= "alphaomega" (get-in out [:content 0 :content 0 :text]))))))

(deftest ^:parallel splice-stale-markdown-test
  (let [ast (md/parse "hello world")
        ser (md/serialize ast)]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"re-serialize"
                          (md/splice ast (update ser :markdown str "x") 0 1 "y")))))

;;; --------------------------------------------- Node reconciliation ----------------------------------------------

(defn- ids-of
  "Every `:_id` in the ast, mapped to the type and leading text of the node carrying it."
  [ast]
  (into {} (for [n     (tree-seq :content :content ast)
                 :let  [id (get-in n [:attrs :_id])]
                 :when id]
             [id [(:type n) (some :text (:content n))]])))

(defn- edit-text
  "Splice the first occurrence of `old` in the ast's Markdown to `new`."
  [ast old new]
  (let [ser (md/serialize ast)
        i   (str/index-of (:markdown ser) old)]
    (md/splice ast ser i (+ i (count old)) new)))

(deftest ^:parallel splice-keeps-ids-of-edited-blocks-test
  (testing "editing a block's text leaves every node id in the document intact"
    (let [ast (md/parse "## Heading\n\nEdit me please.\n\nLeave me alone.")
          out (edit-text ast "Edit me please." "Edited!")]
      (is (= (set (keys (ids-of ast))) (set (keys (ids-of out)))))))
  (testing "ids nested inside blockquotes and lists survive too"
    (let [ast (md/parse "> quoted text\n\n- alpha\n- beta\n\nplain")
          out (edit-text ast "alpha" "ALPHA")]
      (is (= (set (keys (ids-of ast))) (set (keys (ids-of out)))))))
  (testing "a sweep touching every block keeps every id"
    (let [ast   (md/parse "# Unit DS-7\n\nDS-7 did not sleep.\n\n> DS-7 wrote a memo.\n\n- DS-7 alpha\n- untouched\n\nDS-7 logged it.")
          out   (loop [a ast]
                  (let [ser (md/serialize a)
                        i   (str/last-index-of (:markdown ser) "DS-7")]
                    (if i (recur (md/splice a ser i (+ i 4) "DS-10")) a)))]
      (is (= (set (keys (ids-of ast))) (set (keys (ids-of out)))))
      (is (not (str/includes? (:markdown (md/serialize out)) "DS-7"))))))

(deftest ^:parallel splice-id-reconciliation-follows-editor-semantics-test
  (testing "a split leaves the id on the first of the two halves, as the editor's node-id plugin does"
    (let [ast (md/parse "one two three")
          out (edit-text ast "two" "two\n\nsplit")]
      (is (= 2 (count (:content out))))
      (is (= (get-in ast [:content 0 :attrs :_id]) (get-in out [:content 0 :attrs :_id])))
      (is (not= (get-in ast [:content 0 :attrs :_id]) (get-in out [:content 1 :attrs :_id])))))
  (testing "a merge keeps the head block's id and drops the tail's"
    (let [ast (md/parse "head block\n\ntail block")
          out (edit-text ast "head block\n\ntail block" "head block tail block")]
      (is (= (get-in ast [:content 0 :attrs :_id]) (get-in out [:content 0 :attrs :_id])))
      (is (not (contains? (ids-of out) (get-in ast [:content 1 :attrs :_id]))))))
  (testing "converting a paragraph to a heading keeps the id, matching setNode in the editor"
    (let [ast (md/parse "Some title")
          out (edit-text ast "Some title" "## Some title")]
      (is (= "heading" (get-in out [:content 0 :type])))
      (is (= (get-in ast [:content 0 :attrs :_id]) (get-in out [:content 0 :attrs :_id])))))
  (testing "a deleted block's id is dropped rather than handed to a surviving neighbour"
    (let [ast   (md/parse "alpha\n\nbeta\n\ngamma")
          alpha (get-in ast [:content 0 :attrs :_id])
          beta  (get-in ast [:content 1 :attrs :_id])
          out   (edit-text ast "alpha\n\nbeta" "beta")]
      (is (= "beta" (get-in out [:content 0 :content 0 :text])))
      (is (= beta (get-in out [:content 0 :attrs :_id])))
      (is (not (contains? (ids-of out) alpha)))))
  (testing "a card embed never donates its id to prose that replaces it"
    (let [ast  (md/parse "::: flex\n{% card id=118 %}\n::: supporting\nwords\n:::\n:::")
          card (some #(when (= "cardEmbed" (:type %)) (get-in % [:attrs :_id]))
                     (tree-seq :content :content ast))
          out  (edit-text ast "{% card id=118 %}" "::: supporting\njust words now\n:::")]
      (is (some? card))
      (is (not (contains? (ids-of out) card))))))

(deftest ^:parallel splice-without-fast-path-keys-test
  (testing "a caller passing only :markdown gets the re-serialize fallback"
    (let [ast {:type "doc" :content [(para "alpha") (para "beta")]}
          {m :markdown} (md/serialize ast)
          s   (str/index-of m "beta")
          out (md/splice ast {:markdown m} s (+ s 4) "BETA")]
      (is (identical? (nth (:content ast) 0) (nth (:content out) 0)))
      (is (= "BETA" (get-in out [:content 1 :content 0 :text]))))))

(deftest ^:parallel code-fence-behind-list-marker-is-opaque-test
  (testing "a fence opening on a list item's marker line still makes its content code, so token
           syntax inside it stays text instead of being read as structure"
    (doseq [src ["- ```\n  {% card id=99 %}\n  ```\n"
                 "1. ```\n   {% card id=99 %}\n   ```\n"
                 "* ```\n  {% card id=99 %}\n  ```\n"]]
      (testing (pr-str src)
        (is (empty? (collect-type (md/parse src) "cardEmbed"))))))
  (testing "a card token outside any fence is still a real embed"
    (is (= 1 (count (collect-type (md/parse "{% card id=99 %}\n")
                                  "cardEmbed"))))))

(deftest ^:parallel splice-keeps-untokenized-card-attrs-test
  (testing "re-parsing a card embed keeps the attrs its token does not carry -- child_target_id
           anchors comments and the rest is user-visible visualization state"
    (let [card {:type "cardEmbed"
                :attrs {:id 7 :name "Chart" :_id "c1" :stored_result_id 42 :sort "asc"
                        :chart_href "/q/7" :child_target_id "anchor-9" :host_data {:k "v"}}}
          ast  {:type "doc" :content [(para "intro") card]}
          ser  (md/serialize ast)
          s    (str/index-of (:markdown ser) "\n\n")
          out  (md/splice ast ser s (+ s 2) "\n\n\n")
          out-card (first (collect-type out "cardEmbed"))]
      (is (= (:attrs card) (:attrs out-card)))))
  (testing "a freshly parsed value still wins over the carried one, so retargeting a card works"
    (let [card {:type "cardEmbed"
                :attrs {:id 7 :name "Chart" :_id "c1" :stored_result_id 42 :child_target_id "anchor-9"}}
          ast  {:type "doc" :content [(para "intro") card]}
          ser  (md/serialize ast)
          m    (:markdown ser)
          s    (str/index-of m "{%")
          out  (md/splice ast ser s (count m) "{% card id=1234 name=\"Other\" %}")
          out-card (first (collect-type out "cardEmbed"))]
      (is (= 1234 (get-in out-card [:attrs :id])))
      (is (= "Other" (get-in out-card [:attrs :name])))
      (is (= "anchor-9" (get-in out-card [:attrs :child_target_id]))))))

(deftest ^:parallel lone-cr-cannot-manufacture-a-card-embed-test
  (testing "the scanner and the parser have to agree on where a line begins. `str/split-lines`
           breaks on \\r?\\n and leaves a lone CR sitting inside the line it returns, but the parser
           ends the line there — so a CR in a code fence's info line hides the fence from the
           scanner while the parser still opens one, and a `{% card %}` the author fenced as code
           is promoted to a real embed: a permission-scoped read of a card they never referenced."
    (doseq [[label separator] parser-line-endings]
      (let [fenced (str "```sql" separator "SELECT 1\n{% card id=999 %}\n```")]
        (is (empty? (collect-type (md/parse fenced) "cardEmbed"))
            (format "%s in a code fence info line manufactured a card embed" label))))))

(deftest ^:parallel tab-indented-token-is-code-not-structure-test
  (testing "a tab advances to the next 4-column tab stop, so a leading tab indents to column 4 and
           opens an indented code block. The token and fence regexes bound their indent by
           character count, which reads that same tab as one column of indent — the scanner
           promotes to structure exactly what the parser reads as content."
    (doseq [[label line] {"a tab"            (str \tab "{% card id=118 %}")
                          "a space and tab"  (str \space \tab "{% card id=118 %}")
                          "four spaces"      "    {% card id=118 %}"}]
      (is (empty? (collect-type (md/parse line) "cardEmbed"))
          (format "%s before a card token manufactured a card embed" label)))
    (testing "and a container fence indented the same way is code too"
      (is (empty? (collect-type (md/parse (str \tab "::: flex\n" \tab "{% card id=1 %}\n" \tab ":::"))
                                "cardEmbed"))))
    (testing "while a token indented within the parser's 3-column budget is still structure"
      (is (= [7] (mapv #(get-in % [:attrs :id])
                       (collect-type (md/parse "   {% card id=7 %}") "cardEmbed")))))
    (testing "and a blank line separates blocks however wide its whitespace — measuring the indent
             must not turn one into a code block"
      (doseq [[label blank] {"four spaces"  "    "
                             "eight spaces" "        "
                             "one tab"      "\t"
                             "two tabs"     "\t\t"}]
        (is (= (strip-ids (:content (md/parse "para one\n\npara two")))
               (strip-ids (:content (md/parse (str "para one\n" blank "\npara two")))))
            (format "a blank line parsed differently from an empty one: %s" label))))))

(deftest ^:parallel indented-code-line?-measures-the-first-content-column-test
  (testing "a line is indented code when its first non-whitespace character sits at column 4 or
           later, counting a tab to the next 4-column stop"
    (are [expected line] (= expected (#'md/indented-code-line? line))
      true  "    x"
      true  "\tx"
      true  " \tx"
      true  "     x"
      false "   x"
      false "x"))
  (testing "a whitespace-only line is blank however wide — it separates blocks rather than opening
           a code block, so the column test must run on a content character, not on entry"
    (are [line] (false? (#'md/indented-code-line? line))
      ""
      "   "
      "    "
      "        "
      "\t"
      "\t\t")))
