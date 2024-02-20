import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const QuestionPaneDetail = styled.div`
  color: ${color("text-medium")};
  display: flex;
  align-items: center;
  padding: 0.25em ${space(1)};
  font-weight: 700;
`;

export const QuestionPaneDetailLinkText = styled.span`
  margin-left: ${space(1)};
`;

export const QuestionPaneDetailLink = styled.a`
  display: flex;
  align-items: center;
  color: ${color("brand")};
`;

export const QuestionPaneDetailText = styled.span`
  margin-left: ${space(1)};
  font-weight: normal;
`;

export const QuestionPaneDescription = styled.div`
  padding: 0 ${space(1)} ${space(2)} ${space(1)};
`;

export const QuestionPaneIcon = styled(Icon)`
  margin-top: 1px;
  width: 12px;
`;
