import { getIsNightMode } from "metabase/dashboard/selectors";
import { lighten } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { Text, useMantineTheme } from "metabase/ui";

interface Props {
  color: string;
}

export const Separator = ({ color }: Props) => {
  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);

  return (
    <Text
      mx="0.2rem"
      style={{ transform: "scale(0.7)" }}
      c={
        isNightMode ? lighten(theme.fn.themeColor("text-medium"), 0.15) : color
      }
      lh={1}
      component="span"
    >
      {" • "}
    </Text>
  );
};
