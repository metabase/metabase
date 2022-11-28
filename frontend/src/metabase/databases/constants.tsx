import React from "react";
import { t } from "ttag";
import DatabaseSshDescription from "./components/DatabaseSshDescription";
import DatabaseClientIdDescription from "./components/DatabaseClientIdDescription";
import { EngineFieldOverride } from "./types";

export const FIELD_OVERRIDES: Record<string, EngineFieldOverride> = {
  "tunnel-enabled": {
    title: t`Use an SSH-tunnel`,
    description: <DatabaseSshDescription />,
  },
  "use-jvm-timezone": {
    title: t`Use the Java Virtual Machine (JVM) timezone`,
    description: t`We suggest you leave this off unless you plan on doing a lot of manual timezone casting with this data.`,
  },
  "include-user-id-and-hash": {
    title: t`Include User ID and query hash in queries`,
    description: t`This can be useful for auditing and debugging, but prevents BigQuery from caching results and may increase your costs.`,
  },
  "use-srv": {
    title: t`Connect using DNS SRV`,
    description: t`If you're connecting to an Atlas cluster, you might need to turn this on. Note that your provided host must be a fully qualified domain name.`,
  },
  "client-id": {
    description: <DatabaseClientIdDescription />,
  },
};
