import { t } from "ttag";

import { HoverCard, Icon, Stack, Text } from "metabase/ui";

type IllustrationType = "background" | "icon";

interface CustomFileUploadInfoDot {
  type: IllustrationType;
}

const DESCRIPTIONS_WIDTHS: Record<IllustrationType, number> = {
  background: 400,
  icon: 250,
};

const DESCRIPTIONS: Record<IllustrationType, string[]> = {
  background: [
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    t`For best results, choose an image that is horizontally oriented and upload it as an SVG file. Other accepted formats are JPG and PNG.`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    t`Your file should not be larger than 2MB.`,
  ],
  icon: [
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    t`For best results, upload an SVG file. Other accepted formats are JPG and PNG.`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    t`Your file should not be larger than 2MB.`,
  ],
};

export const ImageUploadInfoDot = ({ type }: CustomFileUploadInfoDot) => {
  return (
    <HoverCard position="top-start">
      <HoverCard.Target>
        <Icon name="info" c="text-tertiary" />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack p="md" gap="sm" maw={DESCRIPTIONS_WIDTHS[type]}>
          {DESCRIPTIONS[type].map((message, index) => (
            <Text key={index} size="sm">
              {message}
            </Text>
          ))}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};
