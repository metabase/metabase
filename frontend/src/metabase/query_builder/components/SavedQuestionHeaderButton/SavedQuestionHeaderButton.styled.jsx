import styled from "@emotion/styled";

import EditableText from "../EditableText/EditableText";
import Icon from "metabase/components/Icon";

export const HeaderRoot = styled.div`
  ${EditableText.Root}:after, ${EditableText.TextArea} {
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.5rem;
    padding: 0.25rem;
  }

  display: flex;
  align-items: center;
`;

export const HeaderReviewIcon = styled(Icon)`
  padding-left: 0.25rem;
`;
