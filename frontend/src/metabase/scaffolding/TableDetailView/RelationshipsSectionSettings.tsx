import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui/components";

import S from "./TableDetailView.module.css";

export type RelationshipsSectionSettingsProps = {
  direction: "horizontal" | "vertical";
  onUpdateDirection: (direction: "horizontal" | "vertical") => void;
};

export function RelationshipsSectionSettings({
  direction,
  onUpdateDirection,
}: RelationshipsSectionSettingsProps) {
  return (
    <Box mt="sm" className={S.ObjectViewSidebarSection}>
      <Flex align="center" justify="space-between" w="100%">
        <Group gap="xs">
          <Text fw={600} size="sm">
            {t`Relationships`}
          </Text>
        </Group>
        <Group gap="sm" className={S.ObjectViewSidebarSectionActions}>
          <Tooltip label={t`Change section direction`}>
            <ActionIcon
              color="text-medium"
              variant="transparent"
              onClick={() => {
                onUpdateDirection(
                  direction === "vertical" ? "horizontal" : "vertical",
                );
              }}
            >
              <Icon
                name={direction === "vertical" ? "arrow_down" : "arrow_right"}
                size={14}
                style={{
                  transform:
                    direction === "vertical" ? undefined : "rotate(180deg)",
                }}
              />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Flex>
    </Box>
  );
}
