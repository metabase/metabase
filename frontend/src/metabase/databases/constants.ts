import { t } from "ttag";
import { EngineFieldOverride } from "./types";

export const FIELD_OVERRIDES: Record<string, EngineFieldOverride> = {
  "tunnel-enabled": {
    title: t`Use an SSH-tunnel`,
  },
};
