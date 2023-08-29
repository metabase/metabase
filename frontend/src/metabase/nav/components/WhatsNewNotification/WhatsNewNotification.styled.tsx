import styled from "@emotion/styled";
import { Box } from "metabase/ui";

export const NotificationContainer = styled(Box)(({ theme }) => ({
  margin: theme.spacing.lg,
  padding: theme.spacing.md,
  boxShadow: theme.shadows.md,
  borderWidth: 1,
  borderColor: theme.colors.border[0],
  borderStyle: "solid",
  borderRadius: theme.radius.md,
}));
