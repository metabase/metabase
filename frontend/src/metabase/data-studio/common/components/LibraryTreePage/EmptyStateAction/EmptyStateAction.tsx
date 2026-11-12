import { ForwardRefLink } from "metabase/common/components/Link";
import type { EmptyStateData } from "metabase/data-studio/common/types";
import { Anchor } from "metabase/ui";

interface EmptyStateActionProps {
  data: EmptyStateData;
  onClick?: () => void;
}

export function EmptyStateAction({ data, onClick }: EmptyStateActionProps) {
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

  if (onClick) {
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

  return null;
}
