import PropTypes from "prop-types";

import { EmptyState } from "metabase/common/components/EmptyState";

import S from "./PermissionsEditorEmptyState.module.css";

const propTypes = {
  icon: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
};

export const PermissionsEditorEmptyState = (props) => (
  <div className={S.EmptyStateRoot}>
    <EmptyState {...props} />
  </div>
);

PermissionsEditorEmptyState.propTypes = propTypes;
