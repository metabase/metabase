import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import {
  space,
  breakpointMaxSmall,
  breakpointMinHeightMedium,
} from "metabase/styled-components/theme";

import TabList from "metabase/core/components/TabList";
import TabPanel from "metabase/core/components/TabPanel";
import Ellipsified from "metabase/core/components/Ellipsified";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

interface ModalRootProps {
  hasSideNav?: boolean;
}

export const ModalRoot = styled.div<ModalRootProps>`
  display: flex;
  flex-direction: column;
  width: min(98vw, ${props => (props.hasSideNav ? "70rem" : "55rem")});
`;

export const ModalMain = styled.div`
  height: calc(90vh - 10rem);
  ${breakpointMaxSmall} {
    height: calc(98vh - 10rem);
    flex-direction: column;
  }
  display: flex;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${color("border")};
`;

export const ModalBody = styled.div`
  overflow-y: auto;
  flex: 1;
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem 2rem;
`;

export const ModalTitle = styled(Ellipsified)`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const ModalTabList = styled(TabList)`
  padding: 1rem;
  width: 15rem;
  border-right: 1px solid ${color("border")};
  overflow-y: auto;

  ${breakpointMaxSmall} {
    width: 100%;
    height: 5rem;
  }

  ${breakpointMinHeightMedium} {
    font-size: 1rem;
  }
`;

export const ModalTabPanel = styled(TabPanel)`
  overflow-y: auto;
  flex: 1;
`;

interface ModalDividerProps {
  marginY?: string;
}

export const ModalDivider = styled.div<ModalDividerProps>`
  border-top: 1px solid ${color("border")};
  margin: ${props => (props.marginY ? props.marginY : "0")} 0;
`;

export const ModalCloseButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("text-light")};
`;

export const SearchContainer = styled.div`
  margin-right: ${space(2)};

  input {
    font-weight: bold;
    padding: 12px ${space(3)};
  }
`;
