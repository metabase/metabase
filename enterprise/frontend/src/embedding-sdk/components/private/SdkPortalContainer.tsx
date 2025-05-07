import styled from "@emotion/styled";

import ZIndex from "metabase/css/core/z-index.module.css";
import {
  EMBEDDING_SDK_FULL_PAGE_PORTAL_ROOT_ELEMENT_ID,
  EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID,
} from "metabase/embedding-sdk/config";

import { PublicComponentStylesWrapper } from "./PublicComponentStylesWrapper";

/**
 * This is the portal container used by popovers modals etc, it is wrapped with PublicComponentStylesWrapper
 * so that it has our styles applied.
 * Mantine components needs to have the defaultProps set to use `EMBEDDING_SDK_PORTAL_CONTAINER_ELEMENT_ID` as target for the portal
 */
export const FullPagePortalContainer = () => (
  <PublicComponentStylesWrapper>
    <FixedPosition
      className={ZIndex.Overlay}
      id={EMBEDDING_SDK_FULL_PAGE_PORTAL_ROOT_ELEMENT_ID}
    ></FixedPosition>
  </PublicComponentStylesWrapper>
);

export const PortalContainer = () => (
  <PublicComponentStylesWrapper>
    <div id={EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}></div>
  </PublicComponentStylesWrapper>
);

const FixedPosition = styled.div`
  // needed otherwise it will rendered "in place" and push the content below
  position: fixed;
  left: 0;
  top: 0;
`;
