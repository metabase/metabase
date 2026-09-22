(ns metabase.metabot.tools.memory
  "Persistent-notes tools and system-prompt injection for the experimental `:megabot` profile.

  Megabot keeps durable instance facts as notes it reads and writes across conversations — a schema
  quirk, which tables are trustworthy, how a metric is defined here, a piece of reusable SQL. The
  agent sees a catalog of note keys + one-line summaries in its system prompt (injected via
  `megabot-notes-system-context`) and pulls a note's full body on demand with `read_note`, mirroring
  the skills catalog + `load_skill` pattern. The system prompt is rebuilt on every agent-loop
  iteration, so the catalog is always live: a note written earlier in the conversation is listed on
  the next step. Notes are shared across the instance; `write_note` stamps the current user as the
  note's author, and its summary is shown in the chat so the user sees what was remembered. Storage
  goes through `metabase.metabot.db`."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.db :as metabot.db]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private max-notes-in-catalog
  "Cap on how many note lines are listed in the always-on system-prompt catalog."
  200)

;;; ------------------------------------------------ System-prompt hook ------------------------------------------------

(defn megabot-notes-system-context
  "Profile `:system-prompt-context` hook: returns the note catalog as template data for `megabot.selmer`,
  which owns all the memory wording. `:megabot_notes` is the newest [[max-notes-in-catalog]] notes as
  `{:key :summary}` maps (nil when none are saved); `:megabot_notes_more` is how many older notes were
  left out (nil when none were)."
  [_context]
  (let [catalog (metabot.db/note-catalog)
        more    (- (count catalog) max-notes-in-catalog)]
    ;; `not-empty`: Selmer treats an empty vector as truthy, which would drop the "No notes saved yet." line
    {:megabot_notes      (not-empty (mapv (fn [{:keys [note_key summary]}] {:key note_key :summary summary})
                                          (take max-notes-in-catalog catalog)))
     :megabot_notes_more (when (pos? more) more)}))

;;; ---------------------------------------------------- Tools ----------------------------------------------------

(mu/defn ^{:tool-name "write_note"}
  write-note-tool
  "Save a durable fact about this instance to persistent memory so future conversations start with it
  instead of rediscovering it — a schema quirk, which tables are trustworthy, how a metric is defined
  here, a piece of reusable SQL. Notes are shared with every user of this instance, so never save a
  personal preference. `key` is a short, stable slug that identifies the note (e.g.
  \"orders-status-codes\"); writing the same key again overwrites that note. `summary` is a one-line
  description shown in the memory catalog and to the user in the chat. `content` is the full note body
  (markdown)."
  [{:keys [key summary content]}
   :- [:map {:closed true}
       [:key :string]
       [:summary :string]
       [:content :string]]]
  (try
    (metabot.db/upsert-note! key summary content api/*current-user-id*)
    {:output            (str "Saved note '" key "'.")
     :structured-output {:note-key key}
     ;; the user never sees the tool call, so label the step with what was remembered
     :data-parts        [(streaming/tool-title-part (tru "Remembered: {0}" summary))]}
    (catch Exception e
      ;; a caught failure is an ordinary result, so without a title the step would read "Saved a note"
      {:output     (str "Could not save note: " (ex-message e))
       :data-parts [(streaming/tool-title-part (tru "Couldn''t remember: {0}" summary))]})))

(mu/defn ^{:tool-name "read_note"}
  read-note-tool
  "Read the full body of one or more saved notes by key. `keys` is a list of note keys as shown in the
  memory catalog. Returns each note's content (and flags any key with no note saved under it)."
  [{note-keys :keys}
   :- [:map {:closed true}
       [:keys [:sequential :string]]]]
  (let [rows  (metabot.db/note-bodies-by-keys note-keys)
        found (into {} (map (juxt :note_key :content)) rows)
        parts (for [k note-keys]
                (if-let [content (get found k)]
                  (str "<note key=\"" k "\">\n" content "\n</note>")
                  (str "<note key=\"" k "\"> (no note saved under this key) </note>")))]
    {:output            (str/join "\n\n" parts)
     :structured-output {:found (mapv :note_key rows)}}))

(mu/defn ^{:tool-name "delete_note"}
  delete-note-tool
  "Delete a saved note by key when it is wrong or no longer useful. `key` is the note's key as shown in
  the memory catalog."
  [{:keys [key]}
   :- [:map {:closed true}
       [:key :string]]]
  (let [n (metabot.db/delete-note! key)]
    (if (pos? (or n 0))
      {:output     (str "Deleted note '" key "'.")
       :data-parts [(streaming/tool-title-part (tru "Forgot note {0}" key))]}
      {:output (str "No note saved under key '" key "'.")})))
