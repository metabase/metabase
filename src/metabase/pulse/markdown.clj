(ns metabase.pulse.markdown
  (:require [hickory.core :as hickory]
            [markdown.core :as md]
            [clojure.string :as str]))

(defn- hickory->mrkdwn
  [{:keys [tag content]}]
  (let [resolved-content (if (string? content)
                           content
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
