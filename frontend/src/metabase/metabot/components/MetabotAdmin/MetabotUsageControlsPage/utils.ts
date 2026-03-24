import { useState } from "react";
import { t } from "ttag";

import type { GroupInfo } from "metabase-types/api";

export type AIToolKey =
  | "metabot"
  | "semantic-search"
  | "sql-generation"
  | "nlq"
  | "other-tools";

// TODO: retrieve from the backend
export const useModelOptions = () => {
  return [
    { value: "default", label: t`Default` },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  ];
};

export const getAIToolItems = (): Array<{ key: AIToolKey; label: string }> => {
  return [
    { key: "metabot", label: t`Metabot` },
    { key: "semantic-search", label: t`Semantic search` },
    { key: "sql-generation", label: t`SQL generation` },
    { key: "nlq", label: t`NLQ` },
    { key: "other-tools", label: t`Other tools` },
  ];
};

// TODO: retrieve from the backend
export const useGroupToolsAccessMap = (groups: GroupInfo[]) => {
  const initialState = groups.reduce(
    (map, group) => {
      return {
        ...map,
        [group.id]: {
          metabot: true,
          "semantic-search": true,
          "sql-generation": true,
          nlq: true,
          "other-tools": true,
        },
      };
    },
    {} as Record<number, Record<AIToolKey, boolean>>,
  );
  const [groupToolsAccessMap, setGroupToolsAccessMap] = useState(initialState);
  const onToolAccessChange = (
    groupId: number,
    tool: AIToolKey,
    enabled: boolean,
  ) => {
    setGroupToolsAccessMap((prev) => ({
      ...prev,
      [groupId]: {
        ...prev[groupId],
        [tool]: enabled,
      },
    }));
  };

  return {
    groupToolsAccessMap,
    onToolAccessChange,
  };
};
