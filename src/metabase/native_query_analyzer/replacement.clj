(ns metabase.native-query-analyzer.replacement
  (:require
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]))

(defn- first-unique
  [raw-query f]
  (first (filter #(not (str/includes? raw-query %))
                 (repeatedly f))))

(defn- gensymed-string
  []
  (format "'%s'" (gensym "metabase_sentinel_")))

(defn- sentinel-variable
  [raw-query]
  (first-unique raw-query gensymed-string))

(defn- sentinel-field-filter
  [raw-query]
  (first-unique raw-query #(apply format "(%s = %s)" (repeat 2 (gensymed-string)))))

(defn- braceify
  [s]
  (format "{{%s}}" s))

(defn- add-tag
  [all-subs new-sub token]
  (assoc all-subs new-sub (braceify (:k token))))

(defn- parse-tree->clean-query
  [raw-query tokens]
  (loop
      [[token & rest] tokens
       query-so-far   ""
       substitutions  {}]
    (cond
      (nil? token)
      {:query         query-so-far
       :substitutions substitutions}

      (string? token)
      (recur rest (str query-so-far token) substitutions)

      (params/Param? token)
      (let [sub (sentinel-variable raw-query)]
        (recur rest
               (str query-so-far sub)
               (add-tag substitutions sub token)))

      (params/FieldFilter? token)
      (let [sub (sentinel-field-filter raw-query)]
        (recur rest
               (str query-so-far sub)
               (add-tag substitutions sub token)))

      :else
      ;; will be addressed by #42582, etc.
      (throw (ex-info "Unsupported token in native query" {:token token})))))

(defn- replace-all
  "Return `the-string` with all the keys of `replacements` replaced by their values.

  (replace-all \"foo bar baz\" {\"foo\" \"quux\"
                                \"ba\"  \"xx\"})
  ;; =>
  \"quux xxr xxz\""
  [the-string replacements]
  (reduce (fn [s [from to]]
            (str/replace s from to))
          the-string
          replacements))

(defn replace-names
  "Given a card and a map of renames (with keys `:tables` and `:colums`, as in Macaw), return a new _query_ with the
  appropriate replacements made."
  [{query :dataset_query :as card} renames]
  (when-not (= :native (:type query))
    (throw (ex-info "Expected a native query" {:card card})))
  (let [raw-query    (get-in query [:native :query])
        parsed-query (params.parse/parse raw-query)
        {clean-query :query
         tt-subs     :substitutions} (parse-tree->clean-query raw-query parsed-query)
        renamed-query (macaw/replace-names clean-query renames)]
    (replace-all renamed-query tt-subs)))
