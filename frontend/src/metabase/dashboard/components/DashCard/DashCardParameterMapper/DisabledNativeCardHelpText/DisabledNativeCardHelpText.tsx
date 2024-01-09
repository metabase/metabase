import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { getNativeDashCardEmptyMappingText } from "metabase/dashboard/utils";
import type { Parameter } from "metabase-types/api";
import {
  NativeCardDefault,
  NativeCardIcon,
  NativeCardText,
  NativeCardLink,
} from "./DisabledNativeCardHelpText.styled";

interface DisabledNativeCardHelpTextProps {
  parameter: Parameter;
}

export function DisabledNativeCardHelpText({
  parameter,
}: DisabledNativeCardHelpTextProps) {
  return (
    <NativeCardDefault>
      <NativeCardIcon name="info" />
      <NativeCardText>
        {getNativeDashCardEmptyMappingText(parameter)}
      </NativeCardText>
      <NativeCardLink
        href={MetabaseSettings.docsUrl(
          "questions/native-editor/sql-parameters",
        )}
      >{t`Learn how`}</NativeCardLink>
    </NativeCardDefault>
  );
}
