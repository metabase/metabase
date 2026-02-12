import type { ReactNode } from "react";

import { EmptyState } from "metabase/common/components/EmptyState";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import type { IconName } from "metabase/ui";

/*
 * AdminAwareEmptyState is a component that can
 *  1) Produce a custom message for admins in empty results
 */

interface AdminAwareEmptyStateProps {
  title?: ReactNode;
  message?: ReactNode;
  adminMessage?: ReactNode;
  icon?: IconName;
  image?: string;
  action?: ReactNode;
  adminAction?: ReactNode;
  link?: string;
  adminLink?: string;
  onActionClick?: () => void;
}

export const AdminAwareEmptyState = ({
  title,
  message,
  adminMessage,
  icon,
  image,
  action,
  adminAction,
  link,
  adminLink,
  onActionClick,
}: AdminAwareEmptyStateProps) => {
  const user = useSelector(getUser);
  const isSuperuser = user?.is_superuser;

  return (
    <EmptyState
      title={title}
      message={isSuperuser ? adminMessage || message : message}
      icon={icon}
      image={image}
      action={isSuperuser ? adminAction || action : action}
      link={isSuperuser ? adminLink || link : link}
      onActionClick={onActionClick}
    />
  );
};
