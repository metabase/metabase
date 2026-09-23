(ns metabase.metabot.digest.shape
  "Renders digest candidates for the system prompt, and the `:digest` profile's
  `:system-prompt-context` hook.

  Two rules govern what crosses into the prompt:

  - The score never does. It ranked and truncated the list in
    [[metabase.metabot.digest.signals]]; handing it over invites the model to narrate our weighting
    instead of exercising judgment, and an opaque `0.81` carries nothing it can reason about.
  - Reasons stay as raw facts — `viewed-days-ago=\"3\"`, `instance-view-count=\"842\"` — not normalized
    values. A model can tell 3 days from 90, and 842 views from 4. It cannot do anything with `0.7`."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.digest.signals :as digest.signals]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.log :as log])
  (:import
   (java.time Duration Instant)))

(set! *warn-on-reflection* true)

(defn- days-ago
  [t ^Instant now]
  (when (instance? Instant t)
    (.toDays (Duration/between ^Instant t now))))

(defn- attr
  "One XML attribute, or nil when the value is absent so empty attributes never reach the prompt."
  [k v]
  (when (some? v)
    (format "%s=\"%s\"" (name k) (llm-shape/escape-xml v))))

(defn- tag
  [tag-name attrs]
  (let [rendered (str/join " " (keep (fn [[k v]] (attr k v)) attrs))]
    (format "<%s%s/>" (name tag-name) (if (str/blank? rendered) "" (str " " rendered)))))

(defn- reason->xml
  [{:keys [signal viewed-at bookmarked-at condition mine?]} now]
  (case signal
    :bookmark     (tag :reason {:signal "bookmark"
                                :bookmarked-days-ago (days-ago bookmarked-at now)})
    :authored     (tag :reason {:signal "authored"})
    :recent-view  (tag :reason {:signal "recent-view"
                                :viewed-days-ago (days-ago viewed-at now)})
    :alert        (tag :reason {:signal "alert"
                                :condition (some-> condition name)
                                :created-by-user (when (some? mine?) (str (boolean mine?)))})
    :subscription (tag :reason {:signal "subscription"
                                :created-by-user (when (some? mine?) (str (boolean mine?)))})
    nil))

(defn- popularity->xml
  "The instance-wide view count, rendered as its own reason and named so the model cannot mistake it for
  personal engagement. It measures whether this is a real shared artifact or somebody's scratch work."
  [view-count]
  (when (and view-count (pos? view-count))
    (tag :reason {:signal "instance-popularity" :instance-view-count view-count})))

(def ^:private max-description-length
  "Descriptions are free-text and can run to paragraphs. Thirty untruncated ones would undo the token
  budget `metabot-digest-candidate-limit` exists to protect, and the model only needs
  enough to tell one candidate from another."
  240)

(defn- truncated-description
  [description]
  (when-not (str/blank? description)
    (let [trimmed (str/trim description)]
      (llm-shape/escape-xml-content
       (if (<= (count trimmed) max-description-length)
         trimmed
         (str (str/trimr (subs trimmed 0 max-description-length)) "…"))))))

(defn- candidate->xml
  [{:keys [model id name description card-type reasons view-count]} now]
  (let [open     (->> [(attr :model (clojure.core/name model))
                       (attr :id id)
                       (attr :type card-type)
                       (attr :name name)
                       (attr :uri (llm-shape/metabase-uri model id))]
                      (keep identity)
                      (str/join " "))
        children (concat (when-let [d (truncated-description description)]
                           [(format "<description>%s</description>" d)])
                         (keep #(reason->xml % now) reasons)
                         (keep identity [(popularity->xml view-count)]))]
    (str/join "\n" (concat [(format "  <item %s>" open)]
                           (map #(str "    " %) children)
                           ["  </item>"]))))

(defn items->xml
  "Render the digest selection (from [[digest.signals/digest-selection]]) as the `{{digest_items}}` template var.

  These are items, not candidates: the server has already chosen them. The model's job is a reason for each, so
  the block is exactly what will be rendered — nothing to pick from. Returns nil when the selection is empty, so
  the template guard stays false."
  [items now]
  (when (seq items)
    (str/join "\n"
              (concat [(format "<digest-items count=\"%d\">" (count items))]
                      (map #(candidate->xml % now) items)
                      ["</digest-items>"]))))

(defn digest-system-context
  "System-prompt template vars contributed by the `:digest` profile. Wired as the profile's
  `:system-prompt-context` hook.

  Returns nil for `:digest_items` when the user has no signals at all, so a brand-new user gets a prompt with no
  digest block rather than an empty one."
  [_context]
  (try
    (let [now   (Instant/now)
          items (digest.signals/digest-selection api/*current-user-id*)]
      {:digest_items (items->xml items now)})
    (catch Exception e
      (log/errorf "Error building Metabot digest context: %s" (ex-message e))
      {:digest_items nil})))
