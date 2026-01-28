import { useTranslateContent } from "metabase/i18n/hooks";
import { Stack, Text } from "metabase/ui";

import { getQuestionTitle } from "../QuestionTitle";
import { SdkInternalNavigationBackButton } from "../SdkInternalNavigation/SdkInternalNavigationBackButton";
import { useSdkQuestionContext } from "../SdkQuestion/context";

import type { SdkQuestionDefaultViewProps } from "./SdkQuestionDefaultView";

interface DefaultViewTitleTextProps
  extends Pick<SdkQuestionDefaultViewProps, "title"> {}

const DefaultViewTitleText = ({ title: Title }: DefaultViewTitleTextProps) => {
  return (
    <Stack gap="xs" align="flex-start">
      <SdkInternalNavigationBackButton
      // style={{ border: "1px solid green" }}
      />
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
    const titleText = tc(getQuestionTitle({ question }));

    return (
      <DefaultViewTitleText
        title={
          titleText && (
            <Text fw={700} c="text-primary" fz="xl">
              {titleText}
            </Text>
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
          <Text fw={700} c="text-primary" fz="xl">
            {titleText}
          </Text>
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
