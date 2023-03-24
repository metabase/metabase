import { HTMLAttributes } from "react";

export interface SharedChartSkeletonProps
  extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
  isStatic?: boolean;
}
