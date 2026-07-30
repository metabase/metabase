import { t } from "ttag";

import { isCypressActive } from "metabase/env";

export const NAME_MAX_LENGTH = 254;

export const POLLING_INTERVAL = isCypressActive ? 200 : 3000;

export const FILTER_WIDGET_MIN_WIDTH = 300;
export const FILTER_WIDGET_MAX_HEIGHT = 400;

export const INSPECTOR_UPSELL_CAMPAIGN = "data-studio-transform-inspector";
export const INSPECTOR_UPSELL_LOCATION = "data-studio-transform-inspector-page";

export const SOURCE_STRATEGY_OPTIONS = [
  {
    value: "checkpoint",
    get label() {
      return t`Checkpoint`;
    },
  },
];

export const TARGET_STRATEGY_OPTIONS = [
  {
    value: "append" as const,
    get label() {
      return t`Append`;
    },
  },
];

export const STARTER_PYTHON_BODY = `# Write your Python transformation script here
import common
import pandas as pd

def transform():
    """
    Your transformation function.

    Select tables above to add them as function parameters.

    Returns:
        DataFrame to write to the destination table
    """
    # Your transformation logic here
    return pd.DataFrame([{"message": "Hello from Python transform!"}])`;

export const INGESTION_PYTHON_BODY = `# Fetch data from an external service and load it into the target table
import common
import pandas as pd
import dlt

def transform(secrets=None, state=None):
    """
    Your ingestion function.

    Args:
        secrets: credentials configured on this transform, keyed by name
        state:   only used to sync incrementally -- whatever you returned last
                 run, or None on the first run. Ignore it to refetch everything.

    Returns:
        the DataFrame to write, or (DataFrame, state) to sync incrementally
    """
    since = (state or {}).get("since")

    rows = [{"id": 1, "updated_at": "2026-01-01T00:00:00Z"}]
    df = pd.DataFrame(rows)

    # Return just df to refetch everything on every run. Returning state as well
    # resumes from where this run left off; pair that with a merge key on the
    # target so re-fetched rows update in place.
    next_since = df["updated_at"].max() if len(df) else since
    return df, {"since": next_since}`;
