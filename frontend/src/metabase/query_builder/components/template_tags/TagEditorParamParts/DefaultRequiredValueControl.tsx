import { t } from "ttag";
import _ from "underscore";

import { RequiredParamToggle } from "metabase/parameters/components/RequiredParamToggle";
import { Flex, Text } from "metabase/ui";
import type { Parameter, TemplateTag } from "metabase-types/api";

import {
  ContainerLabel,
  DefaultParameterValueWidget,
  ErrorSpan,
} from "./TagEditorParam.styled";

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
  // We want to remove "default" and "required" so that it
  // doesn't show up in the default value input update button
  const parameterAmended = _.omit(
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
        },
    "default",
    "required",
  );

  return (
    <div>
      <ContainerLabel>
        {t`Default filter widget value`}
        {!tag.default && tag.required && <ErrorSpan>({t`required`})</ErrorSpan>}
      </ContainerLabel>

      <Flex gap="xs" direction="column">
        <DefaultParameterValueWidget
          parameter={parameterAmended}
          value={tag.default}
          setValue={onChangeDefaultValue}
          isEditing
          commitImmediately
          mimicMantine
        />

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
