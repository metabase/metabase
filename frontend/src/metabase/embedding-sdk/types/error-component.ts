import type { JSX, ReactNode } from "react";

export type SdkErrorComponentProps = {
  type?: "relative" | "fixed";
  message: ReactNode;
  error?: Error;
  withCloseButton?: boolean;
  onClose?: () => void;
};

export type SdkErrorComponent = ({
  type,
  message,
  error,
}: SdkErrorComponentProps) => JSX.Element;
