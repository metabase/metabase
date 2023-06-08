import { createStyles } from "@mantine/core";

export const useStyles = createStyles(theme => ({
  title: {
    color: theme.colors.text[2],
    fontSize: "1.25rem",
    fontWeight: "bold",
    lineHeight: "1.5rem",
    textAlign: "center",
  },
  panel: {
    marginTop: "2.5rem",
  },
  actionList: {
    marginTop: "3.5rem",
  },
  actionListItem: {
    marginTop: "2rem",
    textAlign: "center",
  },
}));
