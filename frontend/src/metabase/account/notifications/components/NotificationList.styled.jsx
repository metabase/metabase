import styled from "styled-components";
import Label from "metabase/components/type/Label";
import { TextButton } from "metabase/components/Button.styled";

export const NotificationHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

export const NotificationLabel = styled(Label)`
  flex: 1 1 auto;
  margin: 0;
`;

export const NotificationButton = styled(TextButton).attrs({
  size: "small",
})``;
