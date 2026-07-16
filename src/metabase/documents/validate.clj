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
   [clojure.string :as str]
   [clojure.walk :as walk]))

(def ^:private block-types
  #{"paragraph" "heading" "bulletList" "orderedList" "blockquote"})

(def ^:private inline-types #{"text"})

(def ^:private mark-types #{"bold" "italic" "code"})

(defn- get-key [m k]
  (when (map? m) (or (get m (keyword k)) (get m (name k)))))

(defn- node-type [node]
  (get-key node "type"))

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
     (letfn [(validate-content [content path expected]
               ;; errors across all children of `content`, each validated as `expected`
               (into [] (comp (map-indexed (fn [i child]
                                             (validate-node child (str path ".content[" i "]") expected)))
                              cat)
                     content))
             (validate-marks [marks path]
               (cond
                 (nil? marks)
                 []

                 (not (sequential? marks))
                 [(str path ".marks: must be an array")]

                 :else
                 (keep-indexed
                  (fn [i mark]
                    (let [mtype (node-type mark)]
                      (cond
                        (not (map? mark))
                        (str path ".marks[" i "]: must be an object")

                        (not (contains? mark-types mtype))
                        (str path ".marks[" i "]: unsupported mark `" mtype "`; allowed: "
                             (str/join ", " (sort mark-types))))))
                  marks)))
             (validate-children [node path expected]
               (let [content (get-key node "content")]
                 (cond
                   (nil? content)
                   [(str path ": " (node-type node) " requires a non-empty `content` array")]

                   (not (sequential? content))
                   [(str path ": `content` must be an array, got " (pr-str (type content)))]

                   (empty? content)
                   [(str path ": " (node-type node) " has empty `content`; either remove the node or add children")]

                   :else
                   (validate-content content path expected))))
             (validate-node [node path expected]
               (if-not (map? node)
                 [(str path ": expected an object, got " (pr-str node))]
                 (let [t            (node-type node)
                       custom-block (get custom-blocks t)]
                   (cond
                     (nil? t)
                     [(str path ": node is missing a `type` field")]

                     (and (= expected :block) (not (contains? block-set t)))
                     [(str path ": expected a block node (one of " (str/join ", " (sort block-set))
                           "), got `" t "`")]

                     (and (= expected :inline) (not (contains? inline-types t)))
                     [(str path ": expected an inline node (one of " (str/join ", " (sort inline-types))
                           "), got `" t "`")]

                     (and (= expected :listItem) (not= t "listItem"))
                     [(str path ": expected a `listItem` node, got `" t "`")]

                     custom-block
                     (vec (custom-block node path))

                     :else
                     (case t
                       ;; An empty root doc ({:type "doc" :content []} or no :content at all) is
                       ;; valid — the backend itself creates empty docs for new exploration
                       ;; scratchpads. Only the root can be a `doc` node (nested nodes are checked
                       ;; against :block/:inline/:listItem before reaching this case), so this
                       ;; leniency doesn't weaken the non-empty rule for other container nodes.
                       "doc"
                       (let [content (get-key node "content")]
                         (cond
                           (nil? content)
                           []

                           (not (sequential? content))
                           [(str path ": `content` must be an array, got " (pr-str (type content)))]

                           :else
                           (validate-content content path :block)))

                       "paragraph"
                       (let [content (get-key node "content")]
                         (cond
                           ;; Empty paragraphs are valid in PM (visual blank line); accept them.
                           (nil? content)
                           []

                           (not (sequential? content))
                           [(str path ": paragraph `content` must be an array")]

                           :else
                           (validate-content content path :inline)))

                       "heading"
                       (let [level    (get-key (get-key node "attrs") "level")
                             lvl-errs (when-not (and (integer? level) (<= 1 level 3))
                                        [(str path ".attrs.level: heading needs an integer level 1-3, got "
                                              (pr-str level))])]
                         (into (vec lvl-errs) (validate-children node path :inline)))

                       ("bulletList" "orderedList")
                       (validate-children node path :listItem)

                       "listItem"
                       (validate-children node path :block)

                       "blockquote"
                       (validate-children node path :block)

                       "text"
                       (let [text     (get-key node "text")
                             txt-errs (when-not (string? text)
                                        [(str path ".text: text node requires a non-empty string `text`, got "
                                              (pr-str text))])]
                         (into (vec txt-errs) (validate-marks (get-key node "marks") path)))

                       [(str path ": unsupported node type `" t
                             "`; allowed: " (str/join ", " (sort (concat block-set inline-types
                                                                         ["doc" "listItem"]))))])))))]
       (cond
         (not (map? pm-doc))
         [(str "Top-level document is not an object: " (pr-str pm-doc))]

         (not= "doc" (node-type pm-doc))
         [(str "Top-level node must have type=\"doc\", got `" (node-type pm-doc) "`")]

         :else
         (vec (validate-node pm-doc "doc" nil)))))))

(defn valid-prose-mirror?
  "Convenience predicate — true when [[validate-prose-mirror]] returns no errors."
  ([pm-doc]      (empty? (validate-prose-mirror pm-doc)))
  ([pm-doc opts] (empty? (validate-prose-mirror pm-doc opts))))

;; keep in sync with nodes-with-id on the frontend
(def ^:private nodes-with-id
  #{"paragraph" "heading" "bulletList" "orderedList" "blockquote" "codeBlock" "cardEmbed" "supportingText"})

(defn add-ids-to-nodes
  "If needed, adds an `_id` attribute to nodes to be used as a target for comments."
  [pm-doc]
  (walk/postwalk
   (fn [node]
     (if (contains? nodes-with-id (node-type node))
       (let [attrs-key (if (contains? node "attrs") "attrs" :attrs)]
         (update node attrs-key
                 (fn [attrs]
                   (if (or (contains? attrs :_id) (contains? attrs "_id"))
                     attrs
                     (assoc attrs :_id (random-uuid))))))
       node))
   pm-doc))
