import { t } from "ttag";

// import { useSdkSelector } from "embedding-sdk/store";
// import { getErrorComponent } from "embedding-sdk/store/selectors";

export type SdkErrorProps = { message: string };

let SdkError = ({ message }: SdkErrorProps) => {
  // const CustomError = useSdkSelector(getErrorComponent);

  // if (CustomError) {
  //   return <CustomError message={message} />;
  // }

  return (
    <div>
      <div>{t`Error`}</div>
      <div>{message}</div>
    </div>
  );
};

const setSdkErrorComponent = (
  Component: (({ message }: SdkErrorProps) => JSX.Element) | null,
) => {
  SdkError = Component ?? SdkError;
};

export { SdkError, setSdkErrorComponent };
