import React from "react";
import { t } from "ttag";
import DatabaseAuthCodeDescription from "./components/DatabaseAuthCodeDescription";
import DatabaseClientIdDescription from "./components/DatabaseClientIdDescription";
import DatabaseSshDescription from "./components/DatabaseSshDescription";
import DatabaseSslKeyDescription from "./components/DatabaseSslKeyDescription";
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
  "auth-code": {
    description: <DatabaseAuthCodeDescription />,
  },
  "tunnel-private-key": {
    title: t`SSH private key`,
    placeholder: t`Paste the contents of your ssh private key here`,
    type: "text",
  },
  "tunnel-private-key-passphrase": {
    title: t`Passphrase for the SSH private key`,
  },
  "tunnel-auth-option": {
    title: t`SSH authentication`,
    options: [
      { name: t`SSH Key`, value: "ssh-key" },
      { name: t`Password`, value: "password" },
    ],
  },
  "ssl-cert": {
    title: t`Server SSL certificate chain`,
    placeholder: t`Paste the contents of the server's SSL certificate chain here`,
    type: "text",
  },
  "ssl-key-options": {
    description: <DatabaseSslKeyDescription />,
  },
  auto_run_queries: {
    name: "auto_run_queries",
  },
  refingerprint: {
    name: "refingerprint",
  },
};
