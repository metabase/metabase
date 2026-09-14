(ns metabase.mcp.v2.message
  "Messages for agent-facing prose: text an LLM reads as the MCP server speaking.

   Build every message with [[msg]]: a vector of line format strings plus arguments. [[render]] joins the lines with
   newlines and interpolates the arguments, [[clean]]ing each one unless it is [[raw]] or itself a message, so
   untrusted text (warehouse names, driver errors, content names) arrives quoted and escaped and can't pose as
   server-authored lines. [[render]] cleans anything that isn't a message whole, so text that bypasses [[msg]] reaches
   the client over-quoted, never unescaped."
  (:require
   [clojure.string :as str]
   [metabase.util.log :as log])
  (:import
   (java.util Locale)))

(set! *warn-on-reflection* true)

(defrecord Message [lines args])

(defrecord Raw [value])

(defn msg
  "A message of `lines`, format strings joined with newlines, with `args` interpolated by [[render]]."
  [lines & args]
  (->Message lines (vec args)))

(defn raw
  "Mark `x` as server-controlled text that [[render]] interpolates into a message without cleaning."
  [x]
  (->Raw x))

(def ^:private escaped-categories
  "Unicode general categories escaped by [[clean]]: invisible, line-breaking, and unassigned code points, plus quote
   punctuation that could look like the end of a quoted value."
  (into #{} (map long) [Character/CONTROL
                        Character/FORMAT
                        Character/LINE_SEPARATOR
                        Character/PARAGRAPH_SEPARATOR
                        Character/PRIVATE_USE
                        Character/SURROGATE
                        Character/UNASSIGNED
                        Character/INITIAL_QUOTE_PUNCTUATION
                        Character/FINAL_QUOTE_PUNCTUATION]))

(defn- escaped-code-point?
  [code-point]
  (or (contains? escaped-categories (long (Character/getType (int code-point))))
      ;; FULLWIDTH QUOTATION MARK is ordinary punctuation, but reads as a closing `"`.
      (= code-point 0xFF02)))

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

(defn clean
  "`x` made safe to interpolate into prose. Numbers, booleans, and nil are returned unchanged. A string is quoted and
   escaped: `pr-str`'s escapes, then `\\uXXXX` for invisible, line-breaking, and quote-like characters. Anything else
   is printed with `pr-str` and then cleaned as that string."
  [x]
  (if (or (nil? x) (number? x) (boolean? x))
    x
    (escape-code-points (pr-str (if (string? x) x (pr-str x))))))

(declare render)

(defn message?
  "Whether `x` is a message built by [[msg]]."
  [x]
  (instance? Message x))

(def ^:private format-specifier
  "A `java.util.Formatter` specifier; group 1 is its conversion."
  #"%(?:\d+\$)?[-#+ 0,(<]*\d*(?:\.\d+)?([tT]?[a-zA-Z%])")

(defn- single-line?
  "Whether format string `line` renders as one line: no line-breaking or control characters, and no `%n`."
  [line]
  (and (not (re-find #"[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]" line))
       (not-any? #(= "n" (second %)) (re-seq format-specifier line))))

(defn- well-formed? [{:keys [lines]}]
  (and (vector? lines)
       (every? string? lines)
       (every? single-line? lines)))

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

(defn- render-cleaned
  "Every line and argument of `message` cleaned and joined with spaces, trusting none of them."
  [{:keys [lines args]}]
  (str/join " " (map (comp str clean) (concat (if (sequential? lines) lines [lines])
                                              (map unwrap-arg args)))))

(defn render
  "The text of `x`. A well-formed message renders as its lines joined with newlines, with each argument interpolated:
   raw arguments and nested messages as they are, everything else [[clean]]ed. Anything else, or a message that fails
   to format, renders with every part cleaned. Never throws."
  [x]
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
    (str (clean x))))
