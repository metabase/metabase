import type { MouseEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { Cell } from "metabase/browse/components/BrowseTable.styled";
import Questions from "metabase/entities/questions";
import { useDispatch } from "metabase/lib/redux";
import { Button, FixedSizeIcon, Menu } from "metabase/ui";

import type { ModelingItem } from "../types";

import S from "./MenuCell.module.css";

interface MenuCellProps {
  item?: ModelingItem;
}

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

export function MenuCell({ item }: MenuCellProps) {
  const dispatch = useDispatch();

  const handleDelete = useCallback(() => {
    if (!item) {
      return;
    }

    dispatch(
      Questions.actions.setArchived({ id: item.id, model: item.model }, true),
    );
  }, [item, dispatch]);

  if (!item?.can_write) {
    return <Cell />;
  }

  const deleteLabel =
    item.model === "metric" ? t`Delete metric` : t`Delete model`;

  return (
    <Cell onClick={stopPropagation} className={S.menuCell}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            size="xs"
            variant="subtle"
            px="sm"
            aria-label={deleteLabel}
            c="text-dark"
          >
            <FixedSizeIcon name="ellipsis" />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<FixedSizeIcon name="trash" />}
            onClick={handleDelete}
          >
            {t`Remove`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Cell>
  );
}
