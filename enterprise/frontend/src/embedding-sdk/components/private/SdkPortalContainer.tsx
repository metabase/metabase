import styled from "@emotion/styled";

import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "embedding-sdk/config";

import { PublicComponentStylesWrapper } from "./PublicComponentStylesWrapper";

/**
 * This is the portal container used by popovers modals etc, it is wrapped with PublicComponentStylesWrapper
 * so that it has our styles applied.
 * Mantine components needs to have the defaultProps set to use `EMBEDDING_SDK_PORTAL_CONTAINER_ELEMENT_ID` as target for the portal
 */
export const PortalContainer = () => (
  <PublicComponentStylesWrapper>
    <FixedPosition id={EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}></FixedPosition>
  </PublicComponentStylesWrapper>
);

const FixedPosition = styled.div`
  // needed otherwise it will rendered "in place" and push the content below
  position: fixed;
  left: 0;
  top: 0;
`;
