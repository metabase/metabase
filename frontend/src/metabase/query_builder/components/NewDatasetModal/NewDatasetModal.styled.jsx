import React from "react";
import { PropTypes } from "prop-types";
import styled from "styled-components";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { t } from "ttag";

const FeatureOverviewContainer = styled.div`
  padding-top: ${space(3)};
  padding-left: ${space(2)};
  padding-right: ${space(2)};
`;

const DatasetImg = styled.img`
  padding-top: ${space(2)};
`;

const DatasetTitle = styled.h2`
  margin-top: ${space(3)};
  margin-bottom: ${space(2)};
`;

const DatasetValueProp = styled.li`
  color: ${color("text-dark")};
  list-style-type: disc;
  margin-left: ${space(2)};
  padding-bottom: ${space(2)};
  font-size: 14;
  line-height: 22px;
`;

DatasetFeatureOverview.propTypes = {
  icon: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export function DatasetFeatureOverview({ icon, children }) {
  return (
    <FeatureOverviewContainer>
      <DatasetImg src="app/img/dataset-illustration.svg" />
      <DatasetTitle>{t`Datasets`}</DatasetTitle>
      <ul>
        <DatasetValueProp>
          Let you update column descriptions and customize metadata to create
          great starting points for exploration.
        </DatasetValueProp>
        <DatasetValueProp>
          Show up higher in search results and get highlighted when other users
          start new questions to promote reuse.
        </DatasetValueProp>
        <DatasetValueProp>
          Live in collections to keep them separate from messy database schemas.
        </DatasetValueProp>
      </ul>
    </FeatureOverviewContainer>
  );
}

export const DatasetFeaturesContainer = styled.div`
  display: flex;
  justify-content: space-between;
`;
