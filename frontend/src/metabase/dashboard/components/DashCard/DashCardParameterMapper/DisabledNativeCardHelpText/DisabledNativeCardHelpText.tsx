import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getDocsUrl, getLearnUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import type Question from "metabase-lib/v1/Question";
import {
  isDateParameter,
  isNumberParameter,
  isStringParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

import {
  NativeCardDefault,
  NativeCardIcon,
  NativeCardText,
  NativeCardLink,
} from "./DisabledNativeCardHelpText.styled";

interface DisabledNativeCardHelpTextProps {
  question: Question;
  parameter: Parameter;
}

export function DisabledNativeCardHelpText({
  question,
  parameter,
}: DisabledNativeCardHelpTextProps) {
  if (question.type() === "model") {
    return <ModelHelpText />;
  } else {
    return <ParameterHelpText parameter={parameter} />;
  }
}

function ModelHelpText() {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const learnUrl = getLearnUrl("data-modeling/models#skip-the-sql-variables");

  return (
    <NativeCardDefault>
      <NativeCardIcon name="info" />
      <NativeCardText>
        {t`Models are data sources and thus can’t have parameters mapped.`}
      </NativeCardText>
      {showMetabaseLinks && (
        <NativeCardLink href={learnUrl}>{t`Learn more`}</NativeCardLink>
      )}
    </NativeCardDefault>
  );
}

interface ParameterHelpTextProps {
  parameter: Parameter;
}

function ParameterHelpText({ parameter }: ParameterHelpTextProps) {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const docsUrl = useSelector(state =>
    getDocsUrl(state, { page: "questions/native-editor/sql-parameters" }),
  );

  return (
    <NativeCardDefault>
      <NativeCardIcon name="info" />
      <NativeCardText>{getParameterHelpText(parameter)}</NativeCardText>
      {showMetabaseLinks && (
        <NativeCardLink href={docsUrl}>{t`Learn how`}</NativeCardLink>
      )}
    </NativeCardDefault>
  );
}

export function getParameterHelpText(parameter: Parameter) {
  if (isDateParameter(parameter)) {
    return t`A date variable in this card can only be connected to a time type with the single date option.`;
  }

  if (isNumberParameter(parameter)) {
    return t`A number variable in this card can only be connected to a number filter with Equal to operator.`;
  }

  if (isStringParameter(parameter)) {
    return t`A text variable in this card can only be connected to a text filter with Is operator.`;
  }

  return t`Add a variable to this question to connect it to a dashboard filter.`;
}
