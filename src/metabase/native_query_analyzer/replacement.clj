(ns metabase.native-query-analyzer.replacement
  (:require
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]))

(defn- first-unique
  [raw-query f]
  (first (filter #(not (str/includes? raw-query %))
                 (repeatedly f))))

(defn- gensymed-string
  []
  (format "'%s'" (gensym "metabase_sentinel_")))

(defn- gen-variable-sentinel
  [raw-query]
  (first-unique raw-query gensymed-string))

(defn- gen-field-filter-sentinel
  [raw-query]
  (first-unique raw-query #(apply format "(%s = %s)" (repeat 2 (gensymed-string)))))

(defn- gen-table-sentinel
  [raw-query]
  (first-unique raw-query #(str (gensym "metabase_sentinel_table_"))))

(defn- gen-snippet-sentinel
  [raw-query {:keys [content]}]
  (let [delimited-snippet (fn [sentinel snippet-contents]
                            (format "/* snippet_start_%s */ %s /* snippet_end_%s */"
                                    sentinel snippet-contents sentinel))]
    (first-unique raw-query #(delimited-snippet (gensym "mb_") content))))

(defn- gen-option-sentinels
  [raw-query]
  (let [unique-sentinels?       (fn [[open close]] (not (or (str/includes? raw-query open)
                                                            (str/includes? raw-query close))))
        gen-sentinel-candidates (fn [] (let [postfix (gensym "mb_")]
                                         [(str "/* opt_open_" postfix " */")
                                          (str "/* opt_close_" postfix " */")]))]
    (first (filter unique-sentinels? (repeatedly gen-sentinel-candidates)))))

(defn- braceify
  [s]
  (format "{{%s}}" s))

(defn- add-tag
  [all-subs new-sub token]
  (assoc all-subs new-sub (braceify (:k token))))

(defn- parse-tree->clean-query
  [raw-query tokens param->value]
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

      :else
      (let [v         (param->value (:k token))
            card-ref? (params/ReferencedCardQuery? v)
            snippet?  (params/ReferencedQuerySnippet? v)]
        (cond
          card-ref?
          (let [sub (gen-table-sentinel raw-query)]
            (recur rest
                   (str query-so-far sub)
                   (add-tag substitutions sub token)))

          snippet?
          (let [sub (gen-snippet-sentinel raw-query v)]
            (recur rest
                   (str query-so-far sub)
                   (add-tag substitutions sub token)))

          (params/Optional? token)
          (let [[open-sentinel close-sentinel] (gen-option-sentinels raw-query)
                {inner-query :query
                 inner-subs  :substitutions} (parse-tree->clean-query raw-query (:args token) param->value)]
            (recur rest
                   (str query-so-far
                        open-sentinel
                        inner-query
                        close-sentinel)
                   (merge inner-subs
                          substitutions
                          {open-sentinel  "[["
                           close-sentinel "]]"})))

          ;; Plain variable
          (and (params/Param? token)
               (not card-ref?)
               (not snippet?))
          (let [sub (gen-variable-sentinel raw-query)]
            (recur rest
                   (str query-so-far sub)
                   (add-tag substitutions sub token)))

          (params/FieldFilter? token)
          (let [sub (gen-field-filter-sentinel raw-query)]
            (recur rest
                   (str query-so-far sub)
                   (add-tag substitutions sub token)))

          :else
          ;; will be addressed by #42582, etc.
          (throw (ex-info "Unsupported token in native query" {:token token})))))))

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

;; remove this once Macaw#32 is fixed
(defn- clean-renames-macaw-issue-32
  [{:keys [tables columns]}]
  (let [clean-column (fn [c] (or (:column c) c))
        clean-table  (fn [t] (or (:table t) t))]
    {:columns (-> columns
                  (update-keys clean-column)
                  (update-vals clean-column))
     :tables  (-> tables
                  (update-keys clean-table)
                  (update-vals clean-table))}))

(defn- param-values
  [query]
  (if (qp.store/initialized?)
    (params.values/query->params-map (:native query))
    (qp.setup/with-qp-setup [q query]
      (params.values/query->params-map (:native q)))))

(defn replace-names
  "Given a dataset_query and a map of renames (with keys `:tables` and `:columns`, as in Macaw), return a new inner query
  with the appropriate replacements made."
  [query renames]
  (let [raw-query                    (get-in query [:native :query])
        parsed-query                 (params.parse/parse raw-query)
        param->value                 (param-values query)
        {clean-query :query
         tt-subs     :substitutions} (parse-tree->clean-query raw-query parsed-query param->value)
        renamed-query                (macaw/replace-names clean-query (clean-renames-macaw-issue-32 renames))]
    (replace-all renamed-query tt-subs)))
