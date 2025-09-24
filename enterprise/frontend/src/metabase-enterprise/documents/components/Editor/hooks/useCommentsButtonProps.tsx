import { t } from "ttag";

import Link from "metabase/common/components/Link";
import { Icon } from "metabase/ui";

interface CommentsButtonOptions {
  active: boolean;
  disabled: boolean;
  href: string;
  unresolvedCommentsCount: number;
}

export const useCommentsButtonProps = ({
  active,
  disabled,
  href,
  unresolvedCommentsCount,
}: CommentsButtonOptions) => {
  const hasUnresolvedComments = unresolvedCommentsCount > 0;
  return {
    ...(!disabled
      ? {
          component: Link,
          // If no existing unresolved comments comments, add query param to auto-open new comment form
          to: hasUnresolvedComments ? href : `${href}?new=true`,
        }
      : {}),
    disabled,
    leftSection: (
      <Icon name={hasUnresolvedComments ? "comment" : "add_comment"} />
    ),
    px: "sm",
    size: "xs",
    bd: 0,
    "aria-label": t`Comments`,
    variant: active ? "filled" : "default",
    children: hasUnresolvedComments ? unresolvedCommentsCount : null,
  };
};
