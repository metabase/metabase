import cx from "classnames";
import { t } from "ttag";

import { Button, Group, Icon, Tooltip } from "metabase/ui";

import S from "./Nav.module.css";

interface Props {
  onNextClick?: () => void;
  onPreviousClick?: () => void;
}

export const Nav = ({ onNextClick, onPreviousClick }: Props) => (
  <Group gap="md">
    {(onNextClick || onPreviousClick) && (
      <Group flex="0 0 auto" gap="sm">
        <Tooltip disabled={!onPreviousClick} label={t`Previous row`}>
          <Button
            c="text-dark"
            className={cx({
              [S.disabled]: !onPreviousClick,
            })}
            disabled={!onPreviousClick}
            h={32}
            leftSection={<Icon name="chevronup" />}
            variant="subtle"
            w={32}
            onClick={onPreviousClick}
          />
        </Tooltip>

        <Tooltip disabled={!onNextClick} label={t`Next row`}>
          <Button
            c="text-dark"
            className={cx({
              [S.disabled]: !onNextClick,
            })}
            disabled={!onNextClick}
            h={32}
            leftSection={<Icon name="chevrondown" />}
            variant="subtle"
            w={32}
            onClick={onNextClick}
          />
        </Tooltip>
      </Group>
    )}
  </Group>
);
