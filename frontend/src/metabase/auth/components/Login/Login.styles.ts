import { createStyles, rem } from "@mantine/core";

export const useStyles = createStyles(theme => ({
  title: {
    color: theme.colors.text[2],
    fontSize: rem(1.25),
    fontWeight: "bold",
    lineHeight: rem(1.5),
    textAlign: "center",
  },
  panel: {
    marginTop: rem(2.5),
  },
  actionList: {
    marginTop: rem(3.5),
  },
  actionListItem: {
    marginTop: rem(2),
    textAlign: "center",
  },
}));
