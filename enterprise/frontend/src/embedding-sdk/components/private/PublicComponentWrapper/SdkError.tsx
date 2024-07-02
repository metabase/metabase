import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import { Center } from "metabase/ui";

export type SdkErrorProps = { message: string };

export const SdkError = ({ message }: SdkErrorProps) => {
  const CustomError = useSdkSelector(getErrorComponent);

  const ErrorMessageComponent = CustomError || DefaultErrorMessage;

  return (
    <Center h="100%" w="100%" mx="auto">
      <ErrorMessageComponent message={message} />
    </Center>
  );
};

const DefaultErrorMessage = ({ message }: { message: string }) => (
  <div>
    <div>{t`Error`}</div>
    <div>{message}</div>
  </div>
);
