import styled from "@emotion/styled";

import { TextButton } from "metabase/components/Button.styled";
import Label from "metabase/components/type/Label";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const NotificationHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

export const NotificationLabel = styled(Label)`
  flex: 1 1 auto;
  margin: 0;
`;

export const NotificationButton = styled(TextButton)``;

NotificationButton.defaultProps = {
  size: "small",
};

export const NotificationSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const NotificationIcon = styled(Icon)`
  color: ${color("bg-dark")};
  width: 3.25rem;
  height: 3.25rem;
  margin-top: 4.875rem;
  margin-bottom: 1.75rem;
`;

export const NotificationMessage = styled.div`
  max-width: 24rem;
  text-align: center;
`;
