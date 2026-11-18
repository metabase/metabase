import { Box, Button, Icon, type ColorName, type IconName } from "@metabase/ui";

export const colorName: ColorName = "core-brand";
export const iconName: IconName = "table";

export const ok = (
  <>
    <Box c="core-brand" />
    <Button color="brand" />
    <Box p="md" />
    <Icon name="table" />
  </>
);

export const bad = (
  <>
    {/* @ts-expect-error not an icon name */}
    <Icon name="definitely-not-an-icon" />
    {/* @ts-expect-error augmentation replaces Mantine's stock colour names */}
    <Button color="grape" />
    {/* @ts-expect-error not a ColorName */}
    <Box c="definitely-not-a-color" />
  </>
);

// @ts-expect-error not a ColorName
export const badColorName: ColorName = "grape";
