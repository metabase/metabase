import { t } from "ttag";

import { Button, Flex, Icon, Paper, Text } from "metabase/ui";

type ArchivedEntityBannerProps = {
  entity: "collection" | "question" | "dashboard" | "model";
  onUnarchive: () => void;
  onDeletePermanently: () => void;
};

export const ArchivedEntityBanner = ({
  entity,
  onUnarchive,
  onDeletePermanently,
}: ArchivedEntityBannerProps) => {
  return (
    <Paper px="1.5rem" py=".75rem" bg="error" shadow="0" radius="0" w="100%">
      <Flex justify="space-between">
        <Flex align="center">
          {/* TODO: add trash full icon */}
          <Icon
            color="white"
            name="trash"
            style={{ marginInlineEnd: "1rem" }}
          />
          <Text color="white" size="md" lh="1rem">
            {t`This ${entity} is in the trash. `}
          </Text>
        </Flex>
        <Flex gap="md">
          <Button compact variant="outline" color="white" onClick={onUnarchive}>
            <Flex align="center">
              <Icon
                size={12}
                name="revert"
                style={{ marginInlineEnd: ".25rem" }}
              />{" "}
              {t`Restore`}
            </Flex>
          </Button>
          <Button
            compact
            variant="outline"
            color="white"
            onClick={onDeletePermanently}
          >
            <Flex align="center">
              <Icon
                size={12}
                name="trash"
                style={{ marginInlineEnd: ".25rem" }}
              />{" "}
              {t`Delete permanently`}
            </Flex>
          </Button>
        </Flex>
      </Flex>
    </Paper>
  );
};
