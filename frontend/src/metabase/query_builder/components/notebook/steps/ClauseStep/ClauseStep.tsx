import type Tether from "tether";
import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../../NotebookCell";

export interface ClauseStepProps<T> {
  color: string;
  items: T[];
  isLastOpened?: boolean;
  initialAddText?: string | null;
  tetherOptions?: Tether.ITetherOptions | null;
  readOnly?: boolean;
  renderName: (item: T, index: number) => JSX.Element | string;
  renderPopover: (item?: T, index?: number) => JSX.Element | null;
  canRemove?: (item: T) => boolean;
  onRemove?: ((item: T, index: number) => void) | null;
  "data-testid"?: string;
}

export const ClauseStep = <T,>({
  color,
  items,
  isLastOpened = false,
  initialAddText = null,
  tetherOptions = null,
  readOnly,
  renderName,
  renderPopover,
  canRemove,
  onRemove = null,
  ...props
}: ClauseStepProps<T>): JSX.Element => {
  const addItemElement = (
    <NotebookCellAdd
      color={color}
      initialAddText={items.length === 0 && initialAddText}
    />
  );

  const renderItem = (item: T, index: number) => (
    <NotebookCellItem color={color} readOnly={readOnly}>
      {renderName(item, index)}
      {!readOnly && onRemove && (!canRemove || canRemove(item)) && (
        <Icon
          className="ml1"
          name="close"
          onClick={e => {
            e.stopPropagation();
            onRemove(item, index);
          }}
        />
      )}
    </NotebookCellItem>
  );

  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      {items.map((item, index) => (
        <PopoverWithTrigger
          key={index}
          triggerElement={renderItem(item, index)}
          tetherOptions={tetherOptions}
          sizeToFit
        >
          {renderPopover(item, index)}
        </PopoverWithTrigger>
      ))}
      {!readOnly && (
        <PopoverWithTrigger
          isInitiallyOpen={isLastOpened}
          triggerElement={addItemElement}
          tetherOptions={tetherOptions}
          sizeToFit
        >
          {renderPopover()}
        </PopoverWithTrigger>
      )}
    </NotebookCell>
  );
};
