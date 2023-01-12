import styled from "@emotion/styled";

import Radio from "metabase/core/components/Radio";
import BaseTabPanel from "metabase/core/components/TabPanel";

import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const RootLayout = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;

  padding: 3rem 4rem;
  min-height: 90vh;
`;

export const ModelMain = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;

  padding-right: 3rem;
`;

export const TabList = styled(Radio)`
  margin: 1rem 0;
  border-bottom: 1px solid ${color("border")};
`;

TabList.defaultProps = { variant: "underlined" };

export const TabPanel = styled(BaseTabPanel)`
  display: flex;
  flex-direction: column;
`;

export const NarrowTabPanel = styled(TabPanel)`
  width: 70%;

  ${breakpointMaxSmall} {
    width: 100%;
  }
`;

export const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;

  margin: 3rem 0;
`;

export const EmptyStateTitle = styled.span`
  display: block;
  color: ${color("text-medium")};
  font-size: 1rem;
  line-height: 1.5rem;
  margin-bottom: 1rem;
  text-align: center;
`;
