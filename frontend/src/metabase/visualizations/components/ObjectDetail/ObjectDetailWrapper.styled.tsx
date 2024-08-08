import styled from "@emotion/styled";

import Modal from "metabase/components/Modal";
import { color } from "metabase/lib/colors";
import { breakpointMinMedium } from "metabase/styled-components/theme/media-queries";

import TableFooter from "../TableSimple/TableFooter";

import { ObjectDetailBodyWrapper } from "./ObjectDetailBody.styled";
import { ObjectDetailContainer } from "./ObjectDetailView.styled";
import { ObjectDetailsTable } from "./ObjectDetailsTable.styled";
import { ObjectRelationships } from "./ObjectRelationships.styled";

export const RootModal = styled(Modal)`
  ${ObjectDetailContainer} {
    overflow: hidden;
    ${breakpointMinMedium} {
      width: ${({ wide }) => (wide ? "64rem" : "48rem")};
      max-width: 95vw;
    }

    max-height: 95vh;
    width: 95vw;
    border: 1px solid ${color("border")};
    border-radius: 0.5rem;
  }

  ${ObjectDetailBodyWrapper} {
    ${breakpointMinMedium} {
      display: flex;
      height: calc(80vh - 4rem);
    }

    max-height: calc(100vh - 8rem);
  }

  ${ObjectDetailsTable} {
    ${breakpointMinMedium} {
      max-height: calc(80vh - 4rem);
    }
  }

  ${ObjectRelationships} {
    ${breakpointMinMedium} {
      flex: 0 0 33.3333%;
      max-height: calc(80vh - 4rem);
    }
  }
`;

export const PaginationFooter = styled(TableFooter)`
  margin-top: 0.5rem;
  text-align: right;
`;
