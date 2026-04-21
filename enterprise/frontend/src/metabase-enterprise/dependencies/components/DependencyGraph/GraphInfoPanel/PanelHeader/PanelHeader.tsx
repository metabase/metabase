import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import {
  ActionIcon,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
  Tooltip,
} from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeIcon,
  getNodeLabel,
  getNodeLink,
  getNodeLocationInfo,
  getNodeSourceReplacementEntry,
} from "../../../../utils";
import { GraphBreadcrumbs } from "../../GraphBreadcrumbs";
import { GraphExternalLink } from "../../GraphExternalLink";

import S from "./PanelHeader.module.css";

type PanelHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function PanelHeader({ node, onClose }: PanelHeaderProps) {
  const link = getNodeLink(node);
  const location = getNodeLocationInfo(node);
  const sourceEntry = getNodeSourceReplacementEntry(node);
  const [
    isReplaceModalOpened,
    { open: openReplaceModal, close: closeReplaceModal },
  ] = useDisclosure();

  return (
    <>
      <Group className={S.root} p="lg" gap="0.75rem" wrap="nowrap">
        <Center w="2.75rem" h="2.75rem" bdrs="50%" bg="background-secondary">
          <FixedSizeIcon name={getNodeIcon(node)} c="brand" size={20} />
        </Center>
        <Stack gap="xs" flex={1}>
          <Title className={CS.textWrap} order={3} lh="1.5rem">
            {getNodeLabel(node)}
          </Title>
          {location != null && <GraphBreadcrumbs links={location.links} />}
        </Stack>
        <Group m="-sm" gap="xs" wrap="nowrap">
          {link != null && (
            <GraphExternalLink label={link.label} url={link.url} />
          )}
          {sourceEntry != null && (
            <PLUGIN_REPLACEMENT.SourceReplacementButton>
              {({ tooltip, isDisabled }) => (
                <Tooltip label={tooltip ?? t`Find and replace`}>
                  <ActionIcon
                    aria-label={t`Replace data source`}
                    disabled={isDisabled}
                    onClick={openReplaceModal}
                  >
                    <FixedSizeIcon name="find_replace" />
                  </ActionIcon>
                </Tooltip>
              )}
            </PLUGIN_REPLACEMENT.SourceReplacementButton>
          )}
          <ActionIcon aria-label={t`Close`} onClick={onClose}>
            <FixedSizeIcon name="close" />
          </ActionIcon>
        </Group>
      </Group>
      {sourceEntry != null && (
        <PLUGIN_REPLACEMENT.SourceReplacementModal
          opened={isReplaceModalOpened}
          initialSource={sourceEntry}
          onClose={closeReplaceModal}
        />
      )}
    </>
  );
}
