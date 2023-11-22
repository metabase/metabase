import { t } from "ttag";
import { useAsyncFn, useMount } from "react-use";

import { useLegacyField } from "metabase/common/hooks/use-legacy-field";
import Fields from "metabase/entities/fields";
import { useDispatch } from "metabase/lib/redux";

import { Flex, Loader, Tooltip } from "metabase/ui";
import type { ColumnValuesWidgetProps } from "metabase/common/components/ColumnValuesWidget";
import { ColumnValuesWidget } from "metabase/common/components/ColumnValuesWidget";
import { Icon } from "metabase/core/components/Icon";

import * as Lib from "metabase-lib";

import { ColumnValuesWidgetLayout } from "./ColumnValuesWidgetLayout";
import { InlineCategoryValuesPicker } from "./InlineCategoryValuesPicker";

const ERROR_MESSAGE = t`There was an error loading the field values for this field`;
const MAX_INLINE_CATEGORIES = 12;

export function FilterValuesWidget<T extends string | number>({
  value,
  column,
  onChange,
  ...props
}: ColumnValuesWidgetProps<T>) {
  const dispatch = useDispatch();

  const [{ loading: isLoading, error: hasError }, fetchFieldValues] =
    useAsyncFn(id => dispatch(Fields.actions.fetchFieldValues({ id })));

  const field = useLegacyField(column);
  const fieldValues = field?.fieldValues() ?? [];

  useMount(() => {
    if (
      typeof field?.id === "number" &&
      field.has_field_values !== "none" &&
      !field?.hasFieldValues()
    ) {
      fetchFieldValues(field.id);
    }
  });

  if (isLoading) {
    return (
      <Flex align="center" h="100%">
        <Loader />
      </Flex>
    );
  }

  if (hasError) {
    return (
      <Flex align="center" h="100%">
        <Tooltip label={ERROR_MESSAGE}>
          <Icon name="warning" size={16} />
        </Tooltip>
      </Flex>
    );
  }

  if (fieldValues.length > 0 && fieldValues.length <= MAX_INLINE_CATEGORIES) {
    return (
      <InlineCategoryValuesPicker
        value={value}
        fieldValues={fieldValues}
        onChange={nextValues => {
          if (Lib.isNumeric(column)) {
            const formattedValues = nextValues.map(value => Number(value));
            onChange(formattedValues as T[]);
          } else {
            onChange(nextValues as T[]);
          }
        }}
      />
    );
  }

  return (
    <ColumnValuesWidget
      expand={false}
      disableList
      {...props}
      value={value}
      column={column}
      layoutRenderer={ColumnValuesWidgetLayout}
      onChange={onChange}
    />
  );
}
