import { Badge } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { go, push } from "react-router-redux";
import { t } from "ttag";

import { usePromoteMutation } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Icon, Popover, Text, Tooltip } from "metabase/ui";

import Link from "../Link";

import S from "./alias.module.css";

export function VersionPopover({
  alias,
  versions,
}: {
  alias: string,
  versions: any[],
}) {
  const [opened, { close, toggle }] = useDisclosure(false);

  const handleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }

  return (
    <Popover opened={opened} onClose={close} closeOnClickOutside position="bottom-end">
      <Popover.Target >
        <Button variant="subtle" onClick={handleOpen} ml="sm">
          <Icon name="breakout" onClick={handleOpen}/>
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Box p="md">
          <Text fw="bold" mb="sm">
            {t`Versions of ${alias}`}
          </Text>
          <Box mt="sm" mb="sm">
            {versions.map((version) => (
              <VersionItem key={version.id} version={version} />
            ))}
          </Box>
        </Box>
      </Popover.Dropdown>
    </Popover>
  )
}

export function VersionItem({ version }: { version: { id: number, name: string, alias: string } }) {
  const [promoteDraft] = usePromoteMutation();
  const dispatch = useDispatch();

  const baseAlias = version.alias.split("@")[0];

  return (
    <Link
      to={`/dashboard/${version.id}`}
      variant="brandBold"
      key={version.id}

    >
      <Flex key={version.id} align="center" my="sm" gap="sm" justify="space-between" w="full" className={S.HoverDazzle}>
        <Flex gap="sm">
          <Icon name="dashboard" />
          <Text>
            {version.name}
          </Text>
          <Badge>
            {version.alias.split("@")[1]}
          </Badge>
        </Flex>

        <Tooltip label={t`promote to current`} position="top">
          <Button
            leftSection={<Icon name="arrow_up" size={16} />}
            variant="subtle"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await promoteDraft(version.id);

              window.location.href = `/item/${baseAlias}?@draft-${Math.floor(Math.random()*10000)}`;
            }}
          />
        </Tooltip>
      </Flex>
    </Link>
  )
}