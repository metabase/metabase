import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import TabList from "metabase/core/components/TabList";
import TabPanel from "metabase/core/components/TabPanel";
import Ellipsified from "metabase/components/Ellipsified";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 90vh;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 2rem 2rem 1.75rem;
`;

export const ModalBody = styled.div`
  overflow-y: auto;
  padding: 0 2rem;
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
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
  padding: 0 2rem;
`;

export const ModalTabPanel = styled(TabPanel)`
  overflow-y: auto;
  padding: 0 2rem;
`;

export const ModalDivider = styled.div`
  border-top: 1px solid ${color("border")};
`;

export const ModalCloseButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("text-light")};
`;
