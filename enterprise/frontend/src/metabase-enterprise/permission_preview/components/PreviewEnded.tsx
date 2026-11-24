import { t } from "ttag";

import { Button, Flex, Icon, Text } from "metabase/ui";

interface PreviewEndedProps {
  onPreviewAgain: () => void;
}

/** Fills the frame's box once the preview's time has run out. */
export function PreviewEnded({ onPreviewAgain }: PreviewEndedProps) {
  return (
    <Flex
      h="100%"
      direction="column"
      align="center"
      justify="center"
      gap="md"
      c="text-secondary"
    >
      <Icon name="clock" size={28} />
      <Text c="text-secondary">{t`This preview ended after 10 minutes.`}</Text>
      <Button onClick={onPreviewAgain}>{t`Preview again`}</Button>
    </Flex>
  );
}
