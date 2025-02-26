import { Icon, useMantineTheme } from "metabase/ui";

export const XrayIcon = () => {
  const theme = useMantineTheme();

  return (
    <Icon
      name="bolt"
      size={24}
      mr="md"
      style={{
        // we don't have access to this color in css
        // TODO: replace this color with one from palette
        color: theme.fn.themeColor("accent4"),
      }}
    />
  );
};
