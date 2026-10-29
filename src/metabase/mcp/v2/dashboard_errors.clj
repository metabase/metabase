(ns metabase.mcp.v2.dashboard-errors
  "MCP's wording for the dashboard op compiler's errors.
   The compiler in [[metabase.metabot.toolkit.dashboard-ops]] throws an error code and the values behind it.
   This namespace turns them into the teaching errors `dashboard_write` returns.
   The wording points at MCP tools such as `learn` and `get_content`."
  (:require
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.message :as message]
   [metabase.mcp.v2.skills :as skills]
   [metabase.metabot.toolkit.dashboard-ops :as dashboard-ops]))

(set! *warn-on-reflection* true)

(def ^:private details
  "For each error code in [[dashboard-ops/errors]], a function from the error data to the message explaining it.
   The message has no op prefix."
  {:missing-op
   (fn [_] (message/raw "missing `op` — see the tool description for the supported list."))

   :unknown-op
   (fn [_] (message/raw "unknown op — see the tool description for the supported list."))

   :invalid-new-id
   (fn [_] (message/raw "`id` must be a negative integer — negative ids mark rows to create."))

   :duplicate-new-id
   (fn [{:keys [id]}]
     (message/msg ["id %s is already used in this batch — give each new row its own negative id."] id))

   :missing-dashcard-id
   (fn [_] (message/raw "missing `dashcard_id`."))

   :unknown-dashcard
   (fn [{:keys [dashcard-id]}] (message/msg ["no dashcard with id %s on this dashboard."] dashcard-id))

   :missing-tab-id
   (fn [_] (message/raw "missing `tab_id`."))

   :unknown-tab
   (fn [{:keys [tab-id]}] (message/msg ["no tab with id %s on this dashboard."] tab-id))

   :no-free-space
   (fn [_] (message/raw "no free space on this tab for another card — remove or resize something first."))

   :link-needs-url-or-entity
   (fn [_] (message/raw "pass exactly one of `url` or `entity`."))

   :unpatchable-key
   (fn [{:keys [key use-op]}] (message/msg ["%s is not patchable — use the %s op."] key use-op))

   :unknown-patch-key
   (fn [{:keys [key]}] (message/msg ["%s is not a patchable property."] key))

   :tab-index-out-of-range
   (fn [{:keys [index tab-count]}]
     (message/msg ["index %s is out of range — this dashboard has %s tabs."] index tab-count))

   :cards-without-tab
   (fn [{:keys [dashcard-ids]}]
     (message/msg [(str "This dashboard has tabs, so every card must belong to a tab: %s have none. "
                        "Pass \"tab\" on the add op, or use \"move\" with \"tab\" for cards already placed.")]
                  (common/list-message dashcard-ids)))

   :missing-parameter-id
   (fn [_] (message/raw "missing `parameter_id`."))

   :unknown-parameter
   (fn [{:keys [parameter-id]}] (message/msg ["no parameter with id %s on this dashboard."] parameter-id))

   :parameter-exists
   (fn [{:keys [parameter-id]}]
     (message/msg ["parameter %s already exists — use \"update_parameter\"."] parameter-id))

   :set-and-cleared
   (fn [{:keys [field]}] (message/msg ["%s is both set and cleared — pass one or the other."] field))

   :conflicting-parameter-destinations
   (fn [_] (message/raw "pass exactly one of `index` or `dashcard_id`."))

   :missing-parameter-destination
   (fn [_] (message/raw "pass `index` to reorder the header, or `dashcard_id` to place it on a card."))

   :parameter-index-out-of-range
   (fn [{:keys [index parameter-count]}]
     (message/msg ["index %s is out of range — this dashboard has %s parameters."] index parameter-count))

   :field-not-exposed
   (fn [{:keys [dashcard-id field-id parameter-id]}]
     (message/msg [(str "dashcard %s does not expose field %s for parameter %s. Read "
                        "the dashboard with get_content to see each card's columns.")]
                  dashcard-id field-id parameter-id))

   :no-card-behind-dashcard
   (fn [{:keys [dashcard-id]}]
     (message/msg [(str "dashcard %s has no card behind it — only a raw "
                        "\"target\" of [\"text-tag\", \"<name>\"] can wire a "
                        "text, heading, or iframe card's own {{placeholder}}.")]
                  dashcard-id))

   :unknown-template-tag
   (fn [{:keys [card-id tag tags]}]
     (if (seq tags)
       (message/msg ["card %s has no template tag named %s. Its tags: %s. %s"]
                    card-id tag (common/list-message tags) skills/wire-target-grammar)
       (message/msg [(str "card %s has no template tag named %s. It has no template tags — "
                          "\"target_tag\" wires a native-SQL card's tags; for an MBQL card pass "
                          "\"target_field\". %s")]
                    card-id tag skills/wire-target-grammar)))

   :unwireable-tag
   (fn [{:keys [tag tag-type wireable-tags]}]
     (message/msg [(str "tag %s has type %s — it splices SQL text and cannot "
                        "take a parameter value. Wireable tags on this card: %s.")]
                  tag tag-type
                  (if (seq wireable-tags) (common/list-message wireable-tags) (message/raw "none"))))

   :unknown-text-tag
   (fn [{:keys [target dashcard-id placeholders]}]
     (if (seq placeholders)
       (message/msg [(str "target %s resolves to nothing on dashcard %s — a text-tag "
                          "target binds a {{tag}} placeholder in a text, heading, or "
                          "iframe card's own content; this card's placeholders: %s.")]
                    target dashcard-id (common/list-message placeholders))
       (message/msg [(str "target %s resolves to nothing on dashcard %s — a text-tag "
                          "target binds a {{tag}} placeholder in a text, heading, or "
                          "iframe card's own content, and this dashcard carries none.")]
                    target dashcard-id)))

   :unresolved-target
   (fn [{:keys [target card-id parameter-id]}]
     (message/msg [(str "target %s resolves to nothing on card %s — the card exposes "
                        "no matching column or template tag for parameter %s. Read the "
                        "card with get_content to see its columns and template tags. %s")]
                  target card-id parameter-id skills/wire-target-grammar))

   :missing-wire-target
   (fn [_]
     (message/msg ["pass one of \"target_field\", \"target_tag\", or \"target\". %s"]
                  skills/wire-target-grammar))})

(defn- op-message
  "The message `detail` attributed to the op at `idx` (0-based, as sent): `op <idx> (<op-name>): <detail>`.
   Without an `op-name` it is `op <idx>: <detail>`.
   The op name came from the caller, so it renders quoted."
  [idx op-name detail]
  (if (nil? op-name)
    (message/msg ["op %d: %s"] idx detail)
    (message/msg ["op %d (%s): %s"] idx op-name detail)))

(defn op-error!
  "Throw a teaching error attributing `detail`, a message, to the op at `idx` named `op-name`."
  [idx op-name detail]
  (common/throw-teaching-error (op-message idx op-name detail)))

(defn error-message
  "The teaching message for compiler error `data`, as read by [[dashboard-ops/error-data]].
   An error with no `:op-index` has no op prefix."
  [{code ::dashboard-ops/error :keys [op-index op-name] :as data}]
  (let [detail-fn (or (get details code)
                      (throw (ex-info (str "No MCP wording for dashboard op error " code) {:code code})))
        detail    (detail-fn data)]
    (if op-index
      (op-message op-index op-name detail)
      ;; A bare raw message renders quoted, so wrap it to keep it as text.
      (message/msg ["%s"] detail))))

(defn compile-ops
  "Runs [[dashboard-ops/compile-ops]] and rethrows its errors as MCP teaching errors.
   Each teaching error keeps the compiler's error as its cause.
   Other exceptions pass through unchanged."
  [current ops cards]
  (try
    (dashboard-ops/compile-ops current ops cards)
    (catch clojure.lang.ExceptionInfo e
      (throw (if-let [data (dashboard-ops/error-data e)]
               (common/message-ex-info (error-message data) {:status-code 400} e)
               e)))))
