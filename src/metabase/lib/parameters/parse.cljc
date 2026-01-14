(ns metabase.lib.parameters.parse
  (:refer-clojure :exclude [mapv])
  (:require
   [clojure.core.match :refer [match]]
   [clojure.string :as str]
   [metabase.lib.parameters.parse.types :as lib.params.parse.types]
   [metabase.lib.parse :as lib.parse]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv]]))

(mr/def ::parsed-token
  [:or
   :string
   ::lib.params.parse.types/param
   ::lib.params.parse.types/function-param
   ::lib.params.parse.types/optional])

;; Template Tags: Variables

(def ^:private variable-tag-regex
  #"\s*([A-Za-z0-9_\.]+)\s*")

(defn- normalize-variable-tag
  "Matches and normalizes a variable tag like {{my_var}}.
   Returns normalized-name or nil if not a variable tag."
  [tag-name]
  (when-let [[_ content] (re-matches variable-tag-regex tag-name)]
    content))

;; Template Tags: Snippets

(def ^:private snippet-tag-regex
  ;; any spaces, snippet:, any spaces, name, any trailing spaces
  #"\s*(snippet:\s*[^}]*[^}\s])\s*")

(defn tag-name->snippet-name
  "Get a snippet name from a snippet tag."
  [tag-name]
  (when (str/starts-with? tag-name "snippet:")
    (str/trim (subs tag-name (count "snippet:")))))

(defn- normalize-snippet-tag
  "Normalizes a snippet tag like {{snippet: foo}}. E.g., 'snippet:  foo ' -> 'snippet: foo'.
   Returns normalized string or nil if not a snippet tag."
  [tag-name]
  (when-let [[_ content] (re-matches snippet-tag-regex tag-name)]
    (let [snippet-name (tag-name->snippet-name content)]
      (str "snippet: " snippet-name))))

;; Template Tags: Cards

(def ^:private card-tag-regex
  #"\s*(#([0-9]*)(-[a-z0-9-]*)?)\s*")

(defn tag-name->card-id
  "Get the card id from a card tag."
  [tag-name]
  (when-let [[_ id-str] (re-matches #"^#(\d+)(-[a-z0-9-]*)?$" tag-name)]
    (parse-long id-str)))

(defn- normalize-card-tag
  "Matches and normalizes a card tag like {{#123}} or {{#123-slug}}.
   Normalizes '#123-slug' -> '#123'.
   Returns normalized-name or nil if not a card tag."
  [tag-name]
  (when-let [[_ content _card-id _slug] (re-matches card-tag-regex tag-name)]
    ;; TODO: see tech debt issue #39378 and `native-test/card-tag-test`
    content))

(def ^{:arglists '([tag-name])} match-and-normalize-tag-name
  "Matches a full tag string against tag normalizer functions and returns
   normalized-name or nil if no match."
  (some-fn normalize-variable-tag
           normalize-snippet-tag
           normalize-card-tag))

(defn- ->param [value]
  (match [value]
    [s :guard string?]
    s

    [{:type :metabase.lib.parse/param
      :name param-name}]
    (lib.params.parse.types/param {:k (or (match-and-normalize-tag-name param-name)
                                          (str/trim param-name))})

    [{:type :metabase.lib.parse/function-param
      :name param-name
      :args args}]
    (lib.params.parse.types/function-param {:function-name param-name, :args (mapv ->param args)})

    [{:type     :metabase.lib.parse/optional
      :contents contents}]
    (lib.params.parse.types/optional {:args (mapv ->param contents)})))

(mu/defn parse :- [:sequential ::parsed-token]
  "Attempts to parse parameters in string `s`. Parses any optional clauses or parameters found, and returns a sequence
   of non-parameter string fragments (possibly) interposed with `Param` or `Optional` instances.

   If `handle-sql-comments` is true (default) then we make a best effort to ignore params in SQL comments."
  ([s :- :string]
   (parse s true))

  ([s                   :- :string
    handle-sql-comments :- :boolean]
   (->> (lib.parse/parse {:parse-error-type :invalid-query}
                         s
                         handle-sql-comments)
        (mapv ->param))))
