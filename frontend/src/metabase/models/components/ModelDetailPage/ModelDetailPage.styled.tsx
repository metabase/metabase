import styled from "@emotion/styled";

import EditableText from "metabase/core/components/EditableText";
import Radio from "metabase/core/components/Radio";
import BaseTabPanel from "metabase/core/components/TabPanel";

import { color } from "metabase/lib/colors";

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

export const ModelTitle = styled(EditableText)`
  color: ${color("text-dark")};
  font-weight: 700;
  font-size: 1.25rem;
`;

export const ModelFootnote = styled.p`
  color: ${color("text-medium")};
  margin: 4px 0 0 4px;
`;

export const ModelHeader = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
`;

export const TabList = styled(Radio)`
  margin: 1rem 0;
`;

TabList.defaultProps = { variant: "underlined" };

export const TabPanel = styled(BaseTabPanel)`
  display: flex;
  flex-direction: column;
`;

export const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  margin-top: 3rem;
`;

export const EmptyStateTitle = styled.span`
  display: block;
  color: ${color("text-medium")};
  font-size: 1rem;
  line-height: 1.5rem;
  margin-bottom: 1rem;
  text-align: center;
`;
