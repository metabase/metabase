import React from "react";
import { t } from "ttag";
import DatabaseSshDescription from "./components/DatabaseSshDescription";
import { EngineFieldOverride } from "./types";

export const FIELD_OVERRIDES: Record<string, EngineFieldOverride> = {
  "tunnel-enabled": {
    title: t`Use an SSH-tunnel`,
    description: <DatabaseSshDescription />,
  },
};
