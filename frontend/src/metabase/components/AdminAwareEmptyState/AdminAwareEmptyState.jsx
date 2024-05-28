/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import EmptyState from "metabase/components/EmptyState";
import { getUser } from "metabase/selectors/user";

/*
 * AdminAwareEmptyState is a component that can
 *  1) Produce a custom message for admins in empty results
 */

const mapStateToProps = (state, props) => ({
  user: getUser(state, props),
});

class AdminAwareEmptyStateInner extends Component {
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
      smallDescription = false,
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
        smallDescription={smallDescription}
      />
    );
  }
}

const AdminAwareEmptyState = connect(
  mapStateToProps,
  null,
)(AdminAwareEmptyStateInner);

export default AdminAwareEmptyState;
