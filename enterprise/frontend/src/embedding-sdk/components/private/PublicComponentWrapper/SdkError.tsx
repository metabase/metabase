import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import type { SdkErrorComponentProps } from "embedding-sdk/store/types";
import { Center } from "metabase/ui";

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
  <div>
    <strong>{t`Error`}</strong>
    <div>{message}</div>
  </div>
);
