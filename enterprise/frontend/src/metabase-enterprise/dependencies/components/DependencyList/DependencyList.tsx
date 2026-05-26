import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Breadcrumbs,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Stack,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeIcon,
  getNodeLabel,
  getNodeLink,
  getNodeLocationInfo,
  getNodeViewCount,
  getNodeViewCountLabel,
} from "../../utils";

import S from "./DependencyList.module.css";

type DependencyListProps = {
  nodes: DependencyNode[];
  onGraphOpened?: (node: DependencyNode) => void;
};

export function DependencyList({ nodes, onGraphOpened }: DependencyListProps) {
  return (
    <Card p={0} shadow="none" withBorder>
      {nodes.map((node, index) => (
        <DependentItem key={index} node={node} onGraphOpened={onGraphOpened} />
      ))}
    </Card>
  );
}

type DependentItemProps = {
  node: DependencyNode;
  onGraphOpened?: (node: DependencyNode) => void;
};

function DependentItem({ node, onGraphOpened }: DependentItemProps) {
  const [isOpened, setIsOpened] = useState(false);
  const label = getNodeLabel(node);
  const link = getNodeLink(node);
  const icon = getNodeIcon(node);
  const location = getNodeLocationInfo(node);
  const viewCount = getNodeViewCount(node);

  const handleGraphOpened = () => {
    onGraphOpened?.(node);
  };

  return (
    <Menu opened={isOpened} onChange={setIsOpened}>
      <Menu.Target>
        <Stack
          className={cx(S.item, { [S.active]: isOpened })}
          p="md"
          gap="sm"
          aria-label={label}
        >
          <Group gap="sm" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <FixedSizeIcon name={icon} />
              <Box className={CS.textWrap} lh="1rem">
                {label}
              </Box>
            </Group>
            {viewCount != null && (
              <Box
                className={CS.textNoWrap}
                c="text-secondary"
                fz="sm"
                lh="1rem"
              >
                {getNodeViewCountLabel(viewCount)}
              </Box>
            )}
          </Group>
          {location != null && (
            <Breadcrumbs
              separator={<FixedSizeIcon name="chevronright" size={12} />}
              c="text-secondary"
              ml="1rem"
              pl="sm"
            >
              {location.links.map((link, linkIndex) => (
                <Box key={linkIndex} className={CS.textWrap} lh="1rem">
                  {link.label}
                </Box>
              ))}
            </Breadcrumbs>
          )}
        </Stack>
      </Menu.Target>
      <Menu.Dropdown>
        {link && (
          <Menu.Item
            component={ForwardRefLink}
            to={link.url}
            target="_blank"
            leftSection={<FixedSizeIcon name="external" />}
          >
            {t`Go to this`}
          </Menu.Item>
        )}
        <Menu.Item
          component={ForwardRefLink}
          to={Urls.dependencyGraph({ entry: node })}
          target="_blank"
          leftSection={<FixedSizeIcon name="dependencies" />}
          onClickCapture={handleGraphOpened}
          onAuxClick={handleGraphOpened}
        >
          {t`View in dependency graph`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
