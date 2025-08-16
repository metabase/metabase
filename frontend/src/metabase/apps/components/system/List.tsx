import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import { useDataSource } from "metabase/apps/hooks/use-data-source";
import type {
  ComponentConfiguration,
  ComponentDefinition,
} from "metabase/apps/types";
import { Flex, Loader, Text } from "metabase/ui";

import { ComponentTreeNode } from "../ComponentTreeNode";

type Props = {
  configuration: ComponentConfiguration;
  componentContext: ComponentContext;
  component: ComponentDefinition;
};

export function ListSystemComponent({ configuration, component }: Props) {
  const dataSource = configuration.dataSources?.find(
    (dataSource) => dataSource.id === component.dataSourceId,
  );

  const { data, isLoading, error } = useDataSource(dataSource);

  if (!component.dataSourceId) {
    return <Text>{"Configure a data source to display data"}</Text>;
  }

  if (!component.children?.[0]) {
    return <Text>{"Configure a list component to display data"}</Text>;
  }

  if (isLoading || !data) {
    return <Loader />;
  }

  if (error) {
    return <Text c="error">{"Error: " + (error as any).message}</Text>;
  }

  const { cols, rows } = data.data;

  return (
    <Flex
      wrap={getComponentStyleValue(component, "wrap")}
      gap={getComponentStyleValue(component, "gap")}
      direction={getComponentStyleValue(component, "direction")}
      align={getComponentStyleValue(component, "align")}
      justify={getComponentStyleValue(component, "justify")}
    >
      {rows.map((row, index) => {
        const childContext = row.reduce(
          (acc, col, index) => {
            acc[cols[index].name] = col;
            return acc;
          },
          {} as Record<string, any>,
        );

        return (
          <ComponentTreeNode
            key={index}
            configuration={configuration}
            componentContext={{
              type: "tableRow",
              parameters: cols.map((col) => col.name),
              value: childContext,
            }}
            component={component.children![0]}
          />
        );
      })}
    </Flex>
  );
}
