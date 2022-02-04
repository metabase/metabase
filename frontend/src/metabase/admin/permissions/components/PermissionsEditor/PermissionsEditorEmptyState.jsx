import React from "react";
import PropTypes from "prop-types";
import { Flex } from "grid-styled";

import EmptyState from "metabase/components/EmptyState";

const propTypes = {
  icon: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
};

export const PermissionsEditorEmptyState = props => (
  <Flex alignItems="center" mx="auto">
    <EmptyState {...props} />
  </Flex>
);

PermissionsEditorEmptyState.propTypes = propTypes;
