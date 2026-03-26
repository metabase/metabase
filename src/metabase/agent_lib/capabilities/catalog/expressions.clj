(ns metabase.agent-lib.capabilities.catalog.expressions
  "Expression structured capability entries."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(def ^{:doc "Expression helper capability entries."}
  capabilities
  [{:op '+,                  :binding lib/+,                  :kind :nested, :group :expressions, :prompt-forms ["[\"+\", [\"field\", 201], [\"field\", 202]]"]}
   {:op '-,                  :binding lib/-,                  :kind :nested, :group :expressions, :prompt-forms ["[\"-\", [\"field\", 201], [\"field\", 202]]"]}
   {:op '*,                  :binding lib/*,                  :kind :nested, :group :expressions, :prompt-forms ["[\"*\", [\"field\", 201], [\"field\", 202]]"]}
   {:op '/,                  :binding lib//,                  :kind :nested, :group :expressions, :prompt-forms ["[\"/\", [\"field\", 201], [\"field\", 202]]"]}
   {:op 'case,               :binding lib/case,               :kind :nested, :group :expressions, :arities #{1 2}, :prompt-forms ["[\"case\", [[[\"<\", [\"field\", 201], 50], \"small\"], [[\"<\", [\"field\", 201], 200], \"medium\"]]]" "[\"case\", [[[\"<\", [\"field\", 201], 50], \"small\"], [[\"<\", [\"field\", 201], 200], \"medium\"]], \"large\"]"], :shape "[\"case\", [[condition, value], ...]] or [\"case\", [[condition, value], ...], fallback]", :example "[\"case\", [[[\"<\", [\"field\", 201], 50], \"small\"], [[\"<\", [\"field\", 201], 200], \"medium\"]], \"large\"]", :retry-shape "[\"case\", [[condition, value], ...]] or [\"case\", [[condition, value], ...], fallback]", :retry-example "[\"case\", [[[\"<\", [\"field\", 201], 50], \"small\"], [[\"<\", [\"field\", 201], 200], \"medium\"]], \"large\"]", :prompt-notes ["`case` uses the fallback value itself as the optional third argument. Do not wrap it in `{\"default\": ...}`." "If you want no else branch or a null result, omit the third `case` argument entirely."], :retry-notes ["Do not wrap the fallback in `{\"default\": ...}`." "Omit the third argument instead of using `null` when you want no else branch."]}
   {:op 'coalesce,           :binding lib/coalesce,           :kind :nested, :group :expressions, :prompt-forms ["[\"coalesce\", [\"field\", 101], [\"field\", 102]]"]}
   {:op 'concat,             :binding lib/concat,             :kind :nested, :group :expressions, :prompt-forms ["[\"concat\", [\"field\", 101], \" \", [\"field\", 102]]"]}
   {:op 'substring,          :binding lib/substring,          :kind :nested, :group :expressions, :prompt-forms ["[\"substring\", [\"field\", 101], 1, 3]"]}
   {:op 'replace,            :binding lib/replace,            :kind :nested, :group :expressions, :prompt-forms ["[\"replace\", [\"field\", 101], \"old\", \"new\"]"]}
   {:op 'upper,              :binding lib/upper,              :kind :nested, :group :expressions, :prompt-forms ["[\"upper\", [\"field\", 101]]"]}
   {:op 'lower,              :binding lib/lower,              :kind :nested, :group :expressions, :prompt-forms ["[\"lower\", [\"field\", 101]]"]}
   {:op 'trim,               :binding lib/trim,               :kind :nested, :group :expressions, :prompt-forms ["[\"trim\", [\"field\", 101]]"]}
   {:op 'ltrim,              :binding lib/ltrim,              :kind :nested, :group :expressions, :prompt-forms ["[\"ltrim\", [\"field\", 101]]"]}
   {:op 'rtrim,              :binding lib/rtrim,              :kind :nested, :group :expressions, :prompt-forms ["[\"rtrim\", [\"field\", 101]]"]}
   {:op 'length,             :binding lib/length,             :kind :nested, :group :expressions, :prompt-forms ["[\"length\", [\"field\", 101]]"]}
   {:op 'regex-match-first,  :binding lib/regex-match-first,  :kind :nested, :group :expressions, :prompt-forms ["[\"regex-match-first\", [\"field\", 101], \"pattern\"]"]}
   {:op 'split-part,         :binding lib/split-part,         :kind :nested, :group :expressions, :prompt-forms ["[\"split-part\", [\"field\", 101], \",\", 1]"]}
   {:op 'collate,            :binding lib/collate,            :kind :nested, :group :expressions, :prompt-forms ["[\"collate\", [\"field\", 101], \"case-insensitive\"]"]}
   {:op 'abs,                :binding lib/abs,                :kind :nested, :group :expressions, :prompt-forms ["[\"abs\", [\"field\", 201]]"]}
   {:op 'ceil,               :binding lib/ceil,               :kind :nested, :group :expressions, :prompt-forms ["[\"ceil\", [\"field\", 201]]"]}
   {:op 'floor,              :binding lib/floor,              :kind :nested, :group :expressions, :prompt-forms ["[\"floor\", [\"field\", 201]]"]}
   {:op 'round,              :binding lib/round,              :kind :nested, :group :expressions, :prompt-forms ["[\"round\", [\"field\", 201]]"]}
   {:op 'power,              :binding lib/power,              :kind :nested, :group :expressions, :prompt-forms ["[\"power\", [\"field\", 201], 2]"]}
   {:op 'sqrt,               :binding lib/sqrt,               :kind :nested, :group :expressions, :prompt-forms ["[\"sqrt\", [\"field\", 201]]"]}
   {:op 'log,                :binding lib/log,                :kind :nested, :group :expressions, :prompt-forms ["[\"log\", [\"field\", 201]]"]}
   {:op 'exp,                :binding lib/exp,                :kind :nested, :group :expressions, :prompt-forms ["[\"exp\", [\"field\", 201]]"]}
   {:op 'today,              :binding lib/today,              :kind :nested, :group :expressions, :arities #{0}, :prompt-forms ["[\"today\"]"]}
   {:op 'now,                :binding lib/now,                :kind :nested, :group :expressions, :arities #{0}, :prompt-forms ["[\"now\"]"]}
   {:op 'date,               :binding lib/date,               :kind :nested, :group :expressions, :prompt-forms ["[\"date\", \"2025-01-01\"]"]}
   {:op 'datetime,           :binding lib/datetime,           :kind :nested, :group :expressions, :prompt-forms ["[\"datetime\", \"2025-01-01T00:00:00\"]"]}
   {:op 'interval,           :binding lib/interval,           :kind :nested, :group :expressions, :prompt-forms ["[\"interval\", 7, \"day\"]"]}
   {:op 'time,               :binding lib/time,               :kind :nested, :group :expressions, :prompt-forms ["[\"time\", \"09:00\"]"]}
   {:op 'relative-datetime,  :binding lib/relative-datetime,  :kind :nested, :group :expressions, :prompt-forms ["[\"relative-datetime\", -7, \"day\"]"]}
   {:op 'absolute-datetime,  :binding lib/absolute-datetime,  :kind :nested, :group :expressions, :prompt-forms ["[\"absolute-datetime\", \"2025-01-01\", \"day\"]"], :shape "[\"absolute-datetime\", \"2024-01-01\", \"day\"]", :example "[\"absolute-datetime\", \"2024-01-01\", \"day\"]"}
   {:op 'datetime-add,       :binding lib/datetime-add,       :kind :nested, :group :expressions, :prompt-forms ["[\"datetime-add\", [\"field\", 302], 1, \"month\"]"]}
   {:op 'datetime-diff,      :binding (fn [x y unit] (lib/expression-clause :datetime-diff [x y unit] nil)), :kind :nested, :group :expressions, :prompt-forms ["[\"datetime-diff\", [\"field\", 302], [\"field\", 303], \"day\"]"], :shape "[\"datetime-diff\", [\"field\", 302], [\"field\", 303], \"day\"]", :example "[\"datetime-diff\", [\"field\", 302], [\"field\", 303], \"day\"]", :prompt-notes ["Use `datetime-diff` when you need the number of days, weeks, months, or other units between two temporal values." "Do not subtract dates with `-` when the goal is a time difference; use `datetime-diff` instead."]}
   {:op 'datetime-subtract,  :binding lib/datetime-subtract,  :kind :nested, :group :expressions, :prompt-forms ["[\"datetime-subtract\", [\"now\"], [\"field\", 302], \"day\"]"]}
   {:op 'get-year,           :binding lib/get-year,           :kind :nested, :group :expressions, :prompt-forms ["[\"get-year\", [\"field\", 302]]"]}
   {:op 'get-quarter,        :binding lib/get-quarter,        :kind :nested, :group :expressions, :prompt-forms ["[\"get-quarter\", [\"field\", 302]]"]}
   {:op 'get-month,          :binding lib/get-month,          :kind :nested, :group :expressions, :prompt-forms ["[\"get-month\", [\"field\", 302]]"]}
   {:op 'get-week,           :binding lib/get-week,           :kind :nested, :group :expressions, :prompt-forms ["[\"get-week\", [\"field\", 302]]"]}
   {:op 'get-day,            :binding lib/get-day,            :kind :nested, :group :expressions, :prompt-forms ["[\"get-day\", [\"field\", 302]]"]}
   {:op 'get-day-of-week,    :binding lib/get-day-of-week,    :kind :nested, :group :expressions, :prompt-forms ["[\"get-day-of-week\", [\"field\", 302]]"]}
   {:op 'get-hour,           :binding lib/get-hour,           :kind :nested, :group :expressions, :prompt-forms ["[\"get-hour\", [\"field\", 302]]"]}
   {:op 'get-minute,         :binding lib/get-minute,         :kind :nested, :group :expressions, :prompt-forms ["[\"get-minute\", [\"field\", 302]]"]}
   {:op 'get-second,         :binding lib/get-second,         :kind :nested, :group :expressions, :prompt-forms ["[\"get-second\", [\"field\", 302]]"]}
   {:op 'convert-timezone,   :binding lib/convert-timezone,   :kind :nested, :group :expressions, :prompt-forms ["[\"convert-timezone\", [\"field\", 302], \"UTC\", \"America/Los_Angeles\"]"]}
   {:op 'integer,            :binding lib/integer,            :kind :nested, :group :expressions, :prompt-forms ["[\"integer\", [\"field\", 201]]"]}
   {:op 'float,              :binding lib/float,              :kind :nested, :group :expressions, :prompt-forms ["[\"float\", [\"field\", 201]]"]}
   {:op 'text,               :binding lib/text,               :kind :nested, :group :expressions, :prompt-forms ["[\"text\", [\"field\", 101]]"]}
   {:op 'offset,             :binding lib/offset,             :kind :nested, :group :expressions, :prompt-forms ["[\"offset\", [\"sum\", [\"field\", 2056]], -1]"], :shape "[\"offset\", [\"sum\", [\"field\", 2056]], -1]", :example "[\"offset\", [\"sum\", [\"field\", 2056]], -1]", :prompt-notes ["`offset` is a windowed aggregation over an aggregation or expression." "For grouped previous-period metrics like \"previous month's total\", add `offset` as another `aggregate` in the same stage as the base aggregation and breakout." "Do not add `append-stage` just to calculate a previous-period total with `offset`."] :retry-shape "For previous-period grouped metrics, keep `offset` in the same grouped stage as the base aggregation and breakout." :retry-example (str "[\n" "  [\"aggregate\", [\"sum\", [\"field\", 2056]]],\n" "  [\"aggregate\", [\"offset\", [\"sum\", [\"field\", 2056]], -1]],\n" "  [\"breakout\", [\"with-temporal-bucket\", [\"field\", 2058], \"month\"]],\n" "  [\"order-by\", [\"asc\", [\"with-temporal-bucket\", [\"field\", 2058], \"month\"]]]\n" "]")}])
