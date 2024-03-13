import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Card, Icon, Stack, Title } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { getColumnOptions, getInitialColumnAndSeparator } from "../../lib";
import type { ColumnAndSeparator } from "../../types";
import { ColumnAndSeparatorRow } from "../ColumnAndSeparatorRow";

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
  const { availableColumns, defaultSeparator } = drillInfo;
  const options = useMemo(() => {
    return getColumnOptions(query, stageIndex, availableColumns);
  }, [query, stageIndex, availableColumns]);

  const [columnsAndSeparators, setColumnsAndSeparators] = useState([
    getInitialColumnAndSeparator(drillInfo),
  ]);
  const [isUsingDefaultSeparator, setIsUsingDefaultSeparator] = useState(true);

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

  const handleEditSeparators = () => {
    setIsUsingDefaultSeparator(false);
  };

  return (
    <Card px="lg">
      <Stack spacing="sm">
        <Title order={4}>{t`Combine with`}</Title>

        {columnsAndSeparators.map(({ column, separator }, index) => (
          <ColumnAndSeparatorRow
            column={column}
            index={index}
            key={index}
            options={options}
            separator={separator}
            showLabels={index === 0 && !isUsingDefaultSeparator}
            showRemove={columnsAndSeparators.length > 1}
            showSeparator={!isUsingDefaultSeparator}
            onChange={handleChange}
          />
        ))}

        {isUsingDefaultSeparator && (
          <Button
            leftIcon={<Icon name="add" />}
            variant="subtle"
            onClick={handleEditSeparators}
          >
            Separated by{" "}
            {defaultSeparator === " " ? <>({t`space`})</> : defaultSeparator}
          </Button>
        )}
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
