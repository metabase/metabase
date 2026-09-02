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
   [clojure.walk :as walk]
   [metabase.api.common :as api]
   [metabase.comments.core :as comments]
   [metabase.documents.core :as documents]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.mcp.v2.write :as v2.write]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.users.models.user :as user]
   [metabase.users.settings :as users.settings]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ :document projection ------------------------------------------

;; Relocated here from `content.clj` (slice 11), which hasn't landed yet: this tool is the first
;; consumer of a `:document` response, and `document-response` below calls `projections/project
;; :document`. content/11 drops its duplicate registration when it lands — the same
;; projection-ownership dance used for metric/content in earlier slices.
(def ^:private document-concise-keys
  [:id :name :collection_id :archived :content_markdown])

(def ^:private document-detailed-keys
  (into document-concise-keys
        [:entity_id :creator_id :created_at :updated_at]))

(projections/register-key-projection! :document document-concise-keys
                                      :detailed-keys document-detailed-keys)

;;; ------------------------------------------------ Smart links ---------------------------------------------------

;; Parsing a `{% entity %}` token yields a smartLink with only its `entityId`/`model`; filling in
;; the `label`/`href` the editor displays means reading the referenced row, which is a permission
;; decision. That is why it happens here and not in [[metabase.documents.markdown]] — that
;; namespace stays pure data, and the `documents` module stays clear of a `permissions` dependency
;; that would pull every documents change into the driver test suite.

(defn- smart-link-href
  [model {:keys [id db_id]}]
  (case model
    "card"       (str "/question/" id)
    "dataset"    (str "/model/" id)
    "metric"     (str "/metric/" id)
    "dashboard"  (str "/dashboard/" id)
    "collection" (str "/collection/" id)
    "document"   (str "/document/" id)
    "database"   (str "/browse/databases/" id)
    "table"      (str "/question#?db=" db_id "&table=" id)
    "/"))

(defn- smart-link-label
  [row]
  (or (:display_name row)
      (:name row)
      (:common_name row)
      (not-empty (str/trim (str (:first_name row) " " (:last_name row))))))

(defn- smart-link-readable?
  "Whether the current user is allowed to see `row`'s display name. Every model but `user` has
  a [[mi/can-read?]] implementation to defer to; user rows are pre-filtered by
  [[visible-user-rows]], and a sandboxed or impersonated caller resolves nobody but themselves."
  [model row]
  (if (= "user" model)
    (or (= (:id row) api/*current-user-id*)
        (not (perms/sandboxed-or-impersonated-user?)))
    (mi/can-read? row)))

(defn- visible-user-rows
  "The `:model/User` rows among `ids` whose names the current user may see: the mention picker's
  rule (`GET /api/comment/mentions`, `GET /api/user/recipients`). A superuser sees everyone; anyone
  else sees active personal accounts in their own tenant, narrowed further by the `user-visibility`
  setting (`:group` — users sharing a group; `:none` — only themselves). `:model/User` has no
  `can-read?`, and resolving any id the caller names would let a document author enumerate names and
  emails (`:common_name` is the email when a user has no name) across tenants."
  [ids]
  (let [clauses (cond-> [:and [:in :id ids] [:= :type "personal"] [:= :is_active true]]
                  (not api/*is-superuser?*)
                  (conj [:= :tenant_id (:tenant_id @api/*current-user*)]))
        clauses (if api/*is-superuser?*
                  clauses
                  (case (users.settings/user-visibility)
                    :all   clauses
                    :group (conj clauses [:in :id (-> (user/same-groups-user-ids api/*current-user-id*)
                                                      set
                                                      (conj api/*current-user-id*))])
                    :none  (conj clauses [:= :id api/*current-user-id*])))]
    (t2/select :model/User {:where clauses})))

(defn- smart-link-rows
  "`{[model id] row}` for every distinct smart-link target among `links` the current user may
  see, one query per referenced model. A target the caller can't read is left out, so it is
  indistinguishable from one that doesn't exist and its name never crosses the permission
  boundary — the caller's write check on the *document* does not extend to whatever the
  document happens to point at."
  [links]
  (into {}
        (mapcat (fn [[model model-links]]
                  (let [db-model (prose-mirror/smart-link-model->db-model model)
                        ids      (distinct (map #(get-in % [:attrs :entityId]) model-links))
                        rows     (when db-model
                                   (try
                                     (filterv #(smart-link-readable? model %)
                                              (if (= "user" model)
                                                (visible-user-rows ids)
                                                (t2/select db-model :id [:in ids])))
                                     (catch Exception e
                                       (log/warnf e "smart link lookup failed for %s" model)
                                       nil)))]
                    (for [row rows]
                      [[model (:id row)] row]))))
        (group-by #(get-in % [:attrs :model]) links)))

(defn- stored-smart-link-attrs
  "`{[model entityId] attrs}` for every already-labelled smartLink in `ast`."
  [ast]
  (into {}
        (keep (fn [node]
                (when (and (map? node) (= "smartLink" (:type node)))
                  (let [{:keys [entityId model label] :as attrs} (:attrs node)]
                    (when label
                      [[model entityId] attrs])))))
        (tree-seq :content :content ast)))

(defn- resolve-smart-links!
  "Fill `:label`/`:href` on every smartLink node in `ast` from its target row, falling back to the
  same link's attrs in `previous-ast` (nil at create) and then to the defaults `parse` gave it.

  Re-reading the row is what heals a renamed target, so it wins whenever it is available. The
  fallback covers the case where it isn't: a `{% entity %}` token carries only `entityId`/`model`,
  so every re-parsed block's links arrive label-less, and an editor who can't read the target
  resolves nothing. Without a fallback, editing one sentence blanks the label of a link elsewhere
  in the same block for everyone, including the people who can see it — the editor is treated as
  authoritative about a name they were never shown.

  Carrying the old label forward writes back a string the caller can't see, which is safe in the
  one direction that matters: labels live in the AST and never in the Markdown projection, so no
  response hands the caller a name they can't read. An id that resolves no row and has no previous
  label keeps `parse`'s defaults and logs a warning: bad content, not a write error."
  [ast previous-ast]
  (let [links (->> (tree-seq :content :content ast)
                   (filter #(= "smartLink" (:type %))))]
    (if (empty? links)
      ast
      (let [rows   (smart-link-rows links)
            stored (some-> previous-ast stored-smart-link-attrs)]
        (walk/postwalk
         (fn [node]
           (if (and (map? node) (= "smartLink" (:type node)))
             (let [{:keys [entityId model]} (:attrs node)
                   k                        [model entityId]]
               (if-let [row (get rows k)]
                 (update node :attrs assoc
                         :label (smart-link-label row)
                         :href (smart-link-href model row))
                 (if-let [prior (get stored k)]
                   (update node :attrs assoc :label (:label prior) :href (:href prior))
                   (do
                     (when (prose-mirror/smart-link-model->db-model model)
                       (log/warnf "smart link target not found or not readable for %s at id: %s" model entityId))
                     node))))
             node))
         ast)))))

(defn- ast-id-set
  [ast]
  (set (prose-mirror/collect-ast {:document ast :content_type prose-mirror/prose-mirror-content-type}
                                 (comp :_id :attrs))))

(defn- check-card-embeds!
  "Every `{% card id=N %}` embed in `ast` must reference a card the caller can read, or one
  already owned by `document-id` (nil at create). \"Doesn't exist\" and \"exists but not
  readable\" collapse into the same not-found error, so the response never leaks existence
  across the permission boundary. The write path's own clone step read-checks foreign cards
  too, but only after this — a dangling id would otherwise be silently skipped by the clone
  SELECT and persist as a broken embed."
  [ast document-id]
  (let [ids (distinct (prose-mirror/card-ids {:document     ast
                                              :content_type prose-mirror/prose-mirror-content-type}))]
    (when (seq ids)
      (let [cards (into {} (map (juxt :id identity)) (t2/select :model/Card :id [:in ids]))]
        (doseq [id ids]
          (let [card (get cards id)]
            (when-not (and card
                           (or (and document-id (= document-id (:document_id card)))
                               (mi/can-read? card)))
              (common/throw-not-found :model/Card id))))))))

(defn- body-projection
  "`{:content_markdown …}` for a stored AST, or an explanation in its place when the body has no
  Markdown rendering — a block type from a newer frontend, or one a REST caller stored through
  `[:document :any]`.

  Serialized fresh from the stored AST, so it reflects post-clone card ids — the next edit's
  old_str has to match this text, not what the caller submitted. Every caller reaches this after
  its write has committed, so a body that won't render must not turn a completed write into a
  failed call; `Throwable` for the same reason the search indexer uses it, since an unrenderable
  body is exactly the input that finds a way to fail that isn't an `Exception`. The key is omitted
  rather than filled with a degraded rendering: old_str is matched against this exact text, so
  text that isn't the serialization is worse than none."
  [ast]
  (try
    {:content_markdown (:markdown (documents/serialize ast))}
    (catch Throwable e
      (log/warn e "document body has no Markdown rendering; omitting content_markdown")
      {:content_markdown_unavailable
       (str "The write succeeded, but this document's body contains a block that has no Markdown "
            "form, so content_markdown is omitted and edits cannot be applied to it. Read it with "
            "get_content, or replace the whole body with content_markdown.")})))

(defn- document-response
  "The written document echoed to the caller: the `:document` concise read projection, so the echo
   and a concise `get_content` read name the body identically and a read-modify-write needs no
   renaming, plus the write-only fields — `:entity_id` (a portable id to update by),
   `:collection_position`, and the comment threads this write orphaned.

   The body is re-serialized from the stored AST rather than taken from the projection, so it
   reflects post-clone card ids: the next edit's `old_str` is matched against this exact text."
  [document orphaned-threads]
  (-> (projections/project :document :concise document)
      (merge {:entity_id                (:entity_id document)
              :collection_position      (:collection_position document)
              :archived                 (boolean (:archived document))
              :orphaned_comment_threads orphaned-threads}
             (body-projection (:document document)))))

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

(def ^:private max-replace-all-work
  "Ceiling on `matches × document-KB` for one `replace_all`, the product that sets its cost: each
  occurrence is spliced separately and every splice re-serializes the whole document, so the work is
  quadratic in a document's size once `old_str` is short enough to appear throughout it.

  Measured at roughly 0.03ms per match·KB, so this caps a single call near 600ms. Real edits are
  orders of magnitude under — renaming a term appearing 30 times in a 50KB document is 1,500 — while
  the shape this exists to stop, a one-character `old_str` on a 64KB document, prices at ~460,000 and
  took ~14s before the ceiling existed. Left unbounded it grows with document size: an 85-byte
  request against a 1MB document buys about an hour of one thread."
  20000)

(defn- replace-all-work
  "`matches × document-KB` for `old_str` against `markdown` — the cost estimate
  [[max-replace-all-work]] bounds. Sub-KB documents price at zero, which is correct: they are cheap
  however many matches they hold."
  [^String markdown matches]
  (long (* (count matches) (/ (count markdown) 1024.0))))

(defn- in-code-context?
  "Is offset `idx` of `markdown` inside a code span or a fenced code block? Backslashes are literal
   there, so the escaping [[metabase.documents.core/escape-text]] applies for prose would store
   characters the caller never wrote. Counts unescaped backticks before `idx`: an odd count of
   fence lines means the offset is inside a fence, and an odd count of inline backticks on its own
   line means it is inside a span."
  [^String markdown ^long idx]
  (let [before     (subs markdown 0 (min idx (count markdown)))
        fence-count (count (re-seq #"(?m)^\s*```" before))
        line-start (inc (.lastIndexOf before "\n"))
        line       (subs before (max 0 line-start))
        ticks      (count (re-seq #"(?<!\\\\)`" line))]
    (or (odd? fence-count) (odd? ticks))))

(defn- check-no-markdown-tables!
  [^String markdown]
  (when (documents/contains-table? markdown)
    (common/throw-teaching-error
     "Markdown tables are not supported. Save the query as a question with `display: table` and embed it with {% card id=… %}.")))

(defn- replace-all
  "Splice every occurrence of `old_str`, right-to-left so a replacement containing `old_str`
  is never re-matched, re-serializing between splices so each offset is taken against the
  AST it applies to. Re-parsing a touched block can shift text before it, so when `new_str`
  cannot reintroduce `old_str` the bound resets and the sweep repeats until no occurrence
  remains; an iteration cap turns any pathological non-convergence into a teaching error
  rather than a silent miss.

  Refuses up front when the call prices past [[max-replace-all-work]]. Pricing it costs one
  serialization rather than one per match, so an over-budget call is rejected without doing any of
  the work being rejected."
  [ast old_str new_str escape-at]
  (let [self-matching? (str/includes? new_str old_str)
        first-ser      (documents/serialize ast)
        first-matches  (match-indexes (:markdown first-ser) old_str)
        work           (replace-all-work (:markdown first-ser) first-matches)]
    (when (> work max-replace-all-work)
      (common/throw-teaching-error
       (format (str "replace_all for old_str %s would rewrite %d matches across a %dKB document, which is more "
                    "work than one call can do. Extend old_str with surrounding context so it matches fewer "
                    "places and repeat, or replace the whole body with content_markdown, which rewrites it in "
                    "a single pass — note that a full rewrite re-creates every block, so comment threads "
                    "anchored to the body are orphaned.")
               (snippet old_str)
               (count first-matches)
               (quot (count (:markdown first-ser)) 1024))))
    ;; The pricing serialization above doubles as the first iteration's, so bounding the work costs
    ;; nothing on an in-budget call. `splice` reuses a serialization only when it is of the very AST
    ;; being spliced, so each recur re-serializes the AST it produced.
    (loop [ast ast, ser first-ser, bound Long/MAX_VALUE, iterations 0]
      (when (> iterations (+ 100 (* 2 (count first-matches))))
        (common/throw-teaching-error
         (format (str "replace_all could not converge for old_str %s — the replacement keeps re-creating "
                      "text that matches. Use distinct old_str/new_str pairs or edit the surrounding "
                      "blocks individually.")
                 (snippet old_str))))
      (let [matches (match-indexes (:markdown ser) old_str)
            idx     (last (filter #(< % bound) matches))]
        (cond
          (some? idx)
          (let [spliced (documents/splice ast ser idx (+ idx (count old_str))
                                          (escape-at (:markdown ser) idx))]
            (recur spliced (documents/serialize spliced) (long idx) (inc iterations)))

          (and (not self-matching?) (seq matches))
          (recur ast ser Long/MAX_VALUE (inc iterations))

          :else ast)))))

(defn- apply-edit
  "Apply one `{old_str, new_str, replace_all?}` edit to `ast`, locating `old_str` in a fresh
  serialization of the current AST — never a client-supplied snapshot."
  [ast {:keys [old_str new_str replace_all]}]
  (when (empty? old_str)
    (common/throw-teaching-error "old_str must be a non-empty string."))
  ;; `splice` re-parses the region it edits as Markdown source, so `new_str` is escaped to its
  ;; literal-text form first — otherwise a replacement like `*` or a leading `#` reopens the block
  ;; as a list or heading (and shifts the offsets the rest of the sweep depends on). `old_str` is
  ;; matched against the already-escaped serialization as-is.
  ;;
  ;; Escaping is skipped where the match lands inside code, though: backslashes are literal in a code
  ;; span or fenced block, so escaping there stores characters the caller never wrote (`my_var`
  ;; becomes `my\_var`). Escaping is what is inert in prose — not in code.
  (let [{:keys [markdown] :as ser} (documents/serialize ast)
        matches                    (match-indexes markdown old_str)
        escape-at                  (fn [md idx] (if (in-code-context? md idx)
                                                  new_str
                                                  (documents/escape-text new_str)))]
    (cond
      (empty? matches)
      (common/throw-teaching-error
       (format (str "old_str %s matches 0 places in the document's current Markdown. The document may "
                    "have changed since you read it — copy the snippet exactly from the content_markdown "
                    "this tool (or get_content) returns.")
               (snippet old_str)))

      (and (> (count matches) 1) (not replace_all))
      (common/throw-teaching-error
       (format (str "old_str %s matches %d places — extend the snippet with more surrounding context so "
                    "it matches exactly once, or set replace_all: true.")
               (snippet old_str) (count matches)))

      replace_all
      ;; Every match is escaped by its own context, so one occurrence in prose and another in a code
      ;; span each round-trip correctly.
      (replace-all ast old_str new_str escape-at)

      :else
      (documents/splice ast ser (first matches) (+ (first matches) (count old_str))
                        (escape-at markdown (first matches))))))

;;; ------------------------------------------------------ Create --------------------------------------------------

(defn- create!
  [{:keys [name content_markdown collection_position] :as args}]
  (when (:edits args)
    (common/throw-teaching-error "edits only apply to method: \"update\" — pass content_markdown to create."))
  (when (:id args)
    (common/throw-teaching-error "id only applies to method: \"update\" — create makes a new document."))
  (when (contains? args :archived)
    (common/throw-teaching-error "archived only applies to method: \"update\" — a new document is never archived."))
  (let [collection-id (v2.resolve/resolve-collection-id-or-personal (:collection_id args))]
    (api/create-check :model/Document {:collection_id collection-id})
    (let [ast (resolve-smart-links! (documents/parse content_markdown) nil)]
      (check-card-embeds! ast nil)
      (let [created (documents/create-document! {:name                name
                                                 :document            ast
                                                 :collection_id       collection-id
                                                 :collection_position collection_position})]
        (document-response created [])))))

;;; ------------------------------------------------------ Update --------------------------------------------------

(defn- update!
  [id {:keys [content_markdown edits collection_position archived] :as args}]
  (when (and content_markdown edits)
    (common/throw-teaching-error
     "Pass exactly one of content_markdown (a deliberate full-body rewrite) or edits (surgical text edits), not both."))
  (when-not (or content_markdown edits)
    (common/throw-teaching-error
     (str "An update needs exactly one of content_markdown (full rewrite) or edits (surgical text "
          "edits). To change only collection_id/collection_position/archived, pass edits: [].")))
  (let [existing (v2.resolve/resolve-and-read-with :model/Document id
                                                   (fn [document-id] (documents/get-document document-id)))]
    (when-not (contains? args :archived)
      (api/check-not-archived existing))
    (api/write-check existing)
    (let [collection-id (when (contains? args :collection_id)
                          (v2.resolve/resolve-collection-id (:collection_id args)))]
      (when (and (contains? args :collection_id)
                 (not= collection-id (:collection_id existing)))
        (documents/validate-collection-move-permissions (:collection_id existing) collection-id))
      (let [old-ids (ast-id-set (:document existing))
            ;; `edits: []` is the metadata-only escape hatch: no new AST, and the document
            ;; column is left entirely alone below.
            ;; Resolved once on the finished AST rather than per splice: fewer queries, and it
            ;; picks up a link any of the edits introduced. The pre-edit AST goes along so a link
            ;; whose target this caller can't read keeps the label it already had.
            new-ast (some-> (cond
                              ;; Full rewrite: everything re-parses, nothing keeps its node id, so
                              ;; every anchored comment thread is reported orphaned below.
                              content_markdown (documents/parse content_markdown)
                              (seq edits)      (reduce apply-edit (:document existing) edits))
                            (resolve-smart-links! (:document existing)))
            _       (when new-ast
                      (check-card-embeds! new-ast (:id existing)))
            body    (cond-> {}
                      new-ast                               (assoc :document new-ast)
                      (contains? args :name)                (assoc :name (:name args))
                      (contains? args :collection_id)       (assoc :collection_id collection-id)
                      (contains? args :collection_position) (assoc :collection_position collection_position)
                      (contains? args :archived)            (assoc :archived (boolean archived)))
            updated (documents/update-document! existing body)
            removed (when new-ast
                      (set/difference old-ids (ast-id-set (:document updated))))]
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
   [:name {:optional true} [:maybe documents/DocumentName]]
   [:content_markdown {:optional true} [:maybe :string]]
   [:edits {:optional true}
    [:maybe [:sequential
             [:map
              [:old_str :string]
              [:new_str :string]
              [:replace_all {:optional true} [:maybe :boolean]]]]]]
   ;; Numeric ids and positions are positive here, matching what the model layer enforces. Declared
   ;; loosely they pass validation and then fail a `mu/defn` schema deeper in, which the caller only
   ;; ever sees as the sanitized "Internal error" — a rejection that names the constraint is the
   ;; whole value of declaring it.
   ;; Kept as an `:or` so the generated JSON schema still shows both accepted shapes, which is what
   ;; the agent reads. The humanized message lists each branch rather than one sentence; an
   ;; `:error/message` on the `:or` itself is ignored by Malli's humanizer.
   [:collection_id {:optional true} [:maybe [:or ms/PositiveInt :string]]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:archived {:optional true} [:maybe :boolean]]
   [:clear {:optional true}
    [:maybe [:sequential [:enum {:description (str "Update only: property names to unset "
                                                   "(collection_position). A null cannot say this — "
                                                   "strict clients fill every unset property with "
                                                   "null, so nulls are stripped at the boundary.")}
                          "collection_position"]]]]])

(registry/deftool document-write-tool
  "Create or update a document. method: \"create\" | \"update\". Documents are Metabase-flavored Markdown: CommonMark plus {% card id=118 name=\"…\" %} block embeds of saved questions you can read (build with question_write first; an id that doesn't resolve fails the write; the embed is given a height for you), {% entity id=\"42\" model=\"dashboard\" %} inline links (models: card, dataset, metric, dashboard, collection, table, database, document), and ::: fenced layout containers — ::: flex {columns=[60,40]} holds 1-3 cells (prose in ::: supporting, or a card embed); ::: resize {height=442 minHeight=280} pins the height of one flex container or embed; a bare ::: line closes the innermost container, so every opener needs its name. No Markdown tables - embed a table-display question instead. Before authoring layout containers, call learn(\"documents\") — the grammar, nesting rules, and a worked example. A card not already owned by the document is cloned into it on write and its id rewritten, so always take the returned content_markdown as the current text. Create: name + content_markdown; optional collection_id (omit for your personal collection; \"root\" for the root collection) and collection_position. Update: id + exactly one of content_markdown (a deliberate full-body rewrite — re-creates every block, orphaning every comment thread anchored to the body) or edits: [{old_str, new_str, replace_all?}] (each old_str must match the current server-side Markdown exactly once; 0 or >1 matches is an error — extend the snippet or set replace_all; blocks keep their ids and comment anchors through edits to their text, so only a removed block loses its comments); edits: [] changes only name/collection_id/collection_position/archived without touching the body (archived: true trashes, false restores; name renames). To unset a property rather than change it, name it in clear: [\"collection_position\"] — a null does not clear, since strict clients fill every unset property with null and those are stripped. The response lists orphaned_comment_threads, and carries content_markdown_unavailable in place of content_markdown when the stored body holds a block with no Markdown form — the write still happened; read that document with get_content and rewrite it with content_markdown rather than edits. Writes are last-write-wins — no version check, a concurrent change between read and write is overwritten; a stale old_str failing to match is the only staleness signal."
  {:name        "document_write"
   :scope       metabot.scope/agent-content-write
   :annotations {:readOnlyHint false :destructiveHint false}
   :args        document-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [[op a b] (v2.write/dispatch-write
                  {:create-required [:name :content_markdown]
                   :clearable       #{:collection_position}}
                  args)
        write-args (if (= op :create) a b)
        _          (doseq [markdown (cons (:content_markdown write-args) (map :new_str (:edits write-args)))]
                     (check-no-markdown-tables! markdown))
        payload  (v2.write/readback token-scopes [metabot.scope/agent-content-read]
                                    (case op
                                      :create (create! a)
                                      :update (update! a b)))]
    (common/success-content payload)))
