import { t } from "ttag";

import { useSdkSelector } from "embedding-sdk/store";
import { getErrorComponent } from "embedding-sdk/store/selectors";

export type SdkErrorProps = { message: string };

export const SdkError = ({ message }: SdkErrorProps) => {
  const CustomError = useSdkSelector(getErrorComponent);

  if (CustomError) {
    return <CustomError message={message} />;
  }

  return (
    <div>
      <div>{t`Error`}</div>
      <div>{message}</div>
    </div>
  );
};
