import { Dialog, useMantineTheme } from "@mantine/core";
import { useUpdateSettingMutation } from "metabase/api";
import ColorPicker from "metabase/common/components/ColorPicker";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Box, Text, Group } from "metabase/ui";

export const ThemeModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [updateSetting] = useUpdateSettingMutation();
  const theme = useMantineTheme();

  const appColors = useSelector(
    (state) => getSetting(state, "application-colors") || {},
  );

  const { brand, background, text } = appColors;

  const handleChange = async (key: string, value: string) => {
    const newAppColors = { ...appColors, [key]: value };

    await updateSetting({
      key: "application-colors",
      value: newAppColors,
    });

    theme.other.updateColorSettings(newAppColors);
  };

  console.log(appColors);

  return (
    <Dialog opened={open} onClose={onClose} title="Theme Modal">
      <Box>
        <Group>
          <Text>Brand:</Text>
          <ColorPicker
            value={brand}
            onChange={(c) => c && handleChange("brand", c)}
          />
        </Group>
        <Group>
          <Text>Background:</Text>
          <ColorPicker
            value={background}
            onChange={(c) => c && handleChange("background", c)}
          />
        </Group>
        <Group>
          <Text>Text:</Text>
          <ColorPicker
            value={text}
            onChange={(c) => c && handleChange("text", c)}
          />
        </Group>
      </Box>
    </Dialog>
  );
};
