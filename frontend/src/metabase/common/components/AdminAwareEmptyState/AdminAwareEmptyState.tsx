import type { ReactNode } from "react";

import { EmptyState } from "metabase/common/components/EmptyState";
import { connect } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import type { IconName } from "metabase/ui";
import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

/*
 * AdminAwareEmptyState is a component that can
 *  1) Produce a custom message for admins in empty results
 */

interface StateProps {
  user: User | null;
}

interface OwnProps {
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

type AdminAwareEmptyStateProps = StateProps & OwnProps;

const mapStateToProps = (state: State): StateProps => ({
  user: getUser(state),
});

const AdminAwareEmptyStateInner = ({
  user,
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

export const AdminAwareEmptyState = connect(mapStateToProps)(
  AdminAwareEmptyStateInner,
);
