import { t } from "ttag";

import { Flex, Icon, Stack, Text, HoverCard } from "metabase/ui";

type IllustrationType =
  | "login-page"
  | "landing-page"
  | "no-question-results"
  | "no-search-results";

interface IllustrationDescriptionProps {
  errorMessageContainerId: string;
  type: IllustrationType;
}

const TITLES: Record<IllustrationType, string> = {
  "login-page": t`Login page`,
  "landing-page": t`Landing page`,
  "no-question-results": t`No-results image for questions`,
  "no-search-results": t`No search results`,
};

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

export function IllustrationDescription({
  errorMessageContainerId,
  type,
}: IllustrationDescriptionProps) {
  return (
    <Text fw="bold" transform="none">
      <Flex align="center">
        {TITLES[type]}
        <HoverCard position="top-start">
          <HoverCard.Target>
            <Icon aria-hidden name="info" />
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
        <Text color="error" aria-hidden id={errorMessageContainerId}></Text>
      </Flex>
    </Text>
  );
}
