import cx from "classnames";
import { memo } from "react";

import S from "metabase/common/components/List/List.module.css";
import CS from "metabase/css/core/index.css";
import { Card, Ellipsified, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { ListItemLink, Root } from "./ListItem.styled";

interface ListItemBaseProps {
  "data-testid"?: string;
  name: string;
  description?: string;
  placeholder?: string;
  icon?: IconName;
}

export type ListItemProps =
  | (ListItemBaseProps & { url: string; disabled?: false })
  | (ListItemBaseProps & { url?: string; disabled: true });

const ListItemInner = ({
  "data-testid": dataTestId,
  name,
  url,
  description,
  disabled,
  placeholder,
  icon,
}: ListItemProps) => {
  const card = (
    <Card
      p="lg"
      mb="md"
      w="680px"
      radius="md"
      withBorder
      data-testid="data-reference-list-item"
    >
      <div className={cx(S.item)}>
        <div className={S.itemIcons}>
          {icon && <Icon className={S.chartIcon} name={icon} size={16} />}
        </div>
        <div className={cx(S.itemBody, CS.flexColumn)}>
          <div className={S.itemTitle}>
            <Ellipsified tooltip={name}>{name}</Ellipsified>
          </div>
          {(description || placeholder) && (
            <div className={cx(S.itemSubtitle)}>
              {description || placeholder}
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  if (disabled) {
    return (
      <Root data-testid={dataTestId} disabled>
        {card}
      </Root>
    );
  }

  return (
    <Root data-testid={dataTestId}>
      <ListItemLink to={url}>{card}</ListItemLink>
    </Root>
  );
};

export const ListItem = memo(ListItemInner);
