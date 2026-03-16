import type { ReactNode } from "react";

import { LegendActionsRoot } from "metabase/visualizations/components/legend/LegendActions.styled";

interface LegendActionsProps {
  children?: ReactNode;
}

export const LegendActions = ({ children }: LegendActionsProps) => {
  return <LegendActionsRoot>{children}</LegendActionsRoot>;
};
