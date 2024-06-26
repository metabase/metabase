import { useState, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetParameterValuesQuery,
  useSearchParameterValuesQuery,
} from "metabase/api";
import NumericInput from "metabase/core/components/NumericInput";
import CS from "metabase/css/core/index.css";
import { parseNumberValue } from "metabase/lib/number";
import { isNotNull } from "metabase/lib/types";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import {
  WidgetRoot,
  WidgetLabel,
  Footer,
  TokenFieldWrapper,
} from "metabase/parameters/components/widgets/Widget.styled";
import { MultiAutocomplete } from "metabase/ui";
import { getNonVirtualFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Parameter, ParameterValue } from "metabase-types/api";

export type NumberInputWidgetProps = {
  value: number[] | undefined;
  setValue: (value: number[] | undefined) => void;
  className?: string;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  parameter?: Parameter;
};

export function NumberInputWidget({
  value,
  setValue,
  className,
  arity = 1,
  infixText,
  autoFocus,
  placeholder = t`Enter a number`,
  label,
  parameter,
}: NumberInputWidgetProps) {
  const arrayValue = normalize(value);
  const [query, setQuery] = useState<string>("");
  const [unsavedArrayValue, setUnsavedArrayValue] =
    useState<(number | undefined)[]>(arrayValue);

  const allValuesUnset = unsavedArrayValue.every(_.isUndefined);
  const allValuesSet = unsavedArrayValue.every(_.isNumber);
  const isValid =
    (arity === "n" || unsavedArrayValue.length <= arity) &&
    (allValuesUnset || allValuesSet);

  const onClick = () => {
    if (isValid) {
      if (allValuesUnset || unsavedArrayValue.length === 0) {
        setValue(undefined);
      } else {
        setValue(unsavedArrayValue);
      }
    }
  };

  const filteredUnsavedArrayValue = useMemo(
    () => unsavedArrayValue.filter((x): x is number => x !== undefined),
    [unsavedArrayValue],
  );

  const { data } = useLoadParameterValues({
    parameter,
    query,
  });

  const options =
    data?.values
      .map(getOption)
      .filter((item): item is SelectItem => item !== null) ?? [];

  const valueOptions = unsavedArrayValue
    .map((value): SelectItem | null => {
      const option = parameter?.values_source_config?.values?.find(
        option => option[0]?.toString() === value?.toString(),
      );

      if (!option || typeof option[0] !== "string") {
        return null;
      }

      return {
        label: option[1],
        value: option[0].toString(),
      };
    })
    .filter(isNotNull);

  const customLabelOptions = options.filter(
    option => option.label !== option.value,
  );

  function parseValue(value: string | number | undefined): number | null {
    if (value === undefined) {
      return null;
    }

    const opt = options.find(option => {
      const label = option.label || option.value?.toString();
      return label === value?.toString();
    });

    if (opt) {
      return parseNumberValue(opt.value);
    }
    return parseNumberValue(value);
  }

  function shouldCreate(value: string | number) {
    const res = parseValue(value);
    return res !== null;
  }

  return (
    <WidgetRoot className={className}>
      {label && <WidgetLabel>{label}</WidgetLabel>}
      {arity === "n" ? (
        <TokenFieldWrapper>
          <MultiAutocomplete
            onSearchChange={setQuery}
            onChange={(values: string[]) =>
              setUnsavedArrayValue(
                values.map(value => parseValue(value) ?? undefined),
              )
            }
            value={filteredUnsavedArrayValue.map(value => value?.toString())}
            placeholder={placeholder}
            shouldCreate={shouldCreate}
            autoFocus={autoFocus}
            data={customLabelOptions.concat(valueOptions)}
          />
        </TokenFieldWrapper>
      ) : (
        _.times(arity, i => (
          <div key={i}>
            <NumericInput
              fullWidth
              className={CS.p1}
              autoFocus={autoFocus && i === 0}
              value={unsavedArrayValue[i]}
              onChange={newValue => {
                setUnsavedArrayValue(unsavedArrayValue => {
                  const newUnsavedValue = [...unsavedArrayValue];
                  newUnsavedValue[i] = newValue;
                  return newUnsavedValue;
                });
              }}
              placeholder={placeholder}
            />
            {infixText && i !== arity - 1 && (
              <span className={CS.px1}>{infixText}</span>
            )}
          </div>
        ))
      )}
      <Footer>
        <UpdateFilterButton
          value={value}
          unsavedValue={unsavedArrayValue}
          defaultValue={parameter?.default}
          isValueRequired={parameter?.required ?? false}
          isValid={isValid}
          onClick={onClick}
        />
      </Footer>
    </WidgetRoot>
  );
}

function normalize(value: number[] | undefined): (number | undefined)[] {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [];
  }
}

type SelectItem = {
  value: string;
  label: string | undefined;
};

function getOption(entry: ParameterValue): SelectItem | null {
  const tuple = Array.isArray(entry) ? entry : [entry];
  const value = tuple[0]?.toString();
  const label = tuple[1] ?? value;

  if (!value) {
    return null;
  }

  return { value, label };
}

function useLoadParameterValues({
  parameter,
  query,
}: {
  parameter: Parameter | undefined;
  query: string;
}) {
  const isSearch = parameter?.values_query_type === "search";

  const normalizedParameter = normalizeParameter(parameter);
  const field_ids = parameter
    ? getNonVirtualFields(parameter).map(field => Number(field.id))
    : [];

  const values = useGetParameterValuesQuery(
    {
      parameter: normalizedParameter,
      field_ids,
    },
    {
      skip: !parameter || isSearch,
    },
  );

  const searchValues = useSearchParameterValuesQuery(
    {
      parameter: normalizedParameter,
      field_ids,
      query,
    },
    {
      skip: !parameter || !isSearch || query === "",
    },
  );

  if (isSearch) {
    return searchValues;
  }
  return values;
}
