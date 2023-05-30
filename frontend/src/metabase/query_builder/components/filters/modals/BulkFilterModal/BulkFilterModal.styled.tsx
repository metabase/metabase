import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space, breakpointMaxSmall } from "metabase/styled-components/theme";

import { TabList } from "metabase/core/components/TabList";
import { TabPanel } from "metabase/core/components/TabPanel";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Icon from "metabase/components/Icon";

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

export const SearchIcon = styled(Icon)`
  margin: 0 ${space(1)};
  color: ${color("text-light")};
`;

export const SearchContainer = styled.div<{ isActive: boolean }>`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  position: relative;

  border: ${props =>
    props.isActive ? `1px solid ${color("border")}` : "none"};
  overflow: hidden;
  transition: max-width 0.2s;
  margin-right: ${space(3)};

  @media (prefers-reduced-motion) {
    transition: none;
  }

  justify-content: center;
  margin-left: auto;

  max-width: ${props => (props.isActive ? "20rem" : "2rem")};
  height: 2rem;
  border-radius: 0.5rem;

  ${breakpointMaxSmall} {
    display: none;
  }
`;

export const SearchInput = styled.input<{ isActive: boolean }>`
  background-color: transparent;
  border: none;
  color: ${color("text-medium")};
  font-weight: 700;
  margin-right: ${space(1)};

  width: 100%;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${color("text-light")};
  }

  width: ${props => (props.isActive ? "100%" : 0)};
`;
