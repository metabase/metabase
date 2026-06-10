import cx from "classnames";
import { useCallback, useState } from "react";

import { EntityMenuTrigger } from "metabase/common/components/EntityMenuTrigger";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Flex, Icon, Menu, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ObjectDetailHeader.module.css";
import type { ObjectId } from "./types";

export interface ObjectDetailHeaderProps {
  actionItems: {
    title: string;
    icon: IconName;
    action: () => void;
  }[];
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId | null;
  canZoomPreviousRow: boolean;
  canZoomNextRow?: boolean;
  showControls?: boolean;
  viewPreviousObjectDetail?: () => void;
  viewNextObjectDetail?: () => void;
  closeObjectDetail?: () => void;
}

export function ObjectDetailHeader({
  actionItems,
  canZoom,
  objectName,
  objectId,
  canZoomPreviousRow,
  canZoomNextRow,
  showControls = true,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
  closeObjectDetail,
}: ObjectDetailHeaderProps): JSX.Element {
  const [menuOpened, setMenuOpened] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuOpened(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpened((opened) => !opened);
  }, []);

  return (
    <Box className={cx(CS.Grid, S.headerWrapper)}>
      <div className={CS.GridCell}>
        <h2 className={CS.p3}>
          {objectName}
          {objectId !== null && (
            <Text component="span" c="text-secondary" ml="sm">
              {" "}
              {objectId}
            </Text>
          )}
        </h2>
      </div>

      {showControls && (
        <Flex align="center" gap="0.5rem" p="1rem">
          {canZoom && (
            <>
              <ActionIcon
                variant="viewHeader"
                data-testid="view-previous-object-detail"
                disabled={!canZoomPreviousRow}
                onClick={viewPreviousObjectDetail}
              >
                <Icon name="chevronup" />
              </ActionIcon>
              <ActionIcon
                variant="viewHeader"
                data-testid="view-next-object-detail"
                disabled={!canZoomNextRow}
                onClick={viewNextObjectDetail}
              >
                <Icon name="chevrondown" />
              </ActionIcon>
            </>
          )}

          {actionItems.length > 0 && (
            <Menu
              opened={menuOpened}
              onChange={setMenuOpened}
              position="bottom-end"
              closeOnItemClick={false}
            >
              <Menu.Target>
                <div>
                  <EntityMenuTrigger
                    icon="ellipsis"
                    onClick={toggleMenu}
                    open={menuOpened}
                    triggerProps={{
                      "data-testid": "actions-menu",
                    }}
                  />
                </div>
              </Menu.Target>
              <Menu.Dropdown miw={184}>
                {actionItems.map((item, index) => (
                  <Menu.Item
                    key={item.title ?? index}
                    leftSection={
                      <Icon name={item.icon} size={16} aria-hidden />
                    }
                    onClick={() => {
                      item.action();
                      closeMenu();
                    }}
                  >
                    {item.title}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}

          <Flex ml="md" pl="md" className={S.closeButton}>
            <ActionIcon
              variant="viewHeader"
              data-testid="object-detail-close-button"
              onClick={closeObjectDetail}
            >
              <Icon name="close" />
            </ActionIcon>
          </Flex>
        </Flex>
      )}
    </Box>
  );
}
