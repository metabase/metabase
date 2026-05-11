(ns metabase.documents.validate
  "Structural validator for ProseMirror documents stored under the
  [[metabase.documents.prose-mirror/prose-mirror-content-type]] mime type.

  This is intentionally schema-light: it covers the node types Metabase
  actually emits and consumes, with precise JSONPath-style error locations so
  programmatic callers (LLM repair flows, API validators) can either surface
  them to a human or feed them back to the model that produced the doc.

  Callers that need custom node types (e.g. exploration-specific embed
  placeholders that haven't yet been resolved to `cardEmbed`s) can register
  them via the `:custom-block-nodes` option — see [[validate-prose-mirror]]."
  (:require
   [clojure.string :as str]))

(def ^:private block-types
  #{"paragraph" "heading" "bulletList" "orderedList" "blockquote"})

(def ^:private inline-types #{"text"})

(def ^:private mark-types #{"bold" "italic" "code"})

(defn- node-type [node]
  (when (map? node)
    (or (get node :type) (get node "type"))))

(defn- get-key [m k]
  (when (map? m) (or (get m (keyword k)) (get m (name k)))))

(defn validate-prose-mirror
  "Validate a ProseMirror document tree. Returns a vector of human-readable
  error strings — empty when the document is valid. Paths use JSONPath-style
  locators (e.g. `doc.content[2].content[0]`) so callers can point at the
  offending node.

  Options:
   - `:custom-block-nodes` — map of `type-name` → `(fn [node path] -> [errors])`.
     Each entry registers an additional allowed block node type and supplies
     its own validation. The fn receives the node map and the path string,
     and must return a (possibly empty) collection of error strings."
  ([pm-doc]
   (validate-prose-mirror pm-doc nil))
  ([pm-doc opts]
   (let [opts          (or opts {})
         custom-blocks (:custom-block-nodes opts)
         block-set     (into block-types (keys custom-blocks))]
     ;; The validators are mutually recursive (children → node → children),
     ;; so they live inside a single `letfn` here rather than as three
     ;; top-level defns with a `declare`. `opts`, `custom-blocks`, and
     ;; `block-set` are closed over.
     (letfn [(validate-marks [marks path errors]
               (cond
                 (nil? marks)
                 errors

                 (not (sequential? marks))
                 (conj errors (str path ".marks: must be an array"))

                 :else
                 (reduce-kv
                  (fn [errs i mark]
                    (let [mtype (node-type mark)]
                      (cond
                        (not (map? mark))
                        (conj errs (str path ".marks[" i "]: must be an object"))

                        (not (contains? mark-types mtype))
                        (conj errs (str path ".marks[" i "]: unsupported mark `" mtype "`; allowed: "
                                        (str/join ", " (sort mark-types))))

                        :else errs)))
                  errors
                  (vec marks))))

             (validate-children [node path expected errors]
               (let [content (get-key node "content")]
                 (cond
                   (nil? content)
                   (conj errors (str path ": " (node-type node) " requires a non-empty `content` array"))

                   (not (sequential? content))
                   (conj errors (str path ": `content` must be an array, got " (pr-str (type content))))

                   (empty? content)
                   (conj errors (str path ": " (node-type node) " has empty `content`; either remove the node or add children"))

                   :else
                   (reduce-kv
                    (fn [errs i child]
                      (validate-node child (str path ".content[" i "]") expected errs))
                    errors
                    (vec content)))))

             (validate-node [node path expected errors]
               (cond
                 (not (map? node))
                 (conj errors (str path ": expected an object, got " (pr-str node)))

                 :else
                 (let [t            (node-type node)
                       custom-block (get custom-blocks t)]
                   (cond
                     (nil? t)
                     (conj errors (str path ": node is missing a `type` field"))

                     (and (= expected :block) (not (contains? block-set t)))
                     (conj errors (str path ": expected a block node (one of " (str/join ", " (sort block-set))
                                       "), got `" t "`"))

                     (and (= expected :inline) (not (contains? inline-types t)))
                     (conj errors (str path ": expected an inline node (one of " (str/join ", " (sort inline-types))
                                       "), got `" t "`"))

                     (and (= expected :listItem) (not= t "listItem"))
                     (conj errors (str path ": expected a `listItem` node, got `" t "`"))

                     custom-block
                     (into errors (custom-block node path))

                     :else
                     (case t
                       "doc"
                       (validate-children node path :block errors)

                       "paragraph"
                       (let [content (get-key node "content")]
                         (cond
                           ;; Empty paragraphs are valid in PM (visual blank line); accept them.
                           (nil? content)
                           errors

                           (not (sequential? content))
                           (conj errors (str path ": paragraph `content` must be an array"))

                           :else
                           (reduce-kv
                            (fn [errs i child]
                              (validate-node child (str path ".content[" i "]") :inline errs))
                            errors
                            (vec content))))

                       "heading"
                       (let [level (get-key (get-key node "attrs") "level")
                             errs  (if (and (integer? level) (<= 1 level 3))
                                     errors
                                     (conj errors (str path ".attrs.level: heading needs an integer level 1-3, got "
                                                       (pr-str level))))]
                         (validate-children node path :inline errs))

                       ("bulletList" "orderedList")
                       (validate-children node path :listItem errors)

                       "listItem"
                       (validate-children node path :block errors)

                       "blockquote"
                       (validate-children node path :block errors)

                       "text"
                       (let [text (get-key node "text")
                             errs (if (string? text)
                                    errors
                                    (conj errors (str path ".text: text node requires a non-empty string `text`, got "
                                                      (pr-str text))))]
                         (validate-marks (get-key node "marks") path errs))

                       (conj errors (str path ": unsupported node type `" t
                                         "`; allowed: " (str/join ", " (sort (concat block-set inline-types
                                                                                     ["doc" "listItem"]))))))))))]
       (cond
         (not (map? pm-doc))
         [(str "Top-level document is not an object: " (pr-str pm-doc))]

         (not= "doc" (node-type pm-doc))
         [(str "Top-level node must have type=\"doc\", got `" (node-type pm-doc) "`")]

         :else
         (validate-node pm-doc "doc" nil []))))))

(defn valid-prose-mirror?
  "Convenience predicate — true when [[validate-prose-mirror]] returns no errors."
  ([pm-doc]      (empty? (validate-prose-mirror pm-doc)))
  ([pm-doc opts] (empty? (validate-prose-mirror pm-doc opts))))
