(ns hooks.metabase.util.i18n
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]
   [hooks.common]))

(defn- valid-apostrophes?
  "Returns true if `s` contains only doubled quotes (''') or complete placeholder-escaping quotes ('{...}'), false otherwise."
  [s]
  (loop [chars (seq s)]
    (if (empty? chars)
      true
      (let [c (first chars)]
        (if (= c \')
          (cond
              ;; Doubled quotes: skip both
            (and (next chars) (= (second chars) \'))
            (recur (nthrest chars 2))

              ;; Placeholder escape. We allow for intentional escaping, like either '{0}` or '{{`, but not 'arbitrary
              ;; strings' So basically, just require the *next* character to be a `{`, find the next single-quote, and
              ;; continue on from there.
              ;;
              ;; Technically a string like "foo bar's happy but i'm not" is totally fine, but we'll say it's invalid
              ;; because... that inner string literal is probably not what we actually want. So since we've never done
              ;; this intentionally as far as I can tell, let's just remove the possibility to avoid ambiguity.
            (= (second chars) \{)
            (let [at-closing (drop-while #(not= \' %) (next chars))]
              (if (seq at-closing)
                (recur (next at-closing))
                false))
              ;; Unpaired single quote: invalid
            :else
            false)
          (recur (rest chars)))))))

(defn format-str-arg-node->str
  [node]
  (cond
    ;; it's just a string literal
    (api/string-node? node) (api/sexpr node)
    ;; it's `(str "some" "strings")`
    (and (api/list-node? node)
         (= 'str (api/sexpr (first (:children node))))
         (every? api/string-node? (rest (:children node))))
    (apply str (map api/sexpr (rest (:children node))))

    ;; it's something else, no good
    :else
    (do
      (api/reg-finding!
       (assoc (meta node)
              :message "Must be a string literal or a call to `str` with string literal arguments."
              :type :metabase/validate-string-or-str-args-to-i18n))
      nil)))

(defn strict-apostrophes
  "Checks the node to make sure it's not a i18n call that will result in dropped apostrophes."
  [{:keys [node]}]
  (let [format-str-arg (second (:children node))
        ;; `format-str-arg` must be either a `"string"` or `(str "a call " "to" "str")` (to allow for splitting long
        ;; strings into shorter lines)
        format-str (format-str-arg-node->str format-str-arg)]
    (when-not (valid-apostrophes? format-str)
      (api/reg-finding!
       (assoc (meta node)
              :message "Format string contains invalid single quote usage. Use '' for literals or '{...}' for escaping."
              :type :metabase/validate-escaped-single-quotes-in-i18n))))
  {:node node})

(def tru strict-apostrophes)
(def trs strict-apostrophes)
(def deferred-tru strict-apostrophes)
(def deferred-trs strict-apostrophes)
