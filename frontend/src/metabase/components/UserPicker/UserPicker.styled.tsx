import styled from "@emotion/styled";

import UserAvatar from "metabase/components/UserAvatar";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const UserPickerRoot = styled.div`
  padding: 0.125rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const UserPickerOption = styled.div`
  display: flex;
  align-items: center;
`;

export const UserPickerAvatar = styled(UserAvatar)`
  color: ${color("white")};
`;

export const UserPickerText = styled.div`
  margin-left: ${space(1)};
`;
