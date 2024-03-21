import { useTheme } from "@emotion/react";
import { t } from "ttag";

import { Icon, Stack, Text, HoverCard } from "metabase/ui";

type IllustrationType =
  | "login-page"
  | "landing-page"
  | "no-question-results"
  | "no-search-results";

interface CustomFileUploadInfoDot {
  type: IllustrationType;
}

const DESCRIPTIONS_WIDTHS: Record<IllustrationType, number> = {
  "login-page": 400,
  "landing-page": 400,
  "no-question-results": 250,
  "no-search-results": 250,
};

const DESCRIPTIONS: Record<IllustrationType, string[]> = {
  "login-page": [
    t`For best results, choose an image that is horizontally oriented and upload it as an SVG file. Other accepted formats are JPG and PNG.`,
    t`Your file should not be larger than 2MB.`,
  ],
  "landing-page": [
    t`For best results, choose an image that is horizontally oriented and upload it as an SVG file. Other accepted formats are JPG and PNG.`,
    t`Your file should not be larger than 2MB.`,
  ],
  "no-question-results": [
    t`For best results, upload an SVG file. Other accepted formats are JPG and PNG.`,
    t`Your file should not be larger than 2MB.`,
  ],
  "no-search-results": [
    t`For best results, upload an SVG file. Other accepted formats are JPG and PNG.`,
    t`Your file should not be larger than 2MB.`,
  ],
};

export const ImageUploadInfoDot = ({ type }: CustomFileUploadInfoDot) => {
  const theme = useTheme();
  return (
    <HoverCard position="top-start">
      <HoverCard.Target>
        <Icon
          name="info"
          color={theme.fn.themeColor("text-light")}
          style={{ flexShrink: 0 }}
        />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack p="md" spacing="sm" maw={DESCRIPTIONS_WIDTHS[type]}>
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
