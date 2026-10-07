# Metabot tool definitions: records and protocols

Status: draft for review. Code is on `bot-2252-error-shape-protocols`.

This document proposes how to define a Metabot tool. It replaces the `deftool` macro
with a record that implements protocols.

The error-handling design is separate. See the Linear document
"Metabot tool layer: technical design". This document assumes it.

---

## 1. Summary

A tool is a record. The record implements the `Tool` protocol:

```clojure
(defprotocol Tool
  (declaration [this])        ; what the tool is
  (handle [this args ctx]))   ; what the tool does
```

`handle` does one unit of work. A tool that can also take several items at once adds `BatchedTool`:

```clojure
(defprotocol BatchedTool
  (batched-declaration [this declaration])  ; the single one in, a complete batched one out
  (batched-args        [this args])         ; batched args -> one args map per item
  (around-batch        [this item-args ctx run])
  (compose             [this entries ctx]))
```

`Tool` stays the single-item tool. Take `BatchedTool` away and the record still works: it reads one
URI, loads one id, edits one query. So `handle` **is** the item loader. There is no second per-item
function to keep in step with it.

A consumer calls `tools/call`. That function makes the single-or-batched decision, so no consumer
branches:

```clojure
(tools/call tool args ctx)          ; one item or several
(tools/call tool args ctx entry-fn) ; a consumer with its own error vocabulary
```

---

## 2. Why records, not a macro

### 2.1 Protocols give real extension points

`deftool` put every option in one map. To add a capability, you add a key. The runtime
then tests for that key. The test is `contains?`, so a typo reads as "this tool does
not want the capability".

A protocol is a type test instead. A tool either implements `BatchedTool` or it does
not. Clojure can see the difference. A reader can see the difference.

### 2.2 Explicit modeling: configuration is data, not a copy

Four tools in the codebase today are the same tool. `search`, `sql_search`,
`nlq_search` and `transform_search` share:

- the same scope (`agent-search`)
- the same title function (`search-display`)
- the same body: `(do-search label allowed-types opts args)`

They differ in five values: name, description, argument schema, allowed entity types,
and an options map.

Today that is four `mu/defn` forms with four copies of the same metadata. A reader
must compare them to find out that they match.

With a record it is one type and four instances. What varies is in the constructor
call. What is shared is in the record.

The `:description` also stops being a docstring. All four tools hardcode their
description today because a docstring cannot be computed.

### 2.3 Batched tools get a solution

Some tools do one thing per item. `read_resource` takes up to 5 URIs. `load_skill`
takes a list of skill ids. `list_available_fields` takes three lists of ids.

The single form is the tool. The batched form is an addition.

For everything that differs between the two forms, `BatchedTool` has a `batched-...` function. It
receives the single form and returns a **complete** batched form. The framework derives nothing, so
there are no special cases and no shape a tool cannot express.

Two things normally differ: the argument schema, and the description. Both are in the declaration,
so one pair of functions covers both.

These tools are plural for two unrelated reasons:

1. Latency. The agent asks for several things in one call.
2. Database load. The loader wants to read many rows at once.

The design separates them:

- The unit of partial failure is the **agent's request item**. It is the only unit.
- Batching is a **prefetch**. It runs before the per-item work and takes no part in
  control flow.

A prefetch failure fails the whole call. This is correct. A dead connection is one
fault. It is not five "not found" messages.

Because each item is loaded on its own, `load-item` can throw. A batch loader cannot:
it must report several failures at once, and an error constructor throws only one.

### 2.4 MCP can be layered on

MCP v2 has its own `deftool`. We do not propose to merge the two tool sets. Their
`search` tools have different arguments, modes, projections and paging.

We propose that a tool is **one concept** that either surface can consume. Three
changes make this possible.

**Text is a renderable, not a string.** MCP builds prose as `message/msg` records and
renders them at the boundary. It does this for locale and to keep untrusted text
separate. Metabot uses plain English strings.

```clojure
(defprotocol Renderable
  (render-text [this]))
```

`:output` holds a renderable. The consumer renders it. A string is the simple case.
Neither surface loses its text model.

**The declaration has a neutral core and namespaced extras.** `:name`,
`:description`, `:args` and `:scope` are neutral. Both surfaces need all four. MCP
tools already declare scopes from the same registry.

Everything else is namespaced for one consumer:

```clojure
{:name        "glossary"
 :description "Look up a business term."
 :args        [:map {:closed true} [:term {:optional true} [:maybe :string]]]
 :scope       scope/agent-content-read
 :metabot/title-fn (fn [{:keys [term]}] (or term "all terms"))
 :mcp/annotations  {:readOnlyHint true :idempotentHint true}}
```

A consumer reads its own namespace. It uses its own defaults for the rest.

**An error is data.** Each consumer maps a `ToolError` to its own wire format. On MCP
every class becomes `isError` content with a JSON-RPC code. MCP has no turn, so
`:unrecoverable` cannot end one.

A proof is in `two-consumers-spike-test`. One `GlossaryTool` record. Two consumers:
the Metabot runtime, and a 30-line sketch of an MCP adapter. The tool does not change.

Nothing in MCP must change now. The work keeps the option open.

### 2.5 Consumers get simpler

The runtime calls `handle`. It does not ask what kind of tool it has.

`BatchedTool` is a contract between a tool and `handle-each`. The tool reaches
`handle-each` from its own `handle`:

```clojure
;; in the runtime, and in any other consumer
(tools/call tool args ctx)
```

`tools/call` holds the one `satisfies?` test. Every consumer shares it, so no consumer branches and
no consumer repeats the orchestration. `tools/run-batched` and `tools/batched?` stay public for a
consumer that needs them for its own reasons.

An earlier design put the batching inside the handler, as a `for-items` call on itself. A tool was
then both the whole and the part.

---

## 3. Benefits and costs

### 3.1 Where things move

| Concern | Today | Proposed |
|---|---|---|
| Tool definition | `mu/defn` + var metadata | record + `Tool` protocol |
| Tool variants | duplicate `defn` forms | instances of one record |
| Error shaping | `try` + `handle-agent-error` in each tool | declared errors; runtime renders |
| Error text for the model | built in the tool | built in the runtime |
| Partial failure | blanket `(catch Exception e {:error (ex-message e)})` | `BatchedTool` + declared errors |
| Item count limit | hand-written check in the tool | the batched `:args` schema |
| Batched argument shape | written by hand | `batched-declaration`, composed by the tool |
| Model-facing description | Clojure docstring | `:description` field |
| Declaration extras | flat keys | namespaced per consumer |
| Result text | string | renderable |
| Scope check | wrapper function in `tools.clj` | runtime, from the declaration |
| Agent state | dynamic var | `ctx` |

### 3.2 How the modeling changes

**An error has a class. The class picks the audience.**

| Class | Who handles it | Model receives | User receives |
|---|---|---|---|
| `:validation` | the agent | the argument message | nothing |
| `:recoverable` | the agent | message + recovery steps | nothing |
| `:unrecoverable` | the user | a fixed sentence with the code | `:user-message` |

Recoverable is opt-in. Unrecoverable is the default. An error that nobody declared
ends the turn. No unauthored text reaches the model or the user.

**A recovery step names the tools it mentions.** The runtime drops a step when the
profile does not have those tools. One step per alternative path.

**The agent's request item is the only unit of partial failure.** Sub-item failures
belong to the item loader. Degraded results (for example, a search index that is
unavailable) are not failures.

**Composition decides where a failure appears.** A tool that formats per item puts
failures in position. A tool that builds one document has no positions, so it puts
them in a block.

### 3.3 Benefits

| Benefit | Evidence |
|---|---|
| Tool variants stop being copies | 4 search tools become 1 record + 4 instances |
| The runtime is smaller | no `satisfies?`, no `:decode` step, no scope wrapper |
| Errors cannot leak raw exception text | `render` asserts this in dev and test |
| One test covers every declared error | the catalog test; 46 pipeline errors included |
| A new pipeline error cannot silently end turns | the pipeline source scan test |
| A test double is a value | `reify Tool` with two methods |
| A batched tool's single form is testable | `(handle tool {:uri "..."} ctx)` with no batching |
| An item result is a complete result | `::item-result` is gone; `:output` is required as for any tool |
| MCP can consume a tool later | proved in `two-consumers-spike-test` |
| Partial failure reads the same as a whole failure | one `recoverable-text` function |

### 3.4 Costs

| Cost | Detail |
|---|---|
| Migration size | ~40 tools change shape. `deftool` was a mechanical swap; this is not. |
| Profiles change | `#'tools/search-tool` becomes an instance. |
| `declaration` repeats | A literal map per tool. More characters, by choice. |
| No docstring for the model | `clojure.repl/doc` on a tool gives the record type. |
| Protocols have no defaults | Each `BatchedTool` writes `(compose [_ es _] (concatenated es))`. |
| The declaration map is open | Needed for new consumers. A rule replaces the closed check: every key outside the core must be namespaced. |
| Composers own multi-line text | An entry's `:output` is multi-line when its failure keeps a recovery step. |
| Two schemas per batched tool | `declaration` and `batched-declaration` both define `:args`. Share the item schema through a var so they cannot drift. |
| Item limit messages get worse | See section 6. |
| Argument repair code is duplicated | `tools.runtime` and `self.core` both hold it until migration. |

---

## 4. Tool classes

Five classes. Each example is real code from the spike, with internals stubbed.

### 4.1 Mutation tool

One action. Three failures, three audiences.

```clojure
(defrecord EditSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name        "edit_sql_query"
     :description "Edit an existing SQL query using structured edits."
     :scope       scope/agent-sql-edit
     :args        [:map {:closed true}
                   [:query_id [:or :string :int]]
                   [:old_string :string]
                   [:new_string :string]]
     :metabot/capabilities #{:permission-write-sql-queries}})
  (handle [_ {:keys [query_id old_string new_string]} ctx]
    (let [queries  (get-in @(:memory-atom ctx) [:state :queries])
          query-id (str query_id)
          query    (or (get queries query-id)
                       (unknown-query-id! {:query-id  query-id
                                           :available (vec (sort (keys queries)))}))]
      (when (no-native-perms? (:database query))
        (tools.error/unrecoverable!
         ::no-native-query-permission
         {:user-message (tru "You don''t have permission to write SQL against this database.")}))
      (let [new-sql (apply-edit (:sql query) old_string new_string)]
        (when-let [parse-error (validate-sql new-sql)]
          (sql-syntax-error! parse-error))
        {:output            (format-result query-id new-sql)
         :structured-output {:query-id query-id :query-content new-sql}}))))
```

What is gone: the `try`, the `handle-agent-error` call, the `if valid?` branch that
returned a success-shaped failure, and the `:instructions` key.

Results:

```
unknown query id  -> "Query q7 is not in this conversation. Available query ids: q1, q2."
                     {:class :recoverable}
bad syntax        -> {:class :recoverable :code ::sql-syntax-error}
no SQL permission -> "This call failed and the user was shown the error (...). Don't retry it."
                     {:class :unrecoverable :user-message "You don't have permission ..."}
```

### 4.2 Single-query tool

One query. The result has one row or many. The cardinality does not matter. The query
matters.

```clojure
(defrecord GetTimelineDetailsTool []
  tools/Tool
  (declaration [_]
    {:name        "get_timeline_details"
     :description "Get the full details of a timeline including its events."
     :scope       scope/agent-timelines-read
     :args        [:map {:closed true} [:timeline_id pos-int?]]})
  (handle [_ {:keys [timeline_id]} _ctx]
    (let [timeline (tools/with-entity {:kind :timeline :id timeline_id}
                     (timeline/include-events-singular (timeline/get-timeline timeline_id)))]
      {:output (format "<timeline name=\"%s\">%s events</timeline>"
                       (:name timeline) (count (:events timeline)))})))
```

The whole tool is one converter. `with-entity` turns a 403 or a 404 into a declared
error. Every other exception ends the turn.

### 4.3 Single-query tool with variants

One record. Four instances.

```clojure
(defrecord SearchTool [tool-name description args allowed-types opts]
  tools/Tool
  (declaration [this]
    {:name        (:tool-name this)
     :description (:description this)
     :args        (:args this)
     :scope       scope/agent-search              ; shared by all four
     :metabot/title-fn search-display})           ; shared by all four
  (handle [this args _ctx]
    (do-search (:tool-name this) (:allowed-types this) (:opts this) args)))

(def search-tool
  (->SearchTool "search" "Find tables, models, metrics, dashboards ..."
                search-args
                #{"dashboard" "document" "metric" "model" "question" "table"}
                {}))

(def nlq-search-tool
  (->SearchTool "search" "Find NLQ-queryable data sources ..."
                search-args
                #{"dashboard" "document" "metric" "model" "question" "table"}
                {:profile-id "nlq"}))

(def transform-search-tool
  (->SearchTool "search" "Find transforms, plus the tables and models around them."
                search-args
                #{"model" "table" "transform"}
                {:search-native-query true}))
```

The same pattern applies to `create_sql_query` (two variants, one flag apart). It
applies less well to `construct_notebook_query`, whose two variants have different
schemas and different bodies.

### 4.4 Batched tool, ordinary composition

The single form is a complete tool. The batched form adds four one-line functions.

```clojure
(def ^:private skill-id-schema [:string {:description "A skill id."}])

(defrecord LoadSkillTool []
  tools/Tool
  (declaration [_]
    {:name        "load_skill"
     :description "Load the full instructions for one skill."
     :args        [:map {:closed true} [:id skill-id-schema]]})
  (handle [_ {:keys [id]} _ctx]
    {:output (skill-body id)})

  tools/BatchedTool
  (batched-declaration [_ declared]
    (-> declared
        (assoc :description "Load the full instructions for one or more skills.")
        (assoc :args [:map {:closed true} [:ids [:sequential {:min 1} skill-id-schema]]])))
  (batched-args  [_ {:keys [ids]}] (mapv (fn [id] {:id id}) ids))
  (around-batch  [_ _item-args _ctx run] (run))
  (compose       [_ entries _ctx] (tools/concatenated entries)))
```

`concatenated` joins the outputs in order. It collects the structured outputs into a
vector. It concatenates the data parts. A failed item's text is in its own position.

The last two lines are the complete answer to Clojure's missing protocol defaults.
Write the delegation out. A reader then sees what the tool does without another hop.

Note the item schema in a var. Both declarations use it, so they cannot drift.

### 4.5 Batched tool, custom composition

`read_resource` needs its own composer for one reason: it emits a single title part
built from the items that loaded. That key is not per-item.

```clojure
(defrecord ReadResourceTool []
  tools/Tool
  (declaration [_]
    {:name        "read_resource"
     :description "Read detailed information about one Metabase resource via its URI."
     :scope       scope/agent-resource-read
     :args        [:map {:closed true} [:uri uri-schema]]})
  (handle [_ {:keys [uri]} _ctx]
    (if-not (str/starts-with? uri "metabase://")
      (unreadable-uri! {:uri uri})
      (tools/with-entity {:kind :table :id (uri->id uri)}
        {:output (format-table (fetch-table uri)) :structured-output (fetch-table uri)})))

  tools/BatchedTool
  (batched-declaration [_ declared]
    (-> declared
        (assoc :description
               (str "Read detailed information about Metabase resources via URI patterns. "
                    "Up to " max-uris " URIs may be requested in one call."))
        (assoc :args [:map {:closed true}
                      [:uris [:sequential {:min 1 :max max-uris} uri-schema]]])))
  (batched-args [_ {:keys [uris]}] (mapv (fn [uri] {:uri uri}) uris))
  (around-batch [_ item-args _ctx run]
    (prefetch-tables! (map :uri item-args))
    (run))
  (compose [_ entries _ctx]
    (cond-> {:output (wrap-each-in-element entries)}
      (seq (remove :failed? entries))
      (assoc :data-parts [(title-part (remove :failed? entries))]))))
```

Output:

```
<resources>
<resource uri="metabase://table/1">
<table name="orders">id, total</table>
</resource>
<resource uri="nope">
"nope" is not a Metabase resource URI.
Call `search` and feed a URI from its results back here.
</resource>
</resources>
```

The failure is inside the element for its own URI. This matches what the tool does
today through the `**Error:**` branch of `format-resources`.

Note that the batched `:args` is a list of **strings**, not a list of maps. The tool
composes the schema, so the wire format does not change. Nothing derives it.

### 4.5.1 Batched tool with heterogeneous items

Here the single schema goes in whole. This is the payoff of `batched-declaration`
receiving it.

```clojure
(defrecord LoadEntityTool []
  tools/Tool
  (declaration [_]
    {:name        "load_entity"
     :description "Get metadata for one table, model or metric."
     :args        [:map {:closed true}
                   [:kind [:enum "table" "model" "metric"]]
                   [:id :int]]})
  (handle [_ {:keys [kind id]} _ctx] ...)

  tools/BatchedTool
  (batched-declaration [_ declared]
    (-> declared
        (assoc :description "Get metadata for several tables, models or metrics.")
        (assoc :args [:map {:closed true}
                      [:items [:sequential {:min 1 :max 20} (:args declared)]]])))
  (batched-args [_ {:keys [items]}] (vec items))
  (around-batch [_ _item-args _ctx run] (run))
  (compose [_ entries _ctx] ...))
```

This replaces `list_available_fields`' three parallel id lists with one addressable
list. Each failure then names the item it belongs to. The current flat `:errors`
vector cannot: its only link to an id is that `safe-fetch` put the id in the sentence.

Its output is one document grouped by kind. There are no per-item positions, so its
failures go in a block.

### 4.6 What a composer sees

Every entry has the same shape:

```clojure
{:item              "metabase://table/9"
 :output            "Table 9 was not found. ..."   ; always a string
 :failed?           true                           ; always a boolean
 :error             {...}                          ; present when it failed
 :structured-output {...}}                         ; present when it loaded
```

A composer that joins outputs asks nothing. A composer that separates them asks a
boolean. There is no key to probe for.

---

## 5. Migration

Order of work:

1. Land the error foundation. Additive, no call sites change.
   Branch `bot-2252-error-shape`.
2. Agree this document.
3. Convert tools in groups. Each group is one PR.
   - Start with the variant families (`search`, `create_sql_query`). They shrink.
   - Then the batched tools (`read_resource`, `load_skill`, `list_available_fields`).
   - Then the rest.
4. Change the agent loop, the adapters and persistence. One PR.
5. Delete `handle-agent-error`, `handle-agent-or-api-error`, `state-dependent-tools`,
   `wrap-with-scope-check`, `concise-tool-error`, `terminal-error-message`.

Steps 1 and 5 are already specified in the Linear design document.

MCP is not in this plan. Add `:mcp/*` keys to a record when a tool must serve both
surfaces. Do that per tool, not as a project.

---

## 6. Open questions

### 6.1 A call where every item failed

Today the call succeeds. Its whole output is failure text. No `:error` is set.

Arguably the call should fail. But with which error? There is no code for "five items
were five different kinds of missing". A single code loses the attribution the agent
needs to retry.

Recorded as a test: `everything-failed-is-still-a-success-test`.

### 6.2 Item limits lose their teaching

`read_resource` says this today:

> Too many URIs provided (6). Please limit to 5 URIs maximum. Be more selective and
> focus on the most relevant items for the current task or fetch them in batches.

The batched `:args` schema says this:

> Invalid tool arguments: `uris` should have at most 5 elements; received an array.

The schema is the right home for the limit. The message is worse.
`list_available_fields` has the same problem.

The limit is now in the schema the tool composed itself, so an `:error/message` on that
entry is easy to add. That is the likely answer.

Options: an `:error/message` on the schema entry, or keep a declared error.

### 6.3 Degraded results

`search` runs several queries and merges them into one list. If the semantic engine is
down, the results are worse but usable. This is not a per-item failure and not a call
failure.

The Linear design document gives this as an example of a recoverable error. That would
fail the call. We think that is wrong. We have no model for it yet.

### 6.4 Open comment threads

Three threads on the Linear design document are unresolved and affect this work:

- Should an undeclared exception end the turn, or reach the model as a fixed sentence?
- Warehouse and driver error text (BOT-2280).
- The native-SQL permission denial. It is unrecoverable today, so the turn ends. MBQL
  may still be open to the agent, which would make it recoverable.

---

## 7. Status

| Branch | Content |
|---|---|
| `bot-2252-error-shape` | Error foundation. Additive. No call sites migrated. |
| `bot-2252-error-shape-phases` | Earlier API: `for-items` with an options map. Superseded. |
| `bot-2252-error-shape-protocols` | This proposal, plus two spike test namespaces. |

Delete the spike namespaces before merge:

- `metabase.metabot.tools.protocols-spike-test`
- `metabase.metabot.tools.two-consumers-spike-test`
