(ns metabase.util.quoting
  "Quotes text from outside Metabase, such as a database error or a column name, for prose a language model reads.
   [[quoted]] makes it one double-quoted line, so nothing in the text can end the line or the quotes early.")

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
  "Code points [[quoted]] escapes because they could read as the `\"` closing a quoted value. Best-effort: a list of
   known look-alikes, not every character that might pass for a double quote."
  ;; Single quotes are kept: they can't close a double-quoted value, and names carrying them must survive being copied
  ;; back.
  #{0x00AB 0x00BB 0x02BA 0x02DD 0x02EE 0x05F4 0x201C 0x201D 0x201E 0x201F 0x2032 0x2033 0x2034 0x2035 0x2036 0x2037
    0x2057 0x275D 0x275E 0x2760 0x2E42 0x3003 0x301D 0x301E 0x301F 0xFF02 0x1F676 0x1F677 0x1F678})

(defn invisible-code-point?
  "Whether `code-point` is invisible, line-breaking, or unassigned."
  [code-point]
  (contains? invisible-categories (long (Character/getType (int code-point)))))

(defn escape-code-points
  "`s` with every code point matching `escape?` written as `\\uXXXX` escapes of its UTF-16 code units."
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
  "`s` as one double-quoted line: `pr-str`'s escapes, then `\\uXXXX` for invisible, line-breaking, and
   double-quote-like code points. Independent of the caller's print bindings."
  [s]
  (escape-code-points (binding [*print-readably* true] (pr-str (str s))) escaped-code-point?))
