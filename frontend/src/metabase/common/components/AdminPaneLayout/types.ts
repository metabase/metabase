import type { ReactNode } from "react";

export type AdminPaneProps = {
  title?: React.ReactNode;
  description?: string;
  buttonText?: string;
  buttonAction?: () => void;
  buttonDisabled?: boolean;
  buttonLink?: string;
  headingContent?: ReactNode;
};
