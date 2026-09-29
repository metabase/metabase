(ns metabase.mcp.v2.recovery-hints
  "The v2 surface's recovery sentences for the shared representations pipeline's agent errors.

   The pipeline throws a bare statement of what went wrong plus structured `ex-data`; it does
   not know which tools the caller has. This namespace turns that `ex-data` into the message
   telling *this* surface's agent how to recover.

   Keep every sentence inside v2's own vocabulary — `browse_data`, `search`, numeric ids. An
   error key with no entry here yields no sentence, which is the intended failure mode: a
   missing hint reads as terse, a wrong one sends the agent at a tool it does not have."
  (:require
   [metabase.mcp.v2.message :as message]))

(set! *warn-on-reflection* true)

(defn- uri-hint
  "The `source-table:`-took-a-URI sentence, which varies by what the URI pointed at."
  [entity-type entity-id]
  ;; The pipeline matched the id as digits, so it parses and interpolates bare; anything else stays quoted.
  (let [id (or (parse-long (str entity-id)) entity-id)]
    (case entity-type
      "metric"
      (message/msg [(str "Metrics are aggregations, not sources. To use metric %s, put its base table's "
                         "numeric id into `source-table:` (find it via \"search\" or \"browse_data\") and "
                         "reference the metric by its numeric id: `aggregation: [[metric, {}, %s]]`.")]
                   id id)

      ("question" "model" "card")
      (message/msg [(str "To reference a saved question or model as a query source, put its bare "
                         "numeric id into `source-card:` — not a URI: `\"source-card\": %s`.")]
                   id)

      "table"
      (message/msg ["Use the bare numeric table id in `source-table:` — not a URI: `\"source-table\": %s`."]
                   id)

      (message/msg ["`source-table:` accepts a numeric table id; `source-card:` accepts a saved-card numeric id."]))))

(defn recovery-hint
  "The v2 recovery message for an agent error's `ex-data`, or nil when it has none."
  [{:keys [error entity-type entity-id]}]
  (case error
    :uri-in-source-table
    (uri-hint entity-type entity-id)

    (:unknown-table :unknown-table-id)
    ;; On the numeric-id surface both keys resolve the same way: list the tables and pick a
    ;; numeric id. (v1 keeps them separate because a portable-FK miss and a numeric-id miss want
    ;; different vocabulary; here both want the numeric id.)
    (message/msg [(str "Call \"browse_data\" with action \"list_tables\" to list available "
                       "tables with their numeric ids, then use one as \"source-table\".")])

    :ambiguous-table
    (message/msg [(str "Call \"browse_data\" with action \"list_tables\" for the database, "
                       "then retry with the numeric table id — it is never ambiguous.")])

    (:unknown-field :unknown-field-id)
    (message/msg [(str "Call \"browse_data\" with action \"get_fields\" for "
                       "the table to list its columns with their numeric ids.")])

    :ambiguous-fk
    (message/msg [(str "Call \"browse_data\" with action \"get_fields\" for the "
                       "source table to list the available foreign-key columns.")])

    :no-fk-path
    (message/msg [(str "If a metric relates to that table, call \"browse_data\" with action \"get_fields\" for the "
                       "table that owns the metric to read its dimensions, which give the exact `joins:` clause.")])

    (:unknown-card :unknown-card-id)
    (message/msg ["Find the question or model with \"search\" and put its bare numeric id into `source-card:`."])

    (:unknown-measure :unknown-measure-id)
    (message/msg [(str "Call \"browse_data\" with action \"get_fields\" for the table that "
                       "owns the measure and use the numeric id from its measures list.")])

    (:unknown-segment :unknown-segment-id)
    (message/msg [(str "Call \"browse_data\" with action \"get_fields\" for the table that "
                       "owns the segment and use the numeric id from its segments list.")])

    :unknown-database
    (message/msg [(str "Use a numeric table id in `source-table:` (from \"browse_data\" "
                       "action \"list_tables\"), which needs no database name at all.")])

    :missing-source-in-first-stage
    (message/msg ["`source-table:` takes a numeric table id; `source-card:` takes a saved-card numeric id."])

    nil))
