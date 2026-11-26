import type { PrototypeDefinition } from "../types";

import { DbtCrossFactPrototype } from "./DbtCrossFactPrototype";

export const DBT_EXPLORATION_PROTOTYPES: PrototypeDefinition[] = [
  {
    id: "dbt-cross-fact-metric",
    name: "Metric across two fact tables",
    description:
      "Revenue per billable hour, with revenue on invoices and hours on time entries. A real dbt MetricFlow project on DuckDB; regenerate with project/run.sh.",
    group: "dbt exploration",
    Component: DbtCrossFactPrototype,
  },
];
