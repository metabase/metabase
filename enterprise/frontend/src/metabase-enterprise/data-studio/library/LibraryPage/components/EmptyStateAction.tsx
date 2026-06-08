import { ForwardRefLink } from "metabase/common/components/Link";
import type { EmptyStateData } from "metabase/data-studio/common/types";
import { Anchor } from "metabase/ui";

interface EmptyStateActionProps {
  data: EmptyStateData;
  onPublishTableClick: () => void;
}

export function EmptyStateAction({
  data,
  onPublishTableClick,
}: EmptyStateActionProps) {
  if (data.sectionType === "data") {
    return (
      <Anchor
        component="button"
        type="button"
        fz="inherit"
        onClick={(e) => {
          e.stopPropagation();
          onPublishTableClick();
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
