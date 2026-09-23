(ns metabase-enterprise.semantic-search.vibes.prompt
  "The Jev questions behind `vibes()`: one Noul question per candidate, all over one `state` holding the user's
  prompt (see `local/order_by_vibes_plan.md` §1.2). Jev reads user-authored text literally and degrades with
  irrelevant bulk, so candidates are trimmed before they go in."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def question-version
  "Bump when the question wording, criteria or candidate shaping changes: it is part of the score cache key."
  "v1")

(def ^:private max-text-length 300)

(defn sanitize-text
  "`s` as plain text: tags stripped, whitespace collapsed, cut to [[max-text-length]] characters (nil when blank)."
  [s]
  (when s
    (let [t (-> (str s)
                (str/replace #"<[^>]*>" " ")
                (str/replace #"&nbsp;|&amp;|&lt;|&gt;|&quot;" " ")
                (str/replace #"\s+" " ")
                str/trim)]
      (when-not (str/blank? t)
        (if (> (count t) max-text-length)
          (str (subs t 0 max-text-length) "…")
          t)))))

(defn sanitize-candidate
  "`candidate` (a map, keys strings or keywords) with string values sanitized and blank/nil entries dropped.
  Keys become strings."
  [candidate]
  (into {}
        (keep (fn [[k v]]
                (let [v (if (string? v) (sanitize-text v) v)]
                  (when (some? v)
                    [(name k) v]))))
        candidate))

(defn state
  "The Jev `state` shared by every question of one request."
  [prompt]
  {:search_query prompt})

(def ^:private question-text
  (str "`candidate` is one row of a search result. Is it the item a user searching for `search_query` would want "
       "to open?"))

(def ^:private criteria
  {:true  (str "The candidate's name, description or content describe the same data, metric or analysis the search "
               "query asks for, at the same or a close grain.")
   :false (str "The candidate only shares a keyword or general topic with the search query, or covers different data, "
               "a different metric or an unrelated grouping.")})

(defn question
  "The Noul question for one candidate."
  [candidate]
  {:type         "noul"
   :instructions {:candidate (sanitize-candidate candidate)
                  :question  question-text}
   :criteria     criteria})

(defn questions
  "`{id question}` for a `roster` (`{id candidate}`)."
  [roster]
  (update-vals roster question))
