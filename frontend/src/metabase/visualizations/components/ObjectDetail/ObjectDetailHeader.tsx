import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Flex, Icon, Menu, Text } from "metabase/ui";

import S from "./ObjectDetailHeader.module.css";
import type { ObjectId } from "./types";
import type { ActionItem } from "./utils";

export interface ObjectDetailHeaderProps {
  actionItems: ActionItem[];
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
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  aria-label={t`Actions`}
                  data-testid="actions-menu"
                  variant="subtle"
                >
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {actionItems.map((item) => (
                  <Menu.Item
                    key={item.title}
                    leftSection={<Icon name={item.icon} aria-hidden />}
                    onClick={item.action}
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
