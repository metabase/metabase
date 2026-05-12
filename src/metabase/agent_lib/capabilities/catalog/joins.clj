(ns metabase.agent-lib.capabilities.catalog.joins
  "Join-related structured capability entries."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(def capabilities
  "Join helper capability entries."
  [{:op 'join-clause,          :binding #'lib/join-clause,          :kind :nested, :group :joins, :arities #{1}, :prompt-forms ["[\"join-clause\", [\"table\", 42]]" "[\"join-clause\", {\"type\": \"program\", \"program\": {...}}]"], :shape "[\"join-clause\", [\"table\", 133]]", :example "[\"join-clause\", [\"table\", 133]]"}
   {:op 'with-join-conditions, :binding #'lib/with-join-conditions, :kind :nested, :group :joins, :prompt-forms ["[\"with-join-conditions\", [\"join-clause\", [\"table\", 42]], [[\"=\", [\"field\", 101], [\"field\", 202]]]]"], :shape "[\"with-join-conditions\", [\"join-clause\", [\"table\", 133]], [[\"=\", [\"field\", 2456], [\"field\", 2488]]]]", :example "[\"with-join-conditions\", [\"join-clause\", [\"table\", 133]], [[\"=\", [\"field\", 2456], [\"field\", 2488]]]]", :prompt-notes ["If the source-table context already exposes the related table you need, prefer direct related-field refs first." "Direct related-field refs are the default for one-hop related tables." "Use `join-clause` and `with-join-conditions` when you need custom join behavior, a join alias, explicit joined-field selection, self-joins, or direct related-field refs are unavailable." "If an explicit join returns a permission error, the underlying table is not accessible — surface the error instead of retrying with implicit refs."]}
   {:op 'with-join-fields,     :binding #'lib/with-join-fields,     :kind :nested, :group :joins, :prompt-forms ["[\"with-join-fields\", join-clause, \"all\"]" "[\"with-join-fields\", join-clause, \"none\"]" "[\"with-join-fields\", join-clause, [[\"field\", 757]]]"], :shape "[\"with-join-fields\", join-clause, [[\"field\", 757]]]", :example "[\"with-join-fields\", [\"join-clause\", [\"table\", 133]], [[\"field\", 757]]]"}
   {:op 'with-join-strategy,   :binding #'lib/with-join-strategy,   :kind :nested, :group :joins, :prompt-forms ["[\"with-join-strategy\", join-clause, \"left-join\"]"], :shape "[\"with-join-strategy\", [\"join-clause\", [\"table\", 133]], \"left-join\"]", :example "[\"with-join-strategy\", [\"join-clause\", [\"table\", 133]], \"left-join\"]"}
   {:op 'with-join-alias,      :binding #'lib/with-join-alias,      :kind :nested, :group :joins, :prompt-forms ["[\"with-join-alias\", join-clause, \"alias\"]"]}])
