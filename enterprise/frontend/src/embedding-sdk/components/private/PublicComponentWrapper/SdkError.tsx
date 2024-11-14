import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import type { SdkErrorComponentProps } from "embedding-sdk/store/types";
import Alert from "metabase/core/components/Alert";
import { color } from "metabase/lib/colors";
import { Box, Center } from "metabase/ui";

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
} as React.CSSProperties;

const DefaultErrorMessage = ({ message }: SdkErrorComponentProps) => (
  <Box p="sm" style={FORCE_DARK_TEXT_COLOR}>
    <Alert variant="error" icon="warning">
      {message}
    </Alert>
  </Box>
);
