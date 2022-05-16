import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Ellipsified from "metabase/components/Ellipsified";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 2rem 2rem 1.75rem;
`;

export const ModalHeaderTitle = styled(Ellipsified)`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const ModalCloseButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("text-light")};
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem 2rem;
`;

export const ModalRow = styled.div`
  margin: 0 2rem;
`;

export const ModalDivider = styled.div`
  border-top: 1px solid ${color("border")};
`;
