import { ForwardRefLink } from "metabase/common/components/Link";
import type { EmptyStateData } from "metabase/data-studio/common/types";
import { Anchor } from "metabase/ui";

interface EmptyStateActionProps {
  data: EmptyStateData;
  onPublishTableClick: () => void;
  onNewDashboardClick: () => void;
}

export function EmptyStateAction({
  data,
  onPublishTableClick,
  onNewDashboardClick,
}: EmptyStateActionProps) {
  if (data.sectionType === "data" || data.sectionType === "dashboards") {
    const onClick =
      data.sectionType === "data" ? onPublishTableClick : onNewDashboardClick;
    return (
      <Anchor
        component="button"
        type="button"
        fz="inherit"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {data.actionLabel}
      </Anchor>
    );
  }

  if (data.actionUrl) {
    return (
      <Anchor
        component={ForwardRefLink}
        to={data.actionUrl}
        fz="inherit"
        onClick={(e) => e.stopPropagation()}
      >
        {data.actionLabel}
      </Anchor>
    );
  }

  return null;
}
