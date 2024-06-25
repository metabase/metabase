import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";
import { Center } from "metabase/ui";

export type SdkErrorProps = { message: string; className?: string };

export const SdkError = ({ message, className }: SdkErrorProps) => {
  const CustomError = useSdkSelector(getErrorComponent);

  if (CustomError) {
    return <CustomError message={message} />;
  }

  return (
    <Center className={className} h="100%" w="100%" mx="auto">
      {CustomError || (
        <div>
          <div>{t`Error`}</div>
          <div>{message}</div>
        </div>
      )}
    </Center>
  );
};
