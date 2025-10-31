import type { ReactNode } from "react";

type BenchLayoutProps = {
  children?: ReactNode;
};

export function BenchLayout({ children }: BenchLayoutProps) {
  return <div>{children}</div>;
}
