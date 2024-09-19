import { Component } from "react";
import { connect } from "react-redux";

import EmptyState from "metabase/components/EmptyState";
import { getUser } from "metabase/selectors/user";
import type { IconName } from "metabase/ui";
import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

/*
 * AdminAwareEmptyState is a component that can
 *  1) Produce a custom message for admins in empty results
 */

interface AdminAwareEmptyStateProps {
  user: User | null;
  title: string;
  message: string;
  adminMessage?: string;
  icon?: IconName;
  image?: string;
  imageHeight?: number;
  imageClassName?: string;
  action?: string;
  adminAction?: string;
  link?: string;
  adminLink?: string;
  onActionClick?: () => void;
}

const mapStateToProps = (state: State) => ({
  user: getUser(state),
});

class AdminAwareEmptyStateInner extends Component<AdminAwareEmptyStateProps> {
  render() {
    const {
      user,
      title,
      message,
      adminMessage,
      icon,
      image,
      imageHeight,
      imageClassName,
      action,
      adminAction,
      link,
      adminLink,
      onActionClick,
    } = this.props;
    return (
      <EmptyState
        title={title}
        message={user && user.is_superuser ? adminMessage || message : message}
        icon={icon}
        image={image}
        action={user && user.is_superuser ? adminAction || action : action}
        link={user && user.is_superuser ? adminLink || link : link}
        imageHeight={imageHeight}
        imageClassName={imageClassName}
        onActionClick={onActionClick}
      />
    );
  }
}

const AdminAwareEmptyState = connect(
  mapStateToProps,
  null,
)(AdminAwareEmptyStateInner);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AdminAwareEmptyState;
