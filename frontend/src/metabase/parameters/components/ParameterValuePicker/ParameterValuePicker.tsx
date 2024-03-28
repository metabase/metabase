import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useDispatch } from "metabase/lib/redux";
import { fetchParameterValues } from "metabase/parameters/actions";
import { DefaultParameterValueWidget } from "metabase/query_builder/components/template_tags/TagEditorParamParts";
import { isDateParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter, TemplateTag } from "metabase-types/api";

import { ListPickerConnected } from "./ListPickerConnected";
import { OwnDatePicker } from "./OwnDatePicker";
import { ListPickerWrapper } from "./ParameterValuePicker.styled";
import { PlainValueInput } from "./PlainValueInput";
import {
  shouldUsePlainInput,
  shouldUseListPicker,
  getSingleStringOrNull,
} from "./core";

interface ParameterValuePickerProps {
  tag: TemplateTag;
  parameter: Parameter;
  value: any;
  onValueChange: (value: any) => void;
}

// TODO Add additional behaviors (metabase#40226)

/**
 * This component is designed to be controlled outside,
 * without keeping its own state.
 *
 * However, its decendats such as ListPickerValue, may have
 * their own state but will reset it based on props.
 *
 * NB! If something breaks here, you probably shouldn't revert anything,
 * and instead just make it render DefaultParameterValueWidget.
 */
export function ParameterValuePicker(props: ParameterValuePickerProps) {
  const { tag, parameter, value, onValueChange } = props;
  const dispatch = useDispatch();

  const fetchParamValues = useCallback(
    (query: string) => dispatch(fetchParameterValues({ parameter, query })),
    [parameter, dispatch],
  );

  if (!parameter) {
    return null;
  }

  if (shouldUsePlainInput(parameter)) {
    return (
      <PlainValueInput
        value={value}
        onChange={onValueChange}
        placeholder={t`Enter a default value…`}
      />
    );
  }

  if (isDateParameter(parameter)) {
    return (
      <OwnDatePicker
        value={value}
        parameter={parameter}
        onChange={onValueChange}
        placeholder={t`Select a default value…`}
      />
    );
  }

  if (shouldUseListPicker(parameter)) {
    return (
      // Wrapper is a hack to prevent 0.25rem added by mantine to its Select
      <ListPickerWrapper>
        <ListPickerConnected
          value={getSingleStringOrNull(value)}
          parameter={parameter}
          onChange={onValueChange}
          forceSearchItemCount={50}
          fetchValues={fetchParamValues}
        />
      </ListPickerWrapper>
    );
  }

  // The fallback
  return (
    <DefaultParameterValueWidget
      parameter={DEPRECATED_getAmendedParameter(tag, parameter)}
      value={value}
      setValue={onValueChange}
      isEditing
      commitImmediately
      mimicMantine
    />
  );
}

function DEPRECATED_getAmendedParameter(
  tag: TemplateTag,
  parameter: Parameter,
) {
  const amended =
    tag.type === "text" || tag.type === "dimension"
      ? parameter || {
          fields: [],
          ...tag,
          type: tag["widget-type"] || null,
        }
      : {
          fields: [],
          hasVariableTemplateTagTarget: true,
          type:
            tag["widget-type"] || (tag.type === "date" ? "date/single" : null),
        };

  // We want to remove "default" and "required" so that it
  // doesn't show up in the default value input icon
  return _.omit(amended, "default", "required");
}
