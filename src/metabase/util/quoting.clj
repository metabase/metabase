(ns metabase.util.quoting
  "Quote text from external sources for language model messages.")

(set! *warn-on-reflection* true)

(def ^:private invisible-categories
  "Unicode general categories of the invisible, line-breaking, and unassigned code points."
  (into #{} (map long) [Character/CONTROL
                        Character/FORMAT
                        Character/LINE_SEPARATOR
                        Character/PARAGRAPH_SEPARATOR
                        Character/PRIVATE_USE
                        Character/SURROGATE
                        Character/UNASSIGNED]))

(def ^:private double-quote-look-alikes
  "Known double-quote look-alikes that [[quoted]] escapes.
   The list does not cover every character that could be mistaken for a double quote."
  ;; Single quotes cannot end a double-quoted value and must survive copying in names.
  #{0x00AB 0x00BB 0x02BA 0x02DD 0x02EE 0x05F4 0x201C 0x201D 0x201E 0x201F 0x2032 0x2033 0x2034 0x2035 0x2036 0x2037
    0x2057 0x275D 0x275E 0x2760 0x2E42 0x3003 0x301D 0x301E 0x301F 0xFF02 0x1F676 0x1F677 0x1F678})

(defn invisible-code-point?
  "Return whether `code-point` is invisible, line-breaking or unassigned."
  [code-point]
  (contains? invisible-categories (long (Character/getType (int code-point)))))

(defn escape-code-points
  "Escape each code point in `s` that matches the `escape?` predicate.
   Write each UTF-16 code unit as `\\uXXXX`."
  [^String s escape?]
  (let [sb (StringBuilder.)]
    (loop [i 0]
      (when (< i (.length s))
        (let [code-point (.codePointAt s (int i))
              width      (Character/charCount code-point)]
          (if (escape? code-point)
            (dotimes [j width]
              (.append sb (format "\\u%04x" (int (.charAt s (int (+ i j)))))))
            (.appendCodePoint sb code-point))
          (recur (+ i width)))))
    (str sb)))

(defn- escaped-code-point?
  [code-point]
  (or (invisible-code-point? code-point)
      (contains? double-quote-look-alikes (long code-point))))

(defn quoted
  "Return `s` as a single line enclosed in double quotes.
   Escape newlines, quotes and backslashes with `pr-str`, then use `\\uXXXX` escapes for invisible,
   line-breaking and double-quote-like code points. The caller's print bindings do not affect the result."
  [s]
  (escape-code-points (binding [*print-readably* true] (pr-str (str s))) escaped-code-point?))
