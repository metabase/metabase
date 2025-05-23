// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import {
  AdminContent,
  AdminMain,
  AdminSidebar,
  AdminWrapper,
} from "metabase/components/AdminLayout";

export const MetadataWrapper = styled(AdminWrapper)`
  /* 53px is the height of DataModelApp's NavBar */
  /* 104px is the height of MetadataHeader */
  height: calc(100% - 53px - 104px);
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
