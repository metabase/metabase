(ns metabase.lib.parse-param
  (:require
   [clojure.string :as str]))

;; The following function is a simplication from this fo EBNF grammar:
;;
;; (insta/defparser ^:private param-grammar "
;; S = (<whitespace> function <whitespace>) / param
;; param = #'.*'
;; expr = string|doubleString
;; string = <'\\''> #'[^\\']*' <'\\''>
;; doubleString = <'\"'> #'[^\"]*' <'\"'>
;; function = functionName arglist
;; functionName = 'mb.' #'[\\w_\\d\\.]+'
;; arglist = <'('> <whitespace> expr? <whitespace> (<','> <whitespace> expr <whitespace>)* <')'>
;; whitespace = #'\\s*'
;; ")
;;
;; We use a hand-rolled regex-based function here to save on CLJS bundle size since Instaparse adds a hefty 100KB.

(defn parse-param
  "Parses the contents of a {{blah}} param in a native query.  Returns a map with the keys [:type, :name, and
  optionally :args]"
  [s]
  (let [[_ function-name args-string] (re-matches #"\s*(mb\.[\w\d\.]+)\((.*)\)\s*" s)
        args (when args-string
               (loop [args [], s args-string, needs-more false]
                 (if (str/blank? s)
                   (when-not needs-more
                     args)
                   (when-let [[match sq-arg dq-arg] (re-find #"^\s*(?:(?:'([^']*)')|(?:\"([^\"]*)\"))\s*(?:,|$)" s)]
                     (recur (conj args (or sq-arg dq-arg))
                            (subs s (count match))
                            ;; If match ends with a comma, require one more argument.
                            (str/ends-with? match ","))))))]
    (if args
      {:type :metabase.lib.parse/function-param, :name function-name, :args args}
      {:type :metabase.lib.parse/param, :name s})))
