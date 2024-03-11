import type { Location } from "history";
import { PublicDashboard as InternalPublicDashboard } from "metabase/public/containers/PublicDashboard";
import type { Dashboard } from "metabase-types/api";
import type { SuperDuperEmbedOptions } from "metabase/public/components/EmbedFrame/types";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  getCardData,
  getDashboardComplete,
  getDraftParameterValues,
  getParameters,
  getParameterValues,
  getSelectedTabId,
  getSlowCards,
} from "metabase/dashboard/selectors";
import { useEffect } from "react";

export const PublicDashboard = ({
  uuid,
  embedOptions = {
    bordered: true,
    titled: true,
    theme: "transparent",
    hide_parameters: false,
    hide_download_button: false,
  },
  events,
}: {
  uuid: Dashboard["public_uuid"];
  location?: Location;
  embedOptions: SuperDuperEmbedOptions;
  events: Record<string, (...rest: unknown[]) => void>;
}) => {
  const { dashboard } = useSelector(state => ({
    dashboard: getDashboardComplete(state) as Dashboard | undefined,
  }));

  useEffect(() => {
    if (dashboard) {
      events.onDashboardLoad(dashboard);
    }
  }, [dashboard, events]);

  return (
    <InternalPublicDashboard
      uuid={uuid}
      embedOptions={embedOptions}
      parameterSelection={{}}
      hasAbsolutePositioning={false}
    />
  );
};
