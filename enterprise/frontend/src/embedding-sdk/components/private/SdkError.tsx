import { t } from "ttag";

// TODO: Allow this component to be customizable by clients
export const SdkError = ({ message }: { message: string }) => {
  return (
    <div>
      <div>{t`Error`}</div>
      <div>{message}</div>
    </div>
  );
};
