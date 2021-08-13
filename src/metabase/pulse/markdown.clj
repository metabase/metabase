(ns metabase.pulse.markdown
  (:require [hickory.core :as hickory]
            [markdown.core :as md]
            [clojure.string :as str]))

(defn- hickory->mrkdwn
  [{:keys [tag attrs content]}]
  (let [resolved-content (if (string? content) content
                             (map #(if (string? %) %
                                       (hickory->mrkdwn %))
                                  content))
        joined-content   (str/join resolved-content)]
    (cond
      (contains? #{:strong :b :h1 :h2 :h3 :h4 :h5 :h6} tag)
      (str "*" joined-content "*")

      (contains? #{:em :i} tag)
      (str "_" joined-content "_")

      (= tag :code)
      (if (str/includes? joined-content "\n")
        ;; Use codeblock formatting if content contains newlines, since both are parsed to HTML :code tags
        (str "```" joined-content "```")
        (str "`" joined-content "`"))

      (= tag :blockquote)
      (str ">" joined-content)

      (= tag :a)
      (str "<" (:href attrs) "|" joined-content ">")

      (= tag :li)
      (let [subtag (get-in content [1 :tag])]
        (if (or (= subtag :ul) (= subtag :ol))
          (str (first resolved-content) "\n" (str/join "\n" (map #(str "    " %) (str/split-lines (second resolved-content)))))
          joined-content))

      (= tag :ul)
      (str/join "\n" (map #(str "• " %) resolved-content))

      (= tag :ol)
      (str/join "\n" (map-indexed #(str (inc %1) ". " %2) resolved-content))

      :else
      joined-content)))

(defmulti process-markdown
  "Converts a markdown string from a virtual card into a form that can be sent to the provided channel type
  (mrkdwn for Slack; HTML for email)."
  (fn [_markdown channel-type] channel-type))

(defmethod process-markdown :slack
  ;; Converts a markdown string from a virtual card on a dashboard into mrkdwn, the limited markdown dialect
  ;; used by Slack. The original markdown is converted to HTML and then to Hickory, which is used as an
  ;; intermediate representation that is then converted to mrkdwn.
  ;; e.g.
  ;; Markdown: # header
  ;; HTML:     <h1>header</h1>
  ;; Hickory:  {:type :element, :attrs nil, :tag :h1, :content ["header"]}
  ;; mrkdwn:   *header*
  [markdown _]
  (->> markdown
       md/md-to-html-string
       hickory/parse-fragment
       (map hickory/as-hickory)
       (map hickory->mrkdwn)
       (str/join "\n")))

(defmethod process-markdown :email
  [markdown _]
  (md/md-to-html-string markdown))
