import styled from "@emotion/styled";
import FieldInfo from "metabase/components/MetadataInfo/FieldInfo";
import { HoverCard } from "metabase/ui";
import { FieldInfoMLv2 } from "../FieldInfo/FieldInfo";

export const WidthBoundFieldInfo = styled(FieldInfo)`
  width: 300px;
  font-size: 14px;
`;

export const Dropdown = styled(HoverCard.Dropdown)`
  overflow: visible;
`;

export const Target = styled.div`
  position: absolute;
  width: 100%;
  left: -10px;
  right: -10px;
  top: -10px;
  bottom: -10px;
  min-height: 5px;
`;

export const WidthBoundFieldInfoMLv2 = styled(FieldInfoMLv2)`
  width: 300px;
  font-size: 14px;
`;
