import PropTypes from "prop-types";

import EmptyState from "metabase/components/EmptyState";

import { EmptyStateRoot } from "./PermissionsEditorEmptyState.styled";

const propTypes = {
  icon: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
};

export const PermissionsEditorEmptyState = props => (
  <EmptyStateRoot>
    <EmptyState {...props} />
  </EmptyStateRoot>
);

PermissionsEditorEmptyState.propTypes = propTypes;
