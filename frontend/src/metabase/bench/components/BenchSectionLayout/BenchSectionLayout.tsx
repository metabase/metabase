import type { ReactNode } from "react";

type BenchSectionLayoutProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function BenchSectionLayout({
  title,
  description,
  children,
}: BenchSectionLayoutProps) {
  return (
    <div>
      {title}
      {description}
      {children}
    </div>
  );
}
