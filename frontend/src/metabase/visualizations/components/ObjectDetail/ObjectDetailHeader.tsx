import EntityMenu from "metabase/components/EntityMenu";
import Button from "metabase/core/components/Button";
import { Flex } from "metabase/ui/components";

import type { ObjectId } from "./types";

import {
  CloseButton,
  ObjectDetailHeaderWrapper,
  ObjectIdLabel,
} from "./ObjectDetailHeader.styled";

export interface ObjectDetailHeaderProps {
  actionItems: {
    title: string;
    icon: string;
    action: () => void;
  }[];
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId | null | unknown;
  canZoomPreviousRow: boolean;
  canZoomNextRow?: boolean;
  showControls?: boolean;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  closeObjectDetail: () => void;
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
    <ObjectDetailHeaderWrapper className="Grid">
      <div className="Grid-cell">
        <h2 className="p3">
          {objectName}
          {objectId !== null && <ObjectIdLabel> {objectId}</ObjectIdLabel>}
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
              horizontalAttachments={["right", "left"]}
              items={actionItems}
              triggerIcon="ellipsis"
              triggerProps={{
                "data-testid": "actions-menu",
              }}
            />
          )}

          <CloseButton>
            <Button
              data-testid="object-detail-close-button"
              onlyIcon
              borderless
              onClick={closeObjectDetail}
              icon="close"
            />
          </CloseButton>
        </Flex>
      )}
    </ObjectDetailHeaderWrapper>
  );
}
