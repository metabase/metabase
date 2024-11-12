import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import type { SdkErrorComponentProps } from "embedding-sdk/store/types";
import Alert from "metabase/core/components/Alert";
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

const DefaultErrorMessage = ({ message }: SdkErrorComponentProps) => (
  <Box p="sm">
    <Alert variant="error" icon="warning">
      {message}
    </Alert>
  </Box>
);
