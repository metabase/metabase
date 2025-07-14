import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { RowValue } from "metabase-types/api";

import type { ComponentConfiguration } from "../types";

type Props = {
  component: ComponentConfiguration;
};

export type ComponentContext = {
  type: ComponentConfiguration["context"];
  parameters: string[];
  value: Record<string, RowValue>;
};

export function useComponentContext({ component }: Props): ComponentContext {
  const { data: adhocQuery } = useGetAdhocQueryQuery(
    {
      type: "query",
      database: 1,
      query: {
        "source-table": component.contextTableId
          ? Number(component.contextTableId)
          : -1,
        limit: 1,
      },
    },
    { skip: !component.contextTableId },
  );

  return useMemo(() => {
    if (!adhocQuery) {
      return {
        type: component.context,
        parameters: [],
        value: {},
      };
    }

    const { cols, rows } = adhocQuery.data;

    return {
      type: component.context,
      parameters: cols.map((col) => col.name),
      value: rows[0].reduce(
        (acc, value, index) => ({
          ...acc,
          [cols[index].name]: value,
        }),
        {} as Record<string, RowValue>,
      ),
    };
  }, [adhocQuery, component.context]);
}
