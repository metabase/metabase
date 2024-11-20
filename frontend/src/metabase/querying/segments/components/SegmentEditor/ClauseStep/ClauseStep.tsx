import type { ReactNode } from "react";

type ClauseStepProps = {
  label: string;
  children?: ReactNode;
};

export function ClauseStep({ children }: ClauseStepProps) {
  return <div>{children}</div>;
}
