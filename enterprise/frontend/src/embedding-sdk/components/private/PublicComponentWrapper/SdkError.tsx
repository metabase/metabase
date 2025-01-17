import { jt } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import type { SdkErrorComponentProps } from "embedding-sdk/store/types";
import Alert from "metabase/core/components/Alert";
import { color } from "metabase/lib/colors";
import { Box, Center, Code } from "metabase/ui";

export const SdkError = ({ message }: SdkErrorComponentProps) => {
  const CustomError = useSdkSelector(getErrorComponent);

  const ErrorMessageComponent = CustomError || DefaultErrorMessage;

  return (
    <Center h="100%" w="100%" mx="auto">
      <ErrorMessageComponent message={message} />
    </Center>
  );
};

const FORCE_DARK_TEXT_COLOR = {
  // The Alert component has a light background, we need to force a dark text
  // color. The sdk aliases text-dark to the primary color, which in dark themes
  // is a light color, making the text un-readable
  "--mb-color-text-dark": color("text-dark"),
  "--mb-color-text-medium": color("text-medium"),
} as React.CSSProperties;

const DefaultErrorMessage = ({ message }: SdkErrorComponentProps) => (
  <Box p="sm" style={FORCE_DARK_TEXT_COLOR}>
    <Alert variant="error" icon="warning">
      {message}
    </Alert>
  </Box>
);

interface ResourceNotFoundErrorProps {
  id: string | number;
}
export function QuestionNotFoundError({ id }: ResourceNotFoundErrorProps) {
  return (
    <SdkError
      message={jt`Question ${(
        <Code
          bg="var(--mb-color-background-error-secondary)"
          c="var(--mb-color-text-medium)"
          key="question-id"
        >
          {id}
        </Code>
      )} not found. Make sure you pass the correct ID.`}
    />
  );
}

export function DashboardNotFoundError({ id }: ResourceNotFoundErrorProps) {
  return (
    <SdkError
      message={jt`Dashboard ${(
        <Code
          bg="var(--mb-color-background-error-secondary)"
          c="var(--mb-color-text-medium)"
          key="dashboard-id"
        >
          {id}
        </Code>
      )} not found. Make sure you pass the correct ID.`}
    />
  );
}
