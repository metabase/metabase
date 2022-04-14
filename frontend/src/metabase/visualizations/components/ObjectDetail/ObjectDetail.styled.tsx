import styled from "@emotion/styled";
import { breakpointMinMedium } from "metabase/styled-components/theme/media-queries";
import colors from "metabase/lib/colors";

interface ObjectDetailModalProps {
  wide: boolean;
}

export const ObjectDetailModal = styled.div<ObjectDetailModalProps>`
  border: 1px solid ${colors.border};
  border-radius: 8px;
  overflow: hidden;
  ${breakpointMinMedium} {
    width: ${({ wide }) => (wide ? "880px" : "568px")};
  }
  min-height: 480px;
  max-height: 95vh;
  width: 95vw;
`;

export const ObjectDetailBodyWrapper = styled.div`
  font-size: 1rem;
  overflow-y: auto;
  ${breakpointMinMedium} {
    display: flex;
    max-height: auto;
  }
  max-height: 90vh;
`;

export const ObjectDetailsTable = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 2rem;
  ${breakpointMinMedium} {
    max-height: calc(100vh - 15rem);
  }
`;

export const ObjectRelationships = styled.div`
  overflow-y: auto;
  flex: 0 0 100%;
  padding: 2rem;
  background-color: ${colors["bg-light"]};
  ${breakpointMinMedium} {
    flex: 0 0 33.3333%;
    max-height: calc(100vh - 15rem);
  }
`;
