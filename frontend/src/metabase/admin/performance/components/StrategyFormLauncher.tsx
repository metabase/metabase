import { useState } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { color } from "metabase/lib/colors";
import { FixedSizeIcon, Flex, Title, Tooltip } from "metabase/ui";

import { rootId } from "../constants";
import type { Config, SafelyUpdateTargetId } from "../types";
import { getShortStrategyLabel } from "../types";

import { PolicyToken } from "./StrategyEditorForDatabases.styled";

export const StrategyFormLauncher = ({
  forId,
  targetId,
  title,
  safelyUpdateTargetId,
  configs,
  isFormDirty,
}: {
  forId: number;
  targetId: number | null;
  title: string;
  safelyUpdateTargetId: SafelyUpdateTargetId;
  configs: Config[];
  isFormDirty: boolean;
}) => {
  const forRoot = forId === rootId;

  const config = findWhere(configs, { model_id: forId });
  const rootConfig = findWhere(configs, { model: "root" });

  const rootStrategy = rootConfig?.strategy;
  const savedStrategy = config?.strategy;

  const inheritsRootStrategy = savedStrategy === undefined;
  const strategy = savedStrategy ?? rootStrategy;
  const isBeingEdited = targetId === forId;

  const [hovered, setHovered] = useState(false);
  const buttonVariant =
    isBeingEdited || hovered
      ? "filled"
      : inheritsRootStrategy || forRoot
      ? "white"
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
      bg={forRoot ? color("bg-medium") : color("white")}
      justify="space-between"
      align="center"
      style={{
        border: `1px solid ${color(forRoot ? "bg-medium" : "border")}`,
        borderRadius: ".5rem",
      }}
    >
      <Flex gap="0.5rem" color="text-medium" align="center">
        <FixedSizeIcon name={forRoot ? "star" : "database"} color="inherit" />
        <Title color="inherit" order={5}>
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
              safelyUpdateTargetId(forId, isFormDirty);
            }
          }}
          aria-label={ariaLabel}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          variant={buttonVariant}
          fw={inheritsRootStrategy ? "normal" : "bold"}
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
