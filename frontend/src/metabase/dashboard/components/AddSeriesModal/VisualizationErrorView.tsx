import { t } from "ttag";

import {
  ErrorView,
  ErrorViewProps,
} from "metabase/visualizations/components/Visualization";

export const VisualizationErrorView = ({
  icon,
  isDashboard,
  isSmall,
}: ErrorViewProps) => (
  <ErrorView
    error={t`Unable to combine these questions`}
    icon={icon}
    isDashboard={isDashboard}
    isSmall={isSmall}
  />
);
