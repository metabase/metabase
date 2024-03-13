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

export const combineColumnsDrill: Drill<Lib.CombineColumnsDrillThruInfo> = ({
  query,
  stageIndex,
  drill,
  drillInfo,
  applyDrill,
}) => {
  const options = drillInfo.availableColumns.map(column => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return { label: info.displayName, value: column as unknown as string };
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
                  value={column as unknown as string}
                  onChange={column => {
                    handleChange(index, {
                      column: column as unknown as Lib.ColumnMetadata,
                    });
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
