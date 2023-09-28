import Button from "metabase/core/components/Button";

import {
  CloseButton,
  ObjectDetailHeaderWrapper,
  ObjectIdLabel,
} from "./ObjectDetailHeader.styled";
import type { ObjectId } from "./types";

export interface ObjectDetailHeaderProps {
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId | null | unknown;
  canZoomPreviousRow: boolean;
  canZoomNextRow?: boolean;
  showActions?: boolean;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  closeObjectDetail: () => void;
}

export function ObjectDetailHeader({
  canZoom,
  objectName,
  objectId,
  canZoomPreviousRow,
  canZoomNextRow,
  showActions = true,
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
      {showActions && (
        <div className="flex align-center">
          <div className="flex p2">
            {!!canZoom && (
              <>
                <Button
                  data-testid="view-previous-object-detail"
                  onlyIcon
                  borderless
                  className="mr1"
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
            <CloseButton>
              <Button
                data-testid="object-detail-close-button"
                onlyIcon
                borderless
                onClick={closeObjectDetail}
                icon="close"
              />
            </CloseButton>
          </div>
        </div>
      )}
    </ObjectDetailHeaderWrapper>
  );
}
