import { getQuestionTitle } from "embedding-sdk-bundle/lib/sdk-question/get-question-title";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Stack, Title } from "metabase/ui";

import { useSdkQuestionContext } from "../SdkQuestion/context";

import type { SdkQuestionDefaultViewProps } from "./SdkQuestionDefaultView";

type DefaultViewTitleTextProps = Pick<SdkQuestionDefaultViewProps, "title">;

const DefaultViewTitleText = ({ title: Title }: DefaultViewTitleTextProps) => {
  return (
    <Stack gap="xs" align="flex-start">
      {typeof Title === "function" ? <Title></Title> : Title}
    </Stack>
  );
};

export const DefaultViewTitle = ({ title }: SdkQuestionDefaultViewProps) => {
  const { question } = useSdkQuestionContext();
  const tc = useTranslateContent();

  if (title === false) {
    return null;
  }

  if (title === undefined || title === true) {
    const titleText = getQuestionTitle(question, tc);

    if (titleText === null) {
      return null;
    }

    return (
      <DefaultViewTitleText
        title={
          titleText && (
            <Title c="text-primary" order={2}>
              {titleText}
            </Title>
          )
        }
      />
    );
  }

  if (typeof title === "string") {
    const titleText = tc(title);

    return (
      <DefaultViewTitleText
        title={
          <Title c="text-primary" order={2}>
            {titleText}
          </Title>
        }
      />
    );
  }

  if (typeof title === "function") {
    const CustomTitle = title;

    // TODO: pass in question={question} once we have the public-facing question type (metabase#50487)
    return <CustomTitle />;
  }

  return title;
};
