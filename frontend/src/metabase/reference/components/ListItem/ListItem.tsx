import cx from "classnames";
import { memo } from "react";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import ListS from "metabase/reference/components/List/List.module.css";
import { Box, Card, Ellipsified, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ListItem.module.css";

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
      c="inherit"
      data-testid="data-reference-list-item"
    >
      <div className={cx(ListS.item)}>
        <div className={ListS.itemIcons}>
          {icon && <Icon className={ListS.chartIcon} name={icon} size={16} />}
        </div>
        <div className={cx(ListS.itemBody, CS.flexColumn)}>
          <Box className={ListS.itemTitle} lh="1.5">
            <Ellipsified tooltip={name}>{name}</Ellipsified>
          </Box>
          {(description || placeholder) && (
            <Box className={cx(ListS.itemSubtitle)} mt="sm">
              {description || placeholder}
            </Box>
          )}
        </div>
      </div>
    </Card>
  );

  if (disabled) {
    return (
      <Box
        component="li"
        pos="relative"
        className={S.disabled}
        data-disabled="true"
        data-testid={dataTestId}
      >
        {card}
      </Box>
    );
  }

  return (
    <Box component="li" pos="relative" data-testid={dataTestId}>
      <Link to={url} className={S.link}>
        {card}
      </Link>
    </Box>
  );
};

export const ListItem = memo(ListItemInner);
