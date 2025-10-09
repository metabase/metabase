import { lighten } from "metabase/lib/colors";
import { Text, useMantineTheme } from "metabase/ui";

interface Props {
  inTooltip?: boolean;
}

export const Separator = ({ inTooltip }: Props) => {
  const theme = useMantineTheme();

  const separatorColor = inTooltip
    ? lighten(theme.fn.themeColor("text-medium"), 0.15)
    : lighten(theme.fn.themeColor("text-light"), 0.25);

  return (
    <Text
      mx="0.2rem"
      style={{ transform: "scale(0.7)" }}
      c={separatorColor}
      component="span"
    >
      {" • "}
    </Text>
  );
};
