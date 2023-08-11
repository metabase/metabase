import { t } from "ttag";

import {
  ErrorViewProps,
  ErrorView as VisualizationErrorView,
} from "metabase/visualizations/components/Visualization";

export const ErrorView = ({ icon, isDashboard, isSmall }: ErrorViewProps) => (
  <VisualizationErrorView
    error={t`Unable to combine these questions`}
    icon={icon}
    isDashboard={isDashboard}
    isSmall={isSmall}
  />
);
