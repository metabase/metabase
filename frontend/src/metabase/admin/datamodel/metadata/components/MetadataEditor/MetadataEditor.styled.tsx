// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import {
  AdminContent,
  AdminMain,
  AdminSidebar,
  AdminWrapper,
} from "metabase/components/AdminLayout";

export const MetadataWrapper = styled(AdminWrapper)`
  /* 142px is collective height of content above this component but below navbar */
  height: calc(100% - 142px);
`;

export const MetadataMain = styled(AdminMain)`
  height: 100%;
`;

export const MetadataSidebar = styled(AdminSidebar)`
  padding-top: 0;
`;

export const MetadataContent = styled(AdminContent)`
  padding-top: 0;
`;
