import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FeatureOverviewContainer = styled.div`
  padding-top: ${space(3)};
  padding-left: ${space(2)};
  padding-right: ${space(2)};
`;

export const DatasetImg = styled.img`
  padding-top: ${space(2)};
`;

export const DatasetTitle = styled.h2`
  margin-top: ${space(3)};
  margin-bottom: ${space(2)};
`;

export const DatasetValueProp = styled.li`
  color: ${color("text-dark")};
  list-style-type: disc;
  margin-left: ${space(2)};
  padding-bottom: ${space(2)};
  font-size: 14;
  line-height: 22px;
`;
