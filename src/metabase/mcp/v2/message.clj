(ns metabase.mcp.v2.message
  "Messages for agent-facing prose: text an LLM reads as the MCP server speaking, built with [[msg]] and turned into
   text with [[render]]."
  (:require
   [clojure.string :as str]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.util Locale)
   (java.util.regex Matcher)))

(set! *warn-on-reflection* true)

(defrecord Message [lines args])

(defrecord Raw [value])

(mu/defn message? :- :boolean
  "Whether `x` is a message built by [[msg]]."
  [x :- :any]
  (instance? Message x))

(mu/defn msg :- [:fn message?]
  "A message of `lines`, format strings joined with newlines, with `args` interpolated by [[render]]."
  [lines :- :any & args]
  (->Message lines (vec args)))

(mu/defn raw :- [:fn #(instance? Raw %)]
  "Mark `x` as server-controlled text that [[render]] interpolates into a message without cleaning."
  [x :- :any]
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
  "Code points escaped by [[clean]] because they could read as the `\"` closing a quoted value."
  ;; Single quotes are kept: they can't close a double-quoted value, and names carrying them must survive being copied
  ;; back.
  #{0x201C 0x201D 0x201E 0x201F 0x00AB 0x00BB 0x2033 0x2036 0x301D 0x301E 0x301F 0xFF02})

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

(mu/defn clean :- [:maybe [:or :string number? :boolean]]
  "`x` made safe to interpolate into prose. Numbers, booleans, and nil are returned unchanged. A string is quoted and
   escaped: `pr-str`'s escapes, then `\\uXXXX` for invisible, line-breaking, and double-quote-like characters. Anything
   else is printed with `pr-str` and then cleaned as that string."
  [x :- :any]
  (if (unquoted? x)
    x
    (escape-code-points (pr-str (if (string? x) x (pr-str x))))))

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
  "The value behind a message argument: a raw argument's value, or a nested message's rendering."
  [arg]
  (cond
    (instance? Raw arg) (:value arg)
    (message? arg)      (render arg)
    :else               arg))

(defn- format-arg
  [arg]
  (if (or (instance? Raw arg) (message? arg))
    (unwrap-arg arg)
    (clean arg)))

(defn- cleaned-parts
  "Every line and argument of `message`, in the order its fully cleaned rendering joins them."
  [{:keys [lines args]}]
  (concat (if (sequential? lines) lines [lines])
          (map unwrap-arg args)))

(defn- render-cleaned
  "Every line and argument of `message` cleaned and joined with spaces, trusting none of them."
  [message]
  (str/join " " (map (comp str clean) (cleaned-parts message))))

(def ^:private render-failure
  "The text of something that can't be rendered at all."
  "Internal error while rendering a message.")

(mu/defn render :- :string
  "The text of `x`. A well-formed message renders as its lines joined with newlines, with each argument interpolated:
   raw arguments and nested messages as they are, everything else [[clean]]ed. Anything else, or a message that fails
   to format, renders with every part cleaned. Something that can't be printed at all renders as a fixed server
   sentence, logged. Never throws an `Exception`."
  [x :- :any]
  (try
    (cond
      (and (message? x) (well-formed? x))
      (try
        (String/format Locale/ROOT
                       (str/join "\n" (:lines x))
                       (object-array (map format-arg (:args x))))
        (catch Exception e
          (log/warn e "Agent message failed to format; rendering every part quoted")
          (render-cleaned x)))

      (message? x)
      (render-cleaned x)

      (instance? Raw x)
      (str (clean (:value x)))

      :else
      (str (clean x)))
    (catch Exception e
      (log/error e "Agent message failed to render")
      render-failure)))

;;; ------------------------------------------------ Truncation ----------------------------------------------------

;; A rendering is modelled as pieces that concatenate to it, so it can be cut without cutting through a quoted value:
;; `[:text s]` is server text, `[:clean v]` renders as `v` cleaned, and `[:message m]` as nested message `m`.

(def ^:private arg-marker
  "The stand-in formatted in place of argument `i`, private-use delimiters around its index, to find where it lands."
  (re-pattern (str (char 0xE000) "(\\d+)" (char 0xE001))))

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
  (let [^Matcher matcher (re-matcher arg-marker template)]
    (loop [start 0, acc []]
      (if (.find matcher)
        (recur (.end matcher)
               (conj acc
                     [:text (subs template start (.start matcher))]
                     (or (get arg-pieces (parse-long (.group matcher 1)))
                         [:text (.group matcher)])))
        (conj acc [:text (subs template start)])))))

(defn- pieces
  "The pieces of `x`'s [[render]]ing."
  [x]
  (cond
    (and (message? x) (well-formed? x))
    (let [{:keys [lines args]} x
          arg-pieces           (mapv arg-piece args)
          template             (try
                                 (String/format Locale/ROOT
                                                (str/join "\n" lines)
                                                (object-array (map-indexed (fn [i arg]
                                                                             (if (arg-pieces i)
                                                                               (str (char 0xE000) i (char 0xE001))
                                                                               (format-arg arg)))
                                                                           args)))
                                 (catch Exception _
                                   nil))]
      (if template
        (template-pieces template arg-pieces)
        (interpose [:text " "] (map #(vector :clean %) (cleaned-parts x)))))

    (message? x)
    (interpose [:text " "] (map #(vector :clean %) (cleaned-parts x)))

    (instance? Raw x)
    [[:clean (:value x)]]

    :else
    [[:clean x]]))

(defn- cut-string
  "The first `n` characters of `s`, or one fewer when the `n`th begins a surrogate pair."
  [^String s n]
  (subs s 0 (cond-> n
              (and (< 0 n (.length s)) (Character/isHighSurrogate (.charAt s (int (dec n))))) dec)))

(defn- cut-quoted
  "`v` [[clean]]ed with as much of its text kept as fits in `budget` characters before the closing quote, marked with
   `…` inside the quotes; just `…` when not even an empty value fits."
  [v budget]
  (let [s     (if (string? v) v (pr-str v))
        fits? (fn [n] (<= (dec (count (clean (cut-string s n)))) budget))]
    (if (fits? 0)
      ;; A cleaned string never shrinks as characters are kept, so binary search for the most that fit.
      (loop [lo 0, hi (count s)]
        (if (< lo hi)
          (let [mid (quot (+ lo hi 1) 2)]
            (if (fits? mid)
              (recur mid hi)
              (recur lo (dec mid))))
          (clean (str (cut-string s lo) "…"))))
      "…")))

(declare truncate-pieces)

(defn- truncate-piece
  "`[text cut?]`: `piece` rendered whole when it fits in `budget` characters, else cut short with an ellipsis."
  [[kind v] budget]
  (case kind
    :message (truncate-pieces (pieces v) budget)
    :clean   (if (unquoted? v)
               (truncate-piece [:text (str v)] budget)
               (let [text (clean v)]
                 (if (<= (count text) budget)
                   [text false]
                   [(cut-quoted v budget) true])))
    :text    (if (<= (count v) budget)
               [v false]
               [(str (cut-string v budget) "…") true])))

(defn- truncate-pieces
  "`[text cut?]`: `pieces` rendered in order until one is cut to fit what remains of `budget`."
  [pieces budget]
  (let [sb (StringBuilder.)]
    (loop [pieces pieces, budget budget]
      (if-let [[piece & more] (seq pieces)]
        (let [[^String text cut?] (truncate-piece piece budget)]
          (.append sb text)
          (if cut?
            [(str sb) true]
            (recur more (- budget (count text)))))
        [(str sb) false]))))

(mu/defn truncate :- [:fn message?]
  "A message rendering as the start of `x`'s [[render]]ing, at most `limit` characters followed by `…` where it's cut.
   A quoted value cut short keeps its closing quote after the `…`, so the rendering is at most `limit` + 2 characters."
  [x     :- :any
   limit :- :int]
  (let [[text] (try
                 (truncate-pieces (pieces x) limit)
                 (catch Exception e
                   (log/error e "Agent message failed to render for truncation")
                   (truncate-piece [:text render-failure] limit)))]
    (msg ["%s"] (raw text))))
