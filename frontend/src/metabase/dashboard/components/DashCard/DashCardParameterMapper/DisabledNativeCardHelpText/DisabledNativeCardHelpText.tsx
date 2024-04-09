import { t } from "ttag";

import { getNativeDashCardEmptyMappingText } from "metabase/dashboard/utils";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
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
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <NativeCardDefault>
      <NativeCardIcon name="info" />
      <NativeCardText>
        {getNativeDashCardEmptyMappingText(parameter)}
      </NativeCardText>
      {showMetabaseLinks && (
        <NativeCardLink
          href={MetabaseSettings.docsUrl(
            "questions/native-editor/sql-parameters",
          )}
        >{t`Learn how`}</NativeCardLink>
      )}
    </NativeCardDefault>
  );
}
