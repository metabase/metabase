import { t } from "ttag";
import { findWhere } from "underscore";

import { rootId } from "metabase/admin/performance/constants/simple";
import type { UpdateTargetId } from "metabase/admin/performance/types";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Title,
  Tooltip,
  useHover,
} from "metabase/ui";
import type { CacheConfig } from "metabase-types/api";

import S from "./StrategyFormLauncher.module.css";

export type StrategyFormLauncherProps = {
  forId: number;
  targetId: number | null;
  title: string;
  updateTargetId: UpdateTargetId;
  configs: CacheConfig[];
  isFormDirty: boolean;
};

export const StrategyFormLauncher = ({
  forId,
  targetId,
  title,
  updateTargetId,
  configs,
  isFormDirty,
}: StrategyFormLauncherProps) => {
  const forRoot = forId === rootId;

  const config = findWhere(configs, { model_id: forId });
  const rootConfig = findWhere(configs, { model: "root" });

  const rootStrategy = rootConfig?.strategy ?? { type: "nocache" };
  const savedStrategy = config?.strategy;

  const inheritsRootStrategy = !forRoot && savedStrategy === undefined;
  const strategy = savedStrategy ?? rootStrategy;
  const isBeingEdited = targetId === forId;

  const { hovered, ref: hoveredRef } = useHover<HTMLElement>();

  const buttonVariant =
    isBeingEdited || hovered
      ? "filled"
      : inheritsRootStrategy || forRoot
        ? "default"
        : "outline";
  const shortStrategyLabel = getShortStrategyLabel(
    inheritsRootStrategy ? rootStrategy : strategy,
  );

  const ariaLabel = forRoot
    ? t`Edit default policy (currently: ${shortStrategyLabel})`
    : inheritsRootStrategy
      ? t`Edit policy for database '${title}' (currently inheriting the default policy, ${getShortStrategyLabel(
          rootStrategy,
        )})`
      : t`Edit policy for database '${title}' (currently: ${shortStrategyLabel})`;

  const launchForm = () => {
    if (targetId !== forId) {
      updateTargetId(forId, isFormDirty);
    }
  };
  const shouldDisableTooltip = !inheritsRootStrategy;

  return (
    <Box
      ref={hoveredRef}
      className={S.launcher}
      data-for-root={forRoot}
      data-inherits-root={inheritsRootStrategy}
      aria-label={ariaLabel}
      onClick={launchForm}
      data-testid={`strategy-form-launcher${
        shouldDisableTooltip ? "" : "-with-tooltip"
      }`}
    >
      <Flex gap="sm" c="text-secondary" align="center">
        <FixedSizeIcon name={forRoot ? "star" : "database"} c="inherit" />
        <Title c="inherit" order={6}>
          {title}
        </Title>
      </Flex>
      <Flex wrap="nowrap" lh="1.5rem" gap="sm">
        <Tooltip
          position="bottom"
          disabled={shouldDisableTooltip}
          label={t`Using default policy`}
        >
          <Button
            className={S.token}
            onClick={launchForm}
            variant={buttonVariant}
            fw={forRoot || inheritsRootStrategy ? "normal" : "bold"}
            lh="1.5rem"
            p="0.25rem .75rem"
            mah="3rem"
            radius="7rem"
          >
            {shortStrategyLabel}
          </Button>
        </Tooltip>
      </Flex>
    </Box>
  );
};
