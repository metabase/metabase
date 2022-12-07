import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

import { SidebarItem } from "../SidebarItem";

export const FormDescription = styled.span`
  margin-bottom: 1rem;
`;

export const DoneButton = styled(Button)`
  margin-left: auto;
  margin-top: 2rem;
`;

export const PickerIcon = styled(SidebarItem.Icon)`
  border-color: transparent;
  margin-left: 8px;
`;

export const PickerItemName = styled(SidebarItem.Name)`
  padding-right: 1rem;
`;
