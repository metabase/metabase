import { t } from "ttag";

import type {
  McpServerAuthStrategy,
  McpServerProvider,
} from "metabase-types/api";

export interface McpServerPreset {
  provider: McpServerProvider;
  label: string;
  name: string;
  url: string;
  auth_strategy: McpServerAuthStrategy;
}

export const getMcpServerPresets = (): McpServerPreset[] => [
  {
    provider: "notion",
    label: t`Notion`,
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    auth_strategy: "oauth",
  },
  {
    provider: "linear",
    label: t`Linear`,
    name: "Linear",
    url: "https://mcp.linear.app/mcp",
    auth_strategy: "oauth",
  },
  {
    provider: "custom",
    label: t`Custom server`,
    name: "",
    url: "",
    auth_strategy: "oauth",
  },
];

export const getAuthStrategyOptions = (): {
  value: McpServerAuthStrategy;
  label: string;
}[] => [
  { value: "oauth", label: t`OAuth (each person signs in themselves)` },
  { value: "header", label: t`Shared credential (API key header)` },
  { value: "none", label: t`No authentication` },
];

export const getAuthStrategyLabel = (strategy: McpServerAuthStrategy) => {
  switch (strategy) {
    case "oauth":
      return t`OAuth`;
    case "header":
      return t`Shared credential`;
    case "none":
      return t`No auth`;
  }
};
