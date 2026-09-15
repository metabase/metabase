(ns metabase.mcp.v2.message
  "Messages for agent-facing prose: text an LLM reads as the MCP server speaking, built with [[msg]] and turned into
   text with [[render]]."
  (:require
   [clojure.string :as str]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.util Locale)
   (java.util.regex Matcher)))

(set! *warn-on-reflection* true)

(defrecord Message [lines args])

(defrecord Raw [value])

(mr/def ::value
  "Anything a message can interpolate or [[render]]: a message, raw text, or any other value, which renders cleaned."
  [:schema {::mr/deliberately-open true, :description "any value a message renders"} :any])

(mu/defn message? :- :boolean
  "Whether `x` is a message built by [[msg]]."
  [x :- ::value]
  (instance? Message x))

(mr/def ::message
  "A message built by [[msg]]."
  [:fn {:error/message "a message built by metabase.mcp.v2.message/msg"} message?])

(mr/def ::raw
  "Server-controlled text built by [[raw]]."
  [:fn {:error/message "raw text built by metabase.mcp.v2.message/raw"} #(instance? Raw %)])

(mu/defn msg :- ::message
  "A message of `lines`, format strings joined with newlines, with `args` interpolated by [[render]]."
  [lines  :- [:sequential :string]
   & args :- [:* ::value]]
  (->Message lines (vec args)))

(mu/defn raw :- ::raw
  "Mark `x` as server-controlled text that [[render]] interpolates into a message without cleaning."
  [x :- ::value]
  (->Raw x))

(def ^:private escaped-categories
  "Unicode general categories escaped by [[clean]]: invisible, line-breaking, and unassigned code points."
  (into #{} (map long) [Character/CONTROL
                        Character/FORMAT
                        Character/LINE_SEPARATOR
                        Character/PARAGRAPH_SEPARATOR
                        Character/PRIVATE_USE
                        Character/SURROGATE
                        Character/UNASSIGNED]))

(def ^:private double-quote-look-alikes
  "Code points escaped by [[clean]] because they could read as the `\"` closing a quoted value. Best-effort: a
   list of known look-alikes, not every character that might pass for a double quote."
  ;; Single quotes are kept: they can't close a double-quoted value, and names carrying them must survive being copied
  ;; back.
  #{0x00AB 0x00BB 0x02BA 0x05F4 0x201C 0x201D 0x201E 0x201F 0x2033 0x2036 0x275D 0x275E 0x2E42 0x301D 0x301E 0x301F
    0xFF02})

(defn- escaped-code-point?
  [code-point]
  (or (contains? escaped-categories (long (Character/getType (int code-point))))
      (contains? double-quote-look-alikes (long code-point))))

(defn- escape-code-points
  "`s` with every [[escaped-code-point?]] written as `\\uXXXX` escapes of its UTF-16 code units."
  [^String s]
  (let [sb (StringBuilder.)]
    (loop [i 0]
      (when (< i (.length s))
        (let [code-point (.codePointAt s (int i))
              width      (Character/charCount code-point)]
          (if (escaped-code-point? code-point)
            (dotimes [j width]
              (.append sb (format "\\u%04x" (int (.charAt s (int (+ i j)))))))
            (.appendCodePoint sb code-point))
          (recur (+ i width)))))
    (str sb)))

(defn- unquoted?
  "Whether [[clean]] returns `x` unchanged."
  [x]
  (or (nil? x) (number? x) (boolean? x)))

(defn- printed
  "`x` printed readably with `pr-str`, whatever the caller's print bindings."
  [x]
  (binding [*print-readably* true
            *print-dup*      false
            *print-meta*     false
            *print-length*   nil
            *print-level*    nil]
    (pr-str x)))

(defn- quoted-text
  "The string [[clean]] quotes for quoted value `x`: a string itself, a keyword's name with any namespace, or
   anything else printed."
  [x]
  (cond
    (string? x)  x
    (keyword? x) (subs (str x) 1)
    :else        (printed x)))

(mu/defn- clean :- [:maybe [:or :string number? :boolean]]
  "`x` made safe to interpolate into prose. Numbers, booleans, and nil are returned unchanged. A string is quoted and
   escaped: `pr-str`'s escapes, then `\\uXXXX` for invisible, line-breaking, and double-quote-like characters. A
   keyword is cleaned as its name, with any namespace; anything else is printed with `pr-str` and then cleaned as that
   string. Independent of the caller's print bindings."
  [x :- ::value]
  (if (unquoted? x)
    x
    (escape-code-points (printed (quoted-text x)))))

(declare render)

(def ^:private format-specifier
  "A `java.util.Formatter` specifier; groups 1 to 4 are its flags, width, precision, and conversion."
  #"%(?:\d+\$)?([-#+ 0,(<]*)(\d*)(\.\d+)?([tT]?[a-zA-Z%])")

(defn- single-line?
  "Whether format string `line` renders as one line: no line-breaking or control characters, and no `%n`."
  [line]
  (and (not (re-find #"[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]" line))
       (not-any? #(= "n" (nth % 4)) (re-seq format-specifier line))))

(defn- reshapes-string?
  "Whether specifier match `specifier` would cut, pad, or change the case of a string: any `%S`, or a `%s` with
   flags, width, or precision."
  [[_ flags width precision conversion]]
  (or (= "S" conversion)
      (and (= "s" conversion)
           (boolean (or precision (seq width) (re-find #"[^<]" flags))))))

(defn- well-formed? [{:keys [lines]}]
  (and (vector? lines)
       (every? string? lines)
       (every? single-line? lines)
       ;; Arguments arrive already quoted and escaped, so cutting or casing one could expose a half-quoted value.
       (not-any? reshapes-string? (mapcat #(re-seq format-specifier %) lines))))

(defn- unwrap-arg
  "The value behind message argument `arg`: a raw argument's value, a nested message's rendering, or any other
   argument passed through `plain`."
  [arg plain]
  (cond
    (instance? Raw arg) (:value arg)
    (message? arg)      (render arg)
    :else               (plain arg)))

(defn- cleaned-parts
  "Every line and argument of `message`, in the order its fully cleaned rendering joins them."
  [{:keys [lines args]}]
  (concat (if (sequential? lines) lines [lines])
          (map #(unwrap-arg % identity) args)))

(defn- cleaned-rendering
  "Every line and argument of `message` cleaned and joined with spaces, trusting none of them."
  [message]
  (str/join " " (map (comp str clean) (cleaned-parts message))))

(defn- formatted
  "The lines of `message` joined with newlines and formatted with `format-args`, or nil when `message` isn't
   well-formed or fails to format."
  [message format-args]
  (when (well-formed? message)
    (try
      (String/format Locale/ROOT (str/join "\n" (:lines message)) (object-array format-args))
      (catch Exception e
        (log/warn e "Agent message failed to format; rendering every part quoted")
        nil))))

(def ^:private render-failure
  "The text of something that can't be rendered at all."
  "Internal error while rendering a message.")

(mu/defn render :- :string
  "The text of `x`. A well-formed message renders as its lines joined with newlines, with each argument interpolated:
   raw arguments and nested messages as they are, everything else [[clean]]ed. Anything else, or a message that fails
   to format, renders with every part cleaned. Something that can't be printed at all renders as a fixed server
   sentence, logged. Never throws an `Exception`."
  [x :- ::value]
  (try
    (cond
      (message? x)      (or (formatted x (map #(unwrap-arg % clean) (:args x)))
                            (cleaned-rendering x))
      (instance? Raw x) (str (clean (:value x)))
      :else             (str (clean x)))
    (catch Exception e
      (log/error e "Agent message failed to render")
      render-failure)))

;;; ------------------------------------------------ Truncation ----------------------------------------------------

;; A rendering is modelled as pieces that concatenate to it, so it can be cut without cutting through a quoted value:
;; `[:text s]` is server text, `[:clean v]` renders as `v` cleaned, and `[:message m]` as nested message `m`.

(defn- arg-marker
  "The stand-in formatted in place of argument `i`, private-use delimiters around its index, to find where it lands."
  [i]
  (str (char 0xE000) i (char 0xE001)))

(def ^:private arg-marker-pattern
  "Matches an [[arg-marker]], capturing its index."
  (re-pattern (arg-marker "(\\d+)")))

(defn- arg-piece
  "The piece argument `arg` renders as, or nil when it formats as a non-string and so stays in the formatted text."
  [arg]
  (cond
    (message? arg)      [:message arg]
    (instance? Raw arg) (when (string? (:value arg)) [:text (:value arg)])
    (unquoted? arg)     nil
    :else               [:clean arg]))

(defn- template-pieces
  "The pieces of formatted `template`: its text, split at each argument marker, around `arg-pieces`."
  [^String template arg-pieces]
  (let [^Matcher matcher (re-matcher arg-marker-pattern template)]
    (loop [start 0, acc []]
      (if (.find matcher)
        (recur (.end matcher)
               (conj acc
                     [:text (subs template start (.start matcher))]
                     (or (get arg-pieces (parse-long (.group matcher 1)))
                         [:text (.group matcher)])))
        (conj acc [:text (subs template start)])))))

(defn- cleaned-pieces
  "The pieces of `message`'s [[cleaned-rendering]]."
  [message]
  (interpose [:text " "] (map #(vector :clean %) (cleaned-parts message))))

(defn- message-pieces
  "The pieces of `message`'s [[render]]ing."
  [{:keys [args] :as message}]
  (let [arg-pieces (mapv arg-piece args)
        marked     (map-indexed (fn [i arg] (if (arg-pieces i) (arg-marker i) (unwrap-arg arg clean))) args)]
    (if-let [template (formatted message marked)]
      (template-pieces template arg-pieces)
      (cleaned-pieces message))))

(defn- pieces
  "The pieces of `x`'s [[render]]ing."
  [x]
  (cond
    (message? x)      (message-pieces x)
    (instance? Raw x) [[:clean (:value x)]]
    :else             [[:clean x]]))

(mu/defn string-prefix :- :string
  "The first `n` characters of `s`, or one fewer when the `n`th begins a surrogate pair; all of `s` when `n` reaches
   its length."
  [s :- :string
   n :- nat-int?]
  (subs s 0 (cond-> (min n (count s))
              (and (< 0 n (count s)) (Character/isHighSurrogate (.charAt ^String s (int (dec n))))) dec)))

(defn- excerpt
  "`s` with only its first `n` characters kept, marked with `…` when that cuts it."
  [s n]
  (if (< n (count s))
    (str (string-prefix s n) "…")
    s))

(defn- quoted-excerpt-width
  "How many characters of [[excerpt]] `s` `n`, [[clean]]ed, count against a budget: all of them for the whole value,
   all but the `…` and closing quote for a cut one."
  [s n]
  (cond-> (count (clean (excerpt s n)))
    (< n (count s)) (- 2)))

;; A truncation is a message of the pieces it keeps, each an argument of the same kind: server text as raw text, a
;; cleaned value as itself or as its cut excerpt, still cleaned. Truncating that message again cuts every piece as the
;; kind it is, so a quoted value keeps its closing quote at any depth.

(defn- truncated-quoted
  "`[args width cut?]`: `v`, which renders [[clean]]ed, as the argument kept whole when it fits in `budget`
   characters, else the [[excerpt]] keeping the most of its text that fits, or just `…` when not even an empty
   excerpt fits."
  [v budget]
  (let [s           (quoted-text v)
        whole-width (quoted-excerpt-width s (count s))
        fits?       #(<= (quoted-excerpt-width s %) budget)]
    (cond
      (<= whole-width budget) [[v] whole-width false]
      ;; A cut excerpt never shrinks as characters are kept, so binary search for the most that fit.
      (fits? 0)               (loop [lo 0, hi (dec (count s))]
                                (if (< lo hi)
                                  (let [mid (quot (+ lo hi 1) 2)]
                                    (if (fits? mid)
                                      (recur mid hi)
                                      (recur lo (dec mid))))
                                  [[(excerpt s lo)] nil true]))
      :else                   [[(raw "…")] nil true])))

(declare truncated-pieces)

(defn- truncated-piece
  "`[args width cut?]`: message arguments rendering as `piece` whole, and that rendering's width, when it fits in
   `budget` characters, else as `piece` cut short with an ellipsis."
  [[kind v] budget]
  (case kind
    :message (let [[args width cut?] (truncated-pieces (pieces v) budget)]
               (if cut? [args nil true] [[v] width false]))
    :clean   (if (unquoted? v)
               (truncated-piece [:text (str v)] budget)
               (truncated-quoted v budget))
    :text    (if (<= (count v) budget)
               [[(raw v)] (count v) false]
               [[(raw (str (string-prefix v budget) "…"))] nil true])))

(defn- truncated-pieces
  "`[args width cut?]`: message arguments rendering as `pieces` in order until one is cut to fit what remains of
   `budget`, and the width of their rendering when none is cut."
  [pieces budget]
  (loop [pieces pieces, budget budget, args [], width 0]
    (if-let [[piece & more] (seq pieces)]
      (let [[piece-args piece-width cut?] (truncated-piece piece budget)
            args                          (into args piece-args)]
        (if cut?
          [args nil true]
          (recur more (- budget piece-width) args (+ width (long piece-width)))))
      [args width false])))

(defn- concatenation
  "A message rendering as the renderings of `args` concatenated."
  [args]
  (apply msg [(str/join (repeat (count args) "%s"))] args))

(mu/defn truncate :- ::message
  "A message rendering as the start of `x`'s [[render]]ing, at most `limit` characters followed by `…` where it's cut.
   A quoted value cut short keeps its closing quote after the `…`, so the rendering is at most `limit` + 2 characters.
   Truncating the result again keeps every quoted value's closing quote the same way."
  [x     :- ::value
   limit :- :int]
  (let [[args] (try
                 (truncated-pieces (pieces x) limit)
                 (catch Exception e
                   (log/error e "Agent message failed to render for truncation")
                   (truncated-pieces [[:text render-failure]] limit)))]
    (concatenation args)))
