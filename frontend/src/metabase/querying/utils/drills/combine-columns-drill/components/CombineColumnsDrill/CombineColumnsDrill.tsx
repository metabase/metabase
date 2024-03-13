import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Card, Icon, Select, Stack, Title } from "metabase/ui";
import type * as Lib from "metabase-lib";

import {
  fromSelectValue,
  getColumnOptions,
  getInitialColumnAndSeparator,
  toSelectValue,
} from "./lib";
import type { ColumnAndSeparator } from "./types";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  drillInfo: Lib.CombineColumnsDrillThruInfo;
}

export const CombineColumnsDrill = ({
  query,
  stageIndex,
  drillInfo,
}: Props) => {
  const options = useMemo(() => {
    return getColumnOptions(query, stageIndex, drillInfo.availableColumns);
  }, [query, stageIndex, drillInfo.availableColumns]);

  const [columnsAndSeparators, setColumnsAndSeparators] = useState([
    getInitialColumnAndSeparator(drillInfo),
  ]);
  const [isUsingDefaultSeparator, setIsUsingDefaultSeparator] = useState(true);
  const canRemove = columnsAndSeparators.length > 1;

  const handleChange = (index: number, change: Partial<ColumnAndSeparator>) => {
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
