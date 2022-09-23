import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ModelPaneContainer = styled.div``;

export const ModelPaneDetail = styled.div`
  color: ${color("text-medium")};
  display: flex;
  align-items: center;
  padding: ${space(0)} ${space(1)};
  font-weight: 700;
  a {
    display: flex;
    align-items: center;
    color: ${color("brand")};
  }
`;

export const ModelPaneColumns = styled.div`
  padding-top: ${space(1)};
`;

export const ModelPaneColumnsTitle = styled.div`
  display: flex;
  align-items: center;
  font-weight: 700;
  padding: ${space(1)};
`;

export const ModelPaneDescription = styled.div`
  padding: ${space(1)};
`;

export const ModelPaneDetailText = styled.span`
  margin-left: ${space(0)};
`;

export const ModelPaneIcon = styled(Icon)`
  margin-top: 1px;
`;

export const ModelPaneColumnIcon = styled(Icon)`
  color: ${color("brand-light")};
  margin-top: 1px;
`;

export const ModelPaneField = styled.li`
  a {
    display: flex;
    align-items: center;
    color: ${color("brand")};
    font-weight: 700;
    overflow-wrap: anywhere;
    word-break: break-word;
    word-wrap: anywhere;
    display: flex;
    padding: ${space(1)};
    text-decoration: none;
    :hover {
      background-color: ${color("bg-medium")};
    }
  }
`;
