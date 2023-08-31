import { t } from "ttag";
import type Question from "metabase-lib/Question";
import Dimension from "metabase-lib/Dimension";
import CheckBox from "metabase/core/components/CheckBox/CheckBox";
import { Box, Flex, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type Table from "metabase-lib/metadata/Table";
import type {
  ConcreteFieldReference,
  FieldDimension,
} from "metabase-types/api";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import StackedCheckBox from "metabase/components/StackedCheckBox/StackedCheckBox";

interface ColumnSetting {
  fieldRef: ConcreteFieldReference;
  enabled: boolean;
}

interface ChartSettingAddRemoveColumnsProps {
  question: Question;
  value: ColumnSetting[];
  onChange: (value: ColumnSetting[]) => void;
}

export const ChartSettingAddRemoveColumns = ({
  value,
  onChange,
  question,
}: ChartSettingAddRemoveColumnsProps) => {
  const query = question.query() as StructuredQuery;
  const options = query.fieldOptions();

  const getColumnSettingByDimension = (dimension: Dimension) => {
    return value.find(setting =>
      dimension.isSameBaseDimension(setting.fieldRef),
    );
  };

  const handleToggle = (dimension: Dimension) => {
    const index = value.findIndex(setting =>
      dimension.isSameBaseDimension(setting.fieldRef),
    );

    console.log(index);

    if (index >= 0) {
      console.log(value.toSpliced(index, 1));
      onChange(value.toSpliced(index, 1));
    } else {
      onChange([...value, { fieldRef: dimension.mbql(), enabled: true }]);
    }
  };

  const columnIsEnabled = (dimension: Dimension) => {
    return !!getColumnSettingByDimension(dimension);
  };

  const allColumnsEnabledForTable = (source: Table | Dimension) => {
    return source.dimensions().every(getColumnSettingByDimension);
  };

  const enableAllColumnsForTable = (source: Table | Dimension) => {
    const missingDimensions = source
      .dimensions()
      .filter(dimension => !getColumnSettingByDimension(dimension));

    onChange([
      ...value,
      ...missingDimensions.map(dimension => ({
        fieldRef: dimension.mbql(),
        enabled: true,
      })),
    ]);
  };

  const removeAllColumnsForTable = (source: Table | Dimension) => {
    const tableDimensions = source.dimensions();
    const remainingColumnSettings = value.filter(columnSetting => {
      const dimension = Dimension.parseMBQL(columnSetting.fieldRef);
      return !tableDimensions.some(td => td.isSameBaseDimension(dimension));
    });

    console.log(remainingColumnSettings);
    onChange(remainingColumnSettings);
  };

  const questionTable = question.table();

  if (!questionTable) {
    return null;
  }

  return (
    <div>
      <Text fz="lg" fw={700} mb="1rem">
        {questionTable.displayName()}
      </Text>
      <Box mb="0.75rem">
        {allColumnsEnabledForTable(questionTable) ? (
          <StackedCheckBox
            label={<Text fw={700} ml="0.75rem">{t`Remove all`}</Text>}
            checked={true}
            onClick={() => removeAllColumnsForTable(questionTable)}
          />
        ) : (
          <StackedCheckBox
            label={<Text fw={700} ml="0.75rem">{t`Select all`}</Text>}
            checked={false}
            onClick={() => enableAllColumnsForTable(questionTable)}
          />
        )}
      </Box>
      {options.dimensions.map(dimension => (
        <Box mb="1rem">
          <CheckBox
            label={
              <Flex ml="0.75rem" align="center">
                <Icon name={dimension.field().icon()}></Icon>
                <Text span ml="0.75rem">
                  {dimension.displayName()}
                </Text>
              </Flex>
            }
            checked={columnIsEnabled(dimension)}
            onClick={() => handleToggle(dimension)}
          />
        </Box>
      ))}

      {options.fks.map(fk => {
        const fkTable = fk.dimensions[0].field().table;
        const fkDimension = fk.dimension;
        if (!fkTable || !fkDimension) {
          return null;
        }

        return (
          <>
            <Text fz="lg" fw={700} mb="1rem">
              {fkTable.displayName()}
            </Text>
            <Box mb="0.75rem">
              {allColumnsEnabledForTable(fkDimension) ? (
                <StackedCheckBox
                  label={<Text fw={700} ml="0.75rem">{t`Remove all`}</Text>}
                  checked={true}
                  onClick={() => removeAllColumnsForTable(fkDimension)}
                />
              ) : (
                <StackedCheckBox
                  label={<Text fw={700} ml="0.75rem">{t`Select all`}</Text>}
                  checked={false}
                  onClick={() => enableAllColumnsForTable(fkDimension)}
                />
              )}
            </Box>
            {fk.dimensions.map(dimension => (
              <Box mb="1rem">
                <CheckBox
                  label={
                    <Flex ml="0.75rem" align="center">
                      <Icon name={dimension.field().icon()}></Icon>
                      <Text span ml="0.75rem">
                        {dimension.displayName()}
                      </Text>
                    </Flex>
                  }
                  checked={columnIsEnabled(dimension)}
                  onClick={() => handleToggle(dimension)}
                />
              </Box>
            ))}
          </>
        );
      })}
    </div>
  );
};
