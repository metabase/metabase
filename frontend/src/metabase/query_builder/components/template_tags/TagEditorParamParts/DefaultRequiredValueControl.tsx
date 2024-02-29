import { t } from "ttag";
import _ from "underscore";

import { ParameterValuePicker } from "metabase/parameters/components/ParameterValuePicker";
import { RequiredParamToggle } from "metabase/parameters/components/RequiredParamToggle";
import { Flex, Text } from "metabase/ui";
import type { Parameter, TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan } from "./TagEditorParam.styled";

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

  return (
    <div>
      <ContainerLabel>
        {t`Default filter widget value`}
        {isMissing && <ErrorSpan>({t`required`})</ErrorSpan>}
      </ContainerLabel>

      <Flex gap="xs" direction="column">
        <ParameterValuePicker
          tag={tag}
          parameter={parameter}
          initialValue={tag.default}
          onValueChange={onChangeDefaultValue}
          placeholder={t`Enter a default value…`}
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
