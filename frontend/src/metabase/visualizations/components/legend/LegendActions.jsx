import PropTypes from "prop-types";

import { LegendActionsRoot } from "metabase/visualizations/components/legend/LegendActions.styled";

const propTypes = {
  children: PropTypes.node,
};

export const LegendActions = ({ children }) => {
  return <LegendActionsRoot>{children}</LegendActionsRoot>;
};

LegendActions.propTypes = propTypes;
