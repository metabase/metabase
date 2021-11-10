import React from "react";
import { PropTypes } from "prop-types";
import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Icon from "metabase/components/Icon";

const FeatureOverviewContainer = styled.div`
  padding-right: ${space(1)};
`;

const FeatureIconContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  background-color: ${lighten(color("brand", 0.5))};
  width: 100px;
  height: 100px;
`;

const FeatureDescription = styled.p`
  color: ${color("text-dark")};
`;

DatasetFeatureOverview.propTypes = {
  icon: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export function DatasetFeatureOverview({ icon, children }) {
  return (
    <FeatureOverviewContainer>
      <FeatureIconContainer>
        <Icon name={icon} color={color("brand")} size={40} />
      </FeatureIconContainer>
      <FeatureDescription>{children}</FeatureDescription>
    </FeatureOverviewContainer>
  );
}

export const DatasetFeaturesContainer = styled.div`
  display: flex;
  justify-content: space-between;
`;
