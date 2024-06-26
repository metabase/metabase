(ns metabase.native-query-analyzer.replacement
  (:require
   [clojure.string :as str]
   [macaw.core :as macaw]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.native-query-analyzer.impl :as nqa.impl]
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
        gen-sentinel-candidates (fn [] (let [postfix  (gensym "mb_")
                                             template "/* opt_%s_%s */"]
                                         [(format template "open"  postfix)
                                          (format template "close" postfix)]))]
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
          ;; Note that the order of the clauses matters: `card-ref?` or `snippet?` could be true when is a `Param?`,
          ;; so we need to handle those cases specially first and leave this as the token fall-through
          (params/Param? token)
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
          ;; "this should never happen" but if it does, we certainly want to know about it.
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

(defn- param-values
  [query]
  (if (qp.store/initialized?)
    (params.values/query->params-map (:native query))
    (qp.setup/with-qp-setup [q query]
      (params.values/query->params-map (:native q)))))

(defn replace-names
  "Given a dataset_query and a map of renames (with keys `:tables` and `:columns`, as in Macaw), return a new inner query
  with the appropriate replacements made."
  ;; This arity exists as a convenience for all the tests that are fairly driver agnostic.
  ([query renames]
   ;; Postgres is both popular and adheres closely to the standard SQL specifications.
   (replace-names :postgres query renames))
  ;; Currently we take just the driver, but in future it may more sense to take the entire database entity, to match
  ;; the actual configuration, reserved words for the given version, etc.
  ([driver query renames]
   (let [raw-query     (get-in query [:native :query])
         parsed-query  (params.parse/parse raw-query)
         param->value  (param-values query)
         {clean-query :query
          tt-subs     :substitutions} (parse-tree->clean-query raw-query parsed-query param->value)
         macaw-opts    (nqa.impl/macaw-options driver)
         renamed-query (macaw/replace-names clean-query renames (assoc macaw-opts :allow-unused? true))]
     (replace-all renamed-query tt-subs))))
