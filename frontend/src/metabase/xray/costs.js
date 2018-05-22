/* Combinations of MaxQueryCost and MaxComputationCost values combined into
 * human understandable groupings.
 * for more info on the actual values see src/metabase/fingerprints/costs.clj
 */
import { t } from "c-3po";

const approximate = {
  display_name: t`Approximate`,
  description: t`
        Get a sense for this data by looking at a sample.
        This is faster but less precise.
    `,
  method: {
    max_query_cost: "sample",
    max_computation_cost: "linear",
  },
  icon: "costapproximate",
};

const exact = {
  display_name: t`Exact`,
  description: t`
        Go deeper into this data by performing a full scan.
        This is more precise but slower.
    `,
  method: {
    max_query_cost: "full-scan",
    max_computation_cost: "unbounded",
  },
  icon: "costexact",
};

const extended = {
  display_name: t`Extended`,
  description: t`
        Adds additional info about this entity by including related objects.
        This is the slowest but highest fidelity method.
    `,
  method: {
    max_query_cost: "joins",
    max_computation_cost: "unbounded",
  },
  icon: "costextended",
};

export default {
  approximate,
  exact,
  extended,
};
