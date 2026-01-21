import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import { ColorRangeSelector } from "metabase/common/components/ColorRangeSelector";
import { ColorSelector } from "metabase/common/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Button,
  Select,
  Stack,
  Text,
} from "metabase/ui";

import { ChartSettingInputNumeric } from "../ChartSettingInputNumeric";
import { ChartSettingRadio } from "../ChartSettingRadio";

import { COLORS, COLOR_RANGES, DEFAULTS_BY_TYPE } from "./constants";
import { NUMBER_OPERATOR_NAMES } from "./get-operators";
import type {
  NumberFormattingOperator,
  NumberFormattingSetting,
} from "./types";

interface RuleEditorProps {
  rule: NumberFormattingSetting;
  isNew: boolean;
  onChange: (rule: NumberFormattingSetting) => void;
  onDone: () => void;
  onRemove: () => void;
}

const INPUT_CLASSNAME = cx(CS.mt1, CS.full);

export const RuleEditor = ({
  rule,
  isNew,
  onChange,
  onDone,
  onRemove,
}: RuleEditorProps) => {
  return (
    <Stack gap="1.5rem" px="2rem" py="1rem">
      <Box>
        <Text fw="bold" mb="sm">{t`Formatting style`}</Text>
        <ChartSettingRadio
          options={[
            { name: t`Single color`, value: "single" },
            { name: t`Color range`, value: "range" },
          ]}
          value={rule.type}
          onChange={(type) =>
            onChange(DEFAULTS_BY_TYPE[type as "single" | "range"])
          }
        />
      </Box>
      {rule.type === "single" ? (
        <>
          <Box>
            <Text fw="bold" mb="sm">{t`When the number…`}</Text>
            <Select<NumberFormattingOperator>
              comboboxProps={{ withinPortal: false }}
              value={rule.operator}
              onChange={(operator) => onChange({ ...rule, operator })}
              data={_.pairs(NUMBER_OPERATOR_NAMES).map(([value, label]) => ({
                value,
                label,
              }))}
              data-testid="conditional-formatting-value-operator-button"
            />
            <ChartSettingInputNumeric
              data-testid="conditional-formatting-value-input"
              className={INPUT_CLASSNAME}
              value={typeof rule.value === "number" ? rule.value : parseFloat(rule.value) || undefined}
              onChange={(value) =>
                onChange({ ...rule, value: value ?? "" })
              }
              placeholder="0"
            />
          </Box>
          <Box>
            <Text fw="bold" mb="sm">{t`…use this color:`}</Text>
            <ColorSelector
              data-testid="conditional-formatting-color-selector"
              value={rule.color}
              colors={COLORS}
              onChange={(color) => onChange({ ...rule, color })}
              withinPortal={false}
            />
          </Box>
        </>
      ) : rule.type === "range" ? (
        <>
          <Box>
            <Text fw="bold" mb="sm">{t`Colors`}</Text>
            <ColorRangeSelector
              value={rule.colors}
              onChange={(colors) => {
                onChange({ ...rule, colors });
              }}
              colors={COLORS}
              colorRanges={COLOR_RANGES}
              withinPortal={false}
            />
          </Box>
          <Box>
            <Text fw="bold" mb="sm">{t`Start the range at`}</Text>
            <ChartSettingInputNumeric
              className={INPUT_CLASSNAME}
              value={rule.min_value}
              onChange={(min_value) =>
                onChange({ ...rule, min_value: min_value ?? undefined })
              }
            />
          </Box>
          <Box>
            <Text fw="bold" mb="sm">{t`End the range at`}</Text>
            <ChartSettingInputNumeric
              className={INPUT_CLASSNAME}
              value={rule.max_value}
              onChange={(max_value) =>
                onChange({ ...rule, max_value: max_value ?? undefined })
              }
            />
          </Box>
        </>
      ) : null}
      <Box>
        <Button variant="filled" onClick={onDone}>
          {isNew ? t`Add rule` : t`Update rule`}
        </Button>
      </Box>
    </Stack>
  );
};
