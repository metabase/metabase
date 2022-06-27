import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import EditableText from "metabase/core/components/EditableText";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const HeaderTitle = styled(EditableText)`
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
`;

export const HeaderReviewIcon = styled(Icon)`
  padding-left: 0.25rem;
`;
