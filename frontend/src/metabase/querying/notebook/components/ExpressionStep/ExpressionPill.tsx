import { Icon } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import { NotebookCellItem } from "../NotebookCell";

import S from "./ExpressionPill.module.css";

type ExpressionPillProps = {
  name: string;
  color: ColorName;
  isActive: boolean;
  readOnly?: boolean;
  onOpen: () => void;
  onRemove: () => void;
};

/**
 * The pill of a custom filter, which opens its inline editor. Filters have no
 * name, so it can't be renamed.
 */
export function ExpressionPill({
  name,
  color,
  isActive,
  readOnly,
  onOpen,
  onRemove,
}: ExpressionPillProps) {
  return (
    <NotebookCellItem
      color={color}
      readOnly={readOnly}
      selected={isActive}
      className={S.pill}
      onClick={readOnly || isActive ? undefined : onOpen}
      data-testid={isActive ? "selected-expression-pill" : "expression-pill"}
    >
      <span className={S.name}>{name}</span>
      {!readOnly && (
        <Icon
          className={S.closeIcon}
          name="close"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        />
      )}
    </NotebookCellItem>
  );
}
