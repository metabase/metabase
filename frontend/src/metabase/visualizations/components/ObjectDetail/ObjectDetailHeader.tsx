import cx from "classnames";

import { Button } from "metabase/common/components/Button";
import { EntityMenu } from "metabase/common/components/EntityMenu";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Text } from "metabase/ui";

import S from "./ObjectDetailHeader.module.css";
import type { ObjectId } from "./types";

export interface ObjectDetailHeaderProps {
  actionItems: {
    title: string;
    icon: string;
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
              <Button
                data-testid="view-previous-object-detail"
                onlyIcon
                borderless
                disabled={!canZoomPreviousRow}
                onClick={viewPreviousObjectDetail}
                icon="chevronup"
              />
              <Button
                data-testid="view-next-object-detail"
                onlyIcon
                borderless
                disabled={!canZoomNextRow}
                onClick={viewNextObjectDetail}
                icon="chevrondown"
              />
            </>
          )}

          {actionItems.length > 0 && (
            <EntityMenu
              items={actionItems}
              triggerIcon="ellipsis"
              triggerProps={{
                "data-testid": "actions-menu",
              }}
            />
          )}

          <Flex ml="md" pl="md" className={S.closeButton}>
            <Button
              data-testid="object-detail-close-button"
              onlyIcon
              borderless
              onClick={closeObjectDetail}
              icon="close"
            />
          </Flex>
        </Flex>
      )}
    </Box>
  );
}
