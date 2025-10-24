import type { ReactNode } from "react";

type TransformLayoutProps = {
  children?: ReactNode;
};

export function TransformLayout({ children }: TransformLayoutProps) {
  return <>{children}</>;
}
