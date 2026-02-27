import { useMemo } from "react";
import { t } from "ttag";

import { RequiredParamToggle } from "metabase/parameters/components/RequiredParamToggle";
import { Flex, Text } from "metabase/ui";
import { isDateParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter, TemplateTag } from "metabase-types/api";

import {
  ContainerLabel,
  DefaultParameterValueWidget,
  ErrorSpan,
} from "./TagEditorParam";

export function DefaultRequiredValueControl({
  tag,
  parameter,
  isEmbeddedDisabled,
  onChangeDefaultValue,
  onChangeRequired,
}: {
  tag: TemplateTag;
  parameter: Parameter;
  isEmbeddedDisabled: boolean;
  onChangeDefaultValue: (value: any) => void;
  onChangeRequired: (value: boolean) => void;
}) {
  const isMissing = tag.required && !tag.default;
  const parameterWithoutDefault = useMemo(
    () => ({ ...parameter, default: null }),
    [parameter],
  );

  const placeholder = isDateParameter(parameter)
    ? t`Select a default value…`
    : t`Enter a default value…`;

  return (
    <div>
      <ContainerLabel id={`default-value-label-${tag.id}`}>
        {getLabel(tag)}
        {isMissing && <ErrorSpan> ({t`required`})</ErrorSpan>}
      </ContainerLabel>

      <Flex gap="xs" direction="column">
        {parameter && (
          <div aria-labelledby={`default-value-label-${tag.id}`}>
            <DefaultParameterValueWidget
              parameter={parameterWithoutDefault}
              value={tag.default}
              setValue={onChangeDefaultValue}
              isEditing
              commitImmediately
              mimicMantine
              placeholder={placeholder}
            />
          </div>
        )}

        <RequiredParamToggle
          uniqueId={tag.id}
          disabled={isEmbeddedDisabled}
          value={tag.required ?? false}
          onChange={onChangeRequired}
          disabledTooltip={
            <>
              <Text lh={1.4}>
                {t`This filter is set to disabled in an embedded question.`}
              </Text>
              <Text lh={1.4}>
                {t`To always require a value, first visit embedding settings,
            make this filter editable or locked, re-publish the
            question, then return to this page.`}
              </Text>
              <Text size="sm">
                {t`Note`}:{" "}
                {t`making it locked, will require updating the
            embedding code before proceeding, otherwise the embed will
            break.`}
              </Text>
            </>
          }
        />
      </Flex>
    </div>
  );
}

function getLabel(tag: TemplateTag) {
  return tag.type === "temporal-unit"
    ? t`Default parameter widget value`
    : t`Default filter widget value`;
}
