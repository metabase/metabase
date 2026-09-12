(ns dev.security-lint.rules.rendering
  "Markup assembled from values that are not escaped.

  The email and subscription renderer builds HTML with hiccup 1, which does not escape strings, and one SVG by
  string concatenation. A dashboard heading, a parameter value, a colour: each has carried `<script>` or an
  `<image xlink:href=\"file://...\">` into every recipient's inbox."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]))

(set! *warn-on-reflection* true)

(def ^:private html-sanitizers
  "The default sanitizers plus hiccup's own `h`, which escapes a string for hiccup 1."
  (into vocab/sanitizers ['h #"escape"]))

(defn- rendered-values
  "The dynamic values a hiccup form renders as text: the non-keyword, non-map children of every keyword-headed
  vector. Not the values of an attribute map: hiccup 1 escapes those (`render-attribute` runs `escape-html`),
  so a value cannot leave its attribute, and its being a bad URL is another rule's question. `(for [r rows]
  ...)` is not an element and its binding vector is not looked at."
  [node]
  (for [el    (ast/find-nodes ast/vector-head node)
        child (rest (ast/children el))
        :let  [v (ast/unmeta child)]
        :when (and (not (ast/map-node? v))
                   (or (ast/symbol-node? v) (ast/dynamic-string? v)))]
    v))

(def ^:private markup-start
  "The start of an HTML or SVG tag. Only those: the Metabot tools build `<result>` and `<snippet>` documents
  for a language model with `str` too, and whatever the risks of that are, they are not this rule's."
  #"<(?i:!doctype|html|head|body|script|style|iframe|svg|image|g|path|rect|circle|text|img|a|div|span|p|br|hr|table|thead|tbody|tr|td|th|h[1-6]|ul|ol|li|b|i|em|strong|pre|code|font|link|meta|input|form|button|label)(?![\w-])")

(defrule hiccup1-unescaped-value
  {:name        "Dynamic value rendered into markup unescaped"
   :description (str "`hiccup.core/html` renders strings as they are, so a value placed in an element body is "
                     "live markup (attribute values it does escape). Building a tag with `str` is the same thing without the library. "
                     "Both have carried attacker-authored HTML into subscription emails, and an SVG attribute "
                     "built this way gave Batik a file:// URL to rasterize.")
   :remediation (str "Render with `hiccup2.core/html`, which escapes by default, or wrap each value in `h`. "
                     "For hand-built markup, escape with `hiccup.util/escape-html` before concatenating.")
   :severity    {:tainted :error :otherwise :warning}
   :precision   :medium
   :cwe         "CWE-79"
   :taint-policy :any-local
   :triggers    #{hiccup.core/html clojure.core/str clojure.core/format}}
  [{:keys [node] :as ctx}]
  (let [head    (ast/head-sym node)
        html?   (= "html" (name head))
        values  (if html?
                  (rendered-values node)
                  ;; str/format: only when a literal piece is the start of a tag
                  (when (some #(re-find markup-start %) (keep ast/string-value (ast/args node)))
                    (ast/args node)))
        ;; a value that went through some other function -- `(h/html ...)`, `(json/encode key)` -- was rendered
        ;; by it; only a value concatenated as it is counts
        leaked  (filter #(taint/raw-value? ctx % {:sanitizers html-sanitizers}) values)]
    (when (seq leaked)
      {:tainted? (boolean (some #(taint/tainted? (assoc ctx :locals (:boundary-locals ctx)) % {:sanitizers html-sanitizers})
                                leaked))
       :message  (str (if html? "hiccup 1 renders unescaped: " "Markup concatenated around ")
                      (str/join ", " (distinct (map ast/->str leaked))))})))
