import { useState } from "react";
import { t } from "ttag";

import { Button, Card, Icon, Select, Stack, Title } from "metabase/ui";
import type {
  ClickActionPopoverProps,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";

type ColumnAndSeparator = { separator: string; column: Lib.ColumnMetadata };

const getInitialColumnAndSeparator = (
  drillInfo: Lib.CombineColumnsDrillThruInfo,
): ColumnAndSeparator => ({
  column: drillInfo.availableColumns[0],
  separator: drillInfo.defaultSeparator,
});

// hack due to Mantine Select being non-generic
const fromSelectValue = (value: string | null): Lib.ColumnMetadata => {
  return value as unknown as Lib.ColumnMetadata;
};

// hack due to Mantine Select being non-generic
const toSelectValue = (value: Lib.ColumnMetadata): string | null => {
  return value as unknown as string | null;
};

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  query,
  stageIndex,
  drill,
  drillInfo,
  applyDrill,
}) => {
  const options = drillInfo.availableColumns.map(column => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return { label: info.displayName, value: toSelectValue(column) };
  });

  const DrillPopover = ({ onClick }: ClickActionPopoverProps) => {
    const [columnsAndSeparators, setColumnsAndSeparators] = useState([
      getInitialColumnAndSeparator(drillInfo),
    ]);
    const [isUsingDefaultSeparator, setIsUsingDefaultSeparator] =
      useState(true);
    const canRemove = columnsAndSeparators.length > 1;

    const handleChange = (
      index: number,
      change: Partial<ColumnAndSeparator>,
    ) => {
      setColumnsAndSeparators(value => [
        ...value.slice(0, index),
        { ...value[index], ...change },
        ...value.slice(index + 1),
      ]);
    };

    const handleAdd = () => {
      setColumnsAndSeparators(value => [
        ...value,
        getInitialColumnAndSeparator(drillInfo),
      ]);
    };

    return (
      <Card px="lg">
        <Stack spacing="sm">
          <Title order={4}>{t`Combine with`}</Title>

          {columnsAndSeparators.map(({ column, separator }, index) => {
            if (isUsingDefaultSeparator) {
              return (
                <Select
                  key={index}
                  data={options}
                  value={toSelectValue(column)}
                  onChange={value => {
                    const column = fromSelectValue(value);
                    handleChange(index, { column });
                  }}
                />
              );
            }

            throw new Error("Implement me");
          })}
        </Stack>

        <Button
          leftIcon={<Icon name="add" />}
          variant="subtle"
          onClick={handleAdd}
        >
          Add another column
        </Button>
      </Card>
    );
  };

  return [
    {
      name: "combine",
      title: t`Combine columns`,
      section: "combine",
      icon: "add",
      buttonType: "horizontal",
      popover: DrillPopover,
    },
  ];
};
