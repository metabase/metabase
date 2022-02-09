import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const ModalRoot = styled.div`
  display: block;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 2rem 2rem 0;
`;

export const ModalTitle = styled.div`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
  margin-right: 1rem;
`;

export const ModalMenuButton = styled.div`
  margin-right: 1rem;
`;

export const ModalCloseButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("text-light")};
`;
