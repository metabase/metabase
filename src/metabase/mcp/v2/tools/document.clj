(ns metabase.mcp.v2.tools.document
  "The v2 MCP `document` write tool. Documents are the one content type whose body is
   written as Markdown rather than compact JSON: the handler converts Metabase-flavored
   Markdown to the stored ProseMirror AST through [[metabase.documents.core/parse]] /
   [[metabase.documents.core/serialize]] / [[metabase.documents.core/splice]], and mirrors
   the REST `POST`/`PUT /api/document` permission checks, card-embed cloning, and event
   publishing via the shared domain functions."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.comments.core :as comments]
   [metabase.documents.core :as documents]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(defn- ast-id-set
  [ast]
  (set (prose-mirror/collect-ast {:document ast :content_type prose-mirror/prose-mirror-content-type}
                                 (comp :_id :attrs))))

(defn- document-response
  [document orphaned-threads]
  {:id                       (:id document)
   :entity_id                (:entity_id document)
   :name                     (:name document)
   :collection_id            (:collection_id document)
   :collection_position      (:collection_position document)
   :archived                 (boolean (:archived document))
   ;; Serialized fresh from the stored AST, so it reflects post-clone card ids — the next
   ;; edit's old_str has to match this text, not what the caller submitted.
   :content_markdown         (:markdown (documents/serialize (:document document)))
   :orphaned_comment_threads orphaned-threads})

;;; ------------------------------------------------------ Edits ---------------------------------------------------

(defn- match-indexes
  "Start offsets of the non-overlapping occurrences of `needle` in `haystack`."
  [^String haystack ^String needle]
  (loop [from 0 acc []]
    (if-let [i (str/index-of haystack needle from)]
      (recur (long (+ i (count needle))) (conj acc i))
      acc)))

(defn- snippet
  [s]
  (let [s (str s)]
    (pr-str (if (> (count s) 80) (str (subs s 0 77) "…") s))))

(defn- replace-all
  "Splice every occurrence of `old_str`, right-to-left so a replacement containing `old_str`
  is never re-matched, re-serializing between splices so each offset is taken against the
  AST it applies to."
  [ast old_str new_str]
  (loop [ast ast, bound Long/MAX_VALUE]
    (let [ser (documents/serialize ast)
          idx (->> (match-indexes (:markdown ser) old_str)
                   (filter #(< % bound))
                   last)]
      (if (nil? idx)
        ast
        (recur (documents/splice ast ser idx (+ idx (count old_str)) new_str)
               (long idx))))))

(defn- apply-edit
  "Apply one `{old_str, new_str, replace_all?}` edit to `ast`, locating `old_str` in a fresh
  serialization of the current AST — never a client-supplied snapshot."
  [ast {:keys [old_str new_str replace_all]}]
  (when (empty? old_str)
    (common/throw-teaching-error "old_str must be a non-empty string."))
  (let [{:keys [markdown] :as ser} (documents/serialize ast)
        matches                    (match-indexes markdown old_str)]
    (cond
      (empty? matches)
      (common/throw-teaching-error
       (format "old_str %s matches 0 places in the document's current Markdown. The document may have changed since you read it — copy the snippet exactly from the content_markdown this tool (or get_content) returns."
               (snippet old_str)))

      (and (> (count matches) 1) (not replace_all))
      (common/throw-teaching-error
       (format "old_str %s matches %d places — extend the snippet with more surrounding context so it matches exactly once, or set replace_all: true."
               (snippet old_str) (count matches)))

      replace_all
      (replace-all ast old_str new_str)

      :else
      (documents/splice ast ser (first matches) (+ (first matches) (count old_str)) new_str))))

;;; ------------------------------------------------------ Create --------------------------------------------------

(defn- create!
  [{:keys [name content_markdown collection_position] :as args}]
  (when (:edits args)
    (common/throw-teaching-error "edits only apply to method: \"update\" — pass content_markdown to create."))
  (when (str/blank? name)
    (common/throw-teaching-error "`name` must be a non-blank string."))
  (let [collection-id (common/resolve-collection-id (:collection_id args))]
    (api/create-check :model/Document {:collection_id collection-id})
    (let [ast     (documents/parse content_markdown)
          created (documents/create-document! {:name                name
                                               :document            ast
                                               :collection_id       collection-id
                                               :collection_position collection_position})]
      (document-response created []))))

;;; ------------------------------------------------------ Update --------------------------------------------------

(defn- update!
  [id {:keys [content_markdown edits collection_position archived] :as args}]
  (when (and content_markdown edits)
    (common/throw-teaching-error
     "Pass exactly one of content_markdown (a deliberate full-body rewrite) or edits (surgical text edits), not both."))
  (when-not (or content_markdown edits)
    (common/throw-teaching-error
     "An update needs exactly one of content_markdown (full rewrite) or edits (surgical text edits). To change only collection_id/collection_position/archived, pass edits: []."))
  (let [existing (common/resolve-and-read :model/Document id
                                          (fn [document-id] (documents/get-document document-id)))]
    (when-not (contains? args :archived)
      (api/check-not-archived existing))
    (api/write-check existing)
    (let [collection-id (when (contains? args :collection_id)
                          (common/resolve-collection-id (:collection_id args)))]
      (when (and (contains? args :collection_id)
                 (not= collection-id (:collection_id existing)))
        (documents/validate-collection-move-permissions (:collection_id existing) collection-id))
      (let [old-ids (ast-id-set (:document existing))
            new-ast (if content_markdown
                      ;; Full rewrite: everything re-parses, nothing keeps its node id, so
                      ;; every anchored comment thread is reported orphaned below.
                      (documents/parse content_markdown)
                      (reduce apply-edit (:document existing) edits))
            body    (cond-> {:document new-ast}
                      (contains? args :collection_id)       (assoc :collection_id collection-id)
                      (contains? args :collection_position) (assoc :collection_position collection_position)
                      (contains? args :archived)            (assoc :archived (boolean archived)))
            updated (documents/update-document! existing body)
            removed (set/difference old-ids (ast-id-set (:document updated)))]
        (document-response updated
                           (if (seq removed)
                             (filterv #(contains? removed (:child_target_id %))
                                      (comments/child-target-ids-for-document (:id updated)))
                             []))))))

;;; ------------------------------------------------------ Tool ----------------------------------------------------

(def ^:private document-write-args-schema
  [:map {:closed true}
   [:method [:enum "create" "update"]]
   [:id {:optional true} [:maybe [:or :int :string]]]
   [:name {:optional true} [:maybe [:string {:min 1, :max 254}]]]
   [:content_markdown {:optional true} [:maybe :string]]
   [:edits {:optional true}
    [:maybe [:sequential
             [:map
              [:old_str :string]
              [:new_str :string]
              [:replace_all {:optional true} [:maybe :boolean]]]]]]
   [:collection_id {:optional true} [:maybe [:or :int :string]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:archived {:optional true} [:maybe :boolean]]])

(registry/deftool document-write-tool
  "Create or update a document. method: \"create\" | \"update\". Documents are written as Metabase-flavored Markdown: CommonMark plus {% card id=118 name=\"…\" %} block tokens embedding an existing saved question (create charts with question_write first, then embed), {% entity id=\"42\" model=\"dashboard\" %} inline links (models: card, dataset, metric, dashboard, collection, table, database, document), and ::: fenced layout containers — `::: resize {height=442 minHeight=280}` wraps one flex container or card, `::: flex {columns=[60,40]}` holds 1-3 columns (::: supporting blocks of prose, or card embeds), a bare `:::` line closes the innermost container. A card not already owned by the document is cloned into it on write and its id rewritten, so always take the returned content_markdown as the current text. On create, pass name and content_markdown; optional collection_id (\"root\" or omit for the root collection) and collection_position. On update, pass id and exactly one of content_markdown (a deliberate full-body rewrite — re-creates every block, so every comment thread anchored to the document body is orphaned) or edits: [{old_str, new_str, replace_all?}] (each old_str must match the current server-side Markdown exactly once; 0 or >1 matches is an error — extend the snippet or set replace_all; untouched blocks keep their ids and comment anchors); pass edits: [] to change only collection_id/collection_position/archived (archived: true trashes, false restores). The response lists orphaned_comment_threads. Writes are last-write-wins — there is no version check, and a concurrent change between read and write is overwritten; a stale old_str failing to match is the only staleness signal."
  {:name         "document_write"
   :scope        metabot.scope/agent-document-create
   :update-scope metabot.scope/agent-document-update
   :annotations  {:readOnlyHint false :destructiveHint false}
   :args         document-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [[op a b] (common/dispatch-write
                  {:tool-name       "document_write"
                   :update-scope    metabot.scope/agent-document-update
                   :create-required [:name :content_markdown]}
                  token-scopes args)
        payload  (case op
                   :create (create! a)
                   :update (update! a b))]
    (common/success-content payload)))
