(ns metabase.agent-lib.capabilities.catalog.aggregation
  "Aggregation structured capability entries.

  Catalog entries are the source of truth for which operators agent-lib supports
  at runtime. The construct_notebook_query.md prompt is hand-curated guidance for
  the LLM and is not generated from this catalog — keep both in sync when adding
  or removing helpers."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(def capabilities
  "Aggregation helper capability entries."
  [{:op 'count,          :binding #'lib/count,          :kind :nested, :group :aggregation, :arities #{0}, :prompt-forms ["[\"count\"]"]}
   {:op 'sum,            :binding #'lib/sum,            :kind :nested, :group :aggregation, :prompt-forms ["[\"sum\", [\"field\", 201]]"], :prompt-notes ["Aggregation helpers take field refs like `[\"sum\", [\"field\", 201]]`. Do not pass bare numeric ids like `[\"sum\", 201]`."]}
   {:op 'avg,            :binding #'lib/avg,            :kind :nested, :group :aggregation, :prompt-forms ["[\"avg\", [\"field\", 201]]"]}
   {:op 'min,            :binding #'lib/min,            :kind :nested, :group :aggregation, :prompt-forms ["[\"min\", [\"field\", 201]]"]}
   {:op 'max,            :binding #'lib/max,            :kind :nested, :group :aggregation, :prompt-forms ["[\"max\", [\"field\", 201]]"]}
   {:op 'distinct,       :binding #'lib/distinct,       :kind :nested, :group :aggregation, :prompt-forms ["[\"distinct\", [\"field\", 201]]"]}
   {:op 'median,         :binding #'lib/median,         :kind :nested, :group :aggregation, :prompt-forms ["[\"median\", [\"field\", 201]]"]}
   {:op 'stddev,         :binding #'lib/stddev,         :kind :nested, :group :aggregation, :prompt-forms ["[\"stddev\", [\"field\", 201]]"]}
   {:op 'var,            :binding #'lib/var,            :kind :nested, :group :aggregation, :prompt-forms ["[\"var\", [\"field\", 201]]"]}
   {:op 'percentile,     :binding #'lib/percentile,     :kind :nested, :group :aggregation, :prompt-forms ["[\"percentile\", [\"field\", 201], 0.95]"]}
   {:op 'count-where,    :binding #'lib/count-where,    :kind :nested, :group :aggregation, :prompt-forms ["[\"count-where\", [\"=\", [\"field\", 101], \"completed\"]]"], :shape "[\"count-where\", clause]", :example "[\"count-where\", [\"=\", [\"field\", 2191], true]]"}
   {:op 'sum-where,      :binding #'lib/sum-where,      :kind :nested, :group :aggregation, :prompt-forms ["[\"sum-where\", [\"field\", 201], [\"=\", [\"field\", 101], \"completed\"]]"], :shape "[\"sum-where\", [\"field\", 2203], clause]", :example "[\"sum-where\", [\"field\", 2203], [\"=\", [\"field\", 2191], true]]"}
   {:op 'distinct-where, :binding #'lib/distinct-where, :kind :nested, :group :aggregation, :prompt-forms ["[\"distinct-where\", [\"field\", 201], [\"=\", [\"field\", 101], \"completed\"]]"], :shape "[\"distinct-where\", [\"field\", 2203], clause]", :example "[\"distinct-where\", [\"field\", 2203], [\"=\", [\"field\", 2191], true]]"}
   {:op 'share,          :binding #'lib/share,          :kind :nested, :group :aggregation, :prompt-forms ["[\"share\", [\"=\", [\"field\", 101], \"completed\"]]"], :shape "[\"share\", clause]", :example "[\"share\", [\"=\", [\"field\", 2191], true]]"}
   {:op 'cum-count,      :binding #'lib/cum-count,      :kind :nested, :group :aggregation, :prompt-forms ["[\"cum-count\"]"]}
   {:op 'cum-sum,        :binding #'lib/cum-sum,        :kind :nested, :group :aggregation, :prompt-forms ["[\"cum-sum\", [\"field\", 201]]"]}])
