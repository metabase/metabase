import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ModelPaneDetail = styled.div`
  color: ${color("text-medium")};
  display: flex;
  align-items: center;
  padding: 0.25em ${space(1)};
  font-weight: 700;
`;

export const ModelPaneDetailLinkText = styled.span`
  margin-left: ${space(1)};
`;

export const ModelPaneDetailLink = styled.a`
  display: flex;
  align-items: center;
  color: ${color("brand")};
`;

export const ModelPaneDetailText = styled.span`
  margin-left: ${space(1)};
  font-weight: normal;
`;

export const ModelPaneDescription = styled.div`
  padding: 0 ${space(1)} ${space(2)} ${space(1)};
`;

export const ModelPaneIcon = styled(Icon)`
  margin-top: 1px;
  width: 12px;
`;
