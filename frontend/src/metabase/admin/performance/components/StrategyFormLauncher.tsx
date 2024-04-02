import { t } from "ttag";
import { findWhere } from "underscore";

import { color } from "metabase/lib/colors";
import { FixedSizeIcon, Flex, Title, Tooltip, useHover } from "metabase/ui";

import { rootId } from "../constants";
import type { Config, UpdateTargetId } from "../types";
import { getShortStrategyLabel } from "../types";

import { PolicyToken } from "./StrategyEditorForDatabases.styled";

export const StrategyFormLauncher = ({
  forId,
  targetId,
  title,
  updateTargetId,
  configs,
  isFormDirty,
}: {
  forId: number;
  targetId: number | null;
  title: string;
  updateTargetId: UpdateTargetId;
  configs: Config[];
  isFormDirty: boolean;
}) => {
  const forRoot = forId === rootId;

  const config = findWhere(configs, { model_id: forId });
  const rootConfig = findWhere(configs, { model: "root" });

  const rootStrategy = rootConfig?.strategy ?? { type: "nocache" };
  const savedStrategy = config?.strategy;

  const inheritsRootStrategy = savedStrategy === undefined;
  const strategy = savedStrategy ?? rootStrategy;
  const isBeingEdited = targetId === forId;

  const { hovered, ref: hoveredRef } = useHover<HTMLButtonElement>();

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
  return (
    <Flex
      w="100%"
      p="md"
      bg={color(forRoot ? "bg-medium" : "white")}
      justify="space-between"
      align="center"
      style={{
        border: forRoot ? undefined : `1px solid ${color("border")}`,
        borderRadius: ".5rem",
      }}
    >
      <Flex gap="0.5rem" color="text-medium" align="center">
        <FixedSizeIcon name={forRoot ? "star" : "database"} color="inherit" />
        <Title color="inherit" order={6}>
          {title}
        </Title>
      </Flex>
      <Tooltip
        position="bottom"
        disabled={!inheritsRootStrategy}
        label={t`Inheriting from default policy`}
      >
        <PolicyToken
          onClick={() => {
            if (targetId !== forId) {
              updateTargetId(forId, isFormDirty);
            }
          }}
          aria-label={ariaLabel}
          ref={hoveredRef}
          variant={buttonVariant}
          fw={forRoot || inheritsRootStrategy ? "normal" : "bold"}
          p="0.25rem .75rem"
          mah="3rem"
          styles={{
            root: {
              borderRadius: "7rem",
            },
          }}
        >
          <Flex wrap="nowrap" lh="1.5rem" gap=".5rem">
            {shortStrategyLabel}
          </Flex>
        </PolicyToken>
      </Tooltip>
    </Flex>
  );
};
