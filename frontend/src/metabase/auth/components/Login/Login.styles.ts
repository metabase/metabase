import { createStyles, rem } from "@mantine/core";

export const useStyles = createStyles(theme => ({
  title: {
    color: theme.colors.text[2],
    fontSize: rem(20),
    fontWeight: "bold",
    lineHeight: rem(24),
    textAlign: "center",
  },
  panel: {
    marginTop: rem(40),
  },
  actionList: {
    marginTop: rem(56),
  },
  actionListItem: {
    marginTop: rem(32),
    textAlign: "center",
  },
}));
