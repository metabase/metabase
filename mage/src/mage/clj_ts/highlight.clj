(ns mage.clj-ts.highlight
  "Tiny syntax highlighters for the TypeScript view's output and for Clojure. They run over a whole file (so
  multi-line comments and SQL templates are colored correctly) and return one HTML string per line."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn escape
  "HTML-escape `s`."
  [s]
  (-> (str s) (str/replace "&" "&amp;") (str/replace "<" "&lt;") (str/replace ">" "&gt;")))

(defn- tokens->lines
  "Split [class text] tokens into per-line HTML."
  [tokens]
  (let [html (fn [[cls text]] (if cls (str "<span class=\"" cls "\">" (escape text) "</span>") (escape text)))]
    (loop [tokens tokens, line (StringBuilder.), acc []]
      (if-let [[cls ^String text] (first tokens)]
        (let [parts (str/split text #"\n" -1)]
          (if (= 1 (count parts))
            (recur (rest tokens) (.append line ^String (html [cls text])) acc)
            (let [first-line (.toString (.append line ^String (html [cls (first parts)])))
                  middle     (map #(html [cls %]) (butlast (rest parts)))]
              (recur (rest tokens)
                     (StringBuilder. ^String (html [cls (last parts)]))
                     (-> acc (conj first-line) (into middle))))))
        (conj acc (.toString line))))))

(def ^:private combined-pattern
  "One alternation regex for a rule set, with a named group per rule, so a single `find` locates the next token."
  (memoize
   (fn [rules]
     (java.util.regex.Pattern/compile
      (str/join "|" (map-indexed (fn [i [^java.util.regex.Pattern re _]] (str "(?<g" i ">" (.pattern re) ")")) rules))))))

(defn- scan
  "Tokenize `s` with `rules` (a seq of [regex class-or-fn]), producing [class text] tokens; text between matches is
  unclassified. Earlier rules win when several match at the same position. A rule's class may be a function of the
  match returning a seq of tokens."
  [^String s rules]
  (let [^java.util.regex.Matcher mt (.matcher ^java.util.regex.Pattern (combined-pattern rules) s)
        n (count rules)]
    (loop [pos 0, acc (transient [])]
      (if (and (< pos (count s)) (.find mt pos))
        (let [start (.start mt)
              m     (.group mt)
              i     (first (filter #(.group mt (str "g" %)) (range n)))
              cls   (second (nth rules i))
              acc   (cond-> acc (> start pos) (conj! [nil (subs s pos start)]))
              toks  (if (fn? cls) (cls m) [[cls m]])
              end   (max (.end mt) (inc start))]
          (recur end (reduce conj! acc (if (= end (.end mt)) toks (conj (vec toks) [nil (subs s (.end mt) end)])))))
        (persistent! (cond-> acc (< pos (count s)) (conj! [nil (subs s pos)])))))))

;;; ------------------------------------------------ TypeScript view -------------------------------------------

(def ^:private ts-keywords
  #{"function" "const" "let" "return" "if" "else" "for" "of" "while" "do" "new" "throw" "try" "catch" "finally"
    "using" "import" "from" "as" "switch" "case" "default" "break" "continue" "typeof" "instanceof" "in" "yield"
    "private" "type" "macro" "true" "false" "null" "undefined" "test" "describe" "expect"})

(def ^:private sql-keywords
  #{"SELECT" "FROM" "WHERE" "AND" "OR" "NOT" "IN" "IS" "NULL" "AS" "JOIN" "LEFT" "RIGHT" "INNER" "OUTER" "ON"
    "ORDER" "GROUP" "BY" "HAVING" "LIMIT" "OFFSET" "INSERT" "INTO" "VALUES" "UPDATE" "SET" "DELETE" "EXISTS"
    "DISTINCT" "UNION" "ALL" "ASC" "DESC" "CASE" "WHEN" "THEN" "ELSE" "END" "COUNT" "LIKE" "BETWEEN" "WITH"
    "TRUE" "FALSE" "LOWER" "UPPER" "COALESCE" "CAST"})

(defn- template-tokens
  "Tokens for a template literal, highlighting `${...}` interpolations and (for sql`...`) SQL keywords."
  [cls sql? ^String s]
  (scan s [[#"\$\{(?:[^{}]|\{[^{}]*\})*\}" "hl-interp"]
           [#"/\*.*?\*/" "hl-comment"]
           [#"'(?:[^'\\]|\\.)*'" (if sql? "hl-string" cls)]
           [#"[A-Za-z_]+" (fn [w] [[(if (and sql? (sql-keywords w)) "hl-sqlkw" cls) w]])]
           [#"[^$A-Za-z_'/]+" (fn [t] [[cls t]])]
           [#"." (fn [t] [[cls t]])]]))

(def ^:private ts-rules
  [[#"//[^\n]*" "hl-comment"]
   [#"(?s)/\*.*?\*/" "hl-comment"]
   [#"(?s)clj`(?:[^`\\]|\\.)*`" "hl-raw"]
   [#"(?s)sql`(?:[^`\\]|\\.)*`" (fn [m] (into [["hl-kw" "sql"]] (template-tokens "hl-sql" true (subs m 3))))]
   [#"(?s)[A-Za-z]*`(?:[^`\\]|\\.)*`" (fn [m] (let [i (str/index-of m "`")]
                                                (into [["hl-fn" (subs m 0 i)]] (template-tokens "hl-string" false (subs m i)))))]
   [#"\"(?:[^\"\\\n]|\\.)*\"" "hl-string"]
   [#"\?\|>|\|>" "hl-pipe"]
   [#"=>" "hl-op"]
   [#"\b\d+(?:\.\d+)?\b" "hl-number"]
   [#"[A-Za-z_$][A-Za-z0-9_$]*" (fn [w] [[(cond
                                            (ts-keywords w)                  "hl-kw"
                                            (Character/isUpperCase (.charAt ^String w 0)) "hl-type"
                                            :else                            nil)
                                          w]])]])

(defn ts-lines
  "Highlight the TypeScript view's output; returns one HTML string per line."
  [text]
  (tokens->lines (scan (or text "") ts-rules)))

;;; ------------------------------------------------ Clojure ------------------------------------------------------

(def ^:private clj-specials
  #{"def" "defn" "defn-" "defmacro" "defmulti" "defmethod" "let" "if" "when" "when-not" "when-let" "if-let" "cond"
    "case" "do" "fn" "loop" "recur" "try" "catch" "finally" "throw" "ns" "doseq" "for" "->" "->>" "cond->"
    "some->" "and" "or" "not" "deftest" "testing" "is" "are" "binding" "with-open"})

(def ^:private clj-rules
  [[#";[^\n]*" "hl-comment"]
   [#"(?s)\"(?:[^\"\\]|\\.)*\"" "hl-string"]
   [#"::?[A-Za-z0-9_*+!?<>=./\-]+" "hl-keyword"]
   [#"\\(?:newline|space|tab|.)" "hl-string"]
   [#"\b\d+(?:\.\d+)?[MN]?\b" "hl-number"]
   [#"\(\s*[^\s()\[\]{}\"]+" (fn [m] (let [sym (str/trim (subs m 1))
                                           ws  (subs m 1 (- (count m) (count sym)))]
                                       [[nil "("] [nil ws] [(if (or (clj-specials sym) (clj-specials (last (str/split sym #"/"))))
                                                              "hl-kw" "hl-fn")
                                                            sym]]))]
   [#"\b(?:nil|true|false)\b" "hl-kw"]])

(defn clojure-lines
  "Highlight Clojure source; returns one HTML string per line."
  [text]
  (tokens->lines (scan (or text "") clj-rules)))
