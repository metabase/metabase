import React, { ReactElement } from "react";
import { Group } from "@visx/group";
import { Text } from "@visx/text";
import { ICON_SIZE, ICON_MARGIN, LAYOUT } from "./constants";
import { t } from "ttag";
import NoResultsIconUrl from "assets/img/no_results.svg";

const NoResults = (): ReactElement => {
  const innerWidth = LAYOUT.width - LAYOUT.margin * 2;
  const innerHeight = LAYOUT.height - LAYOUT.margin * 2;
  const centerX = LAYOUT.margin + innerWidth / 2;
  const centerY = LAYOUT.margin + innerHeight / 2;
  const iconPositionY = centerY - (ICON_SIZE * 2) / 3;

  return (
    <svg width={LAYOUT.width} height={LAYOUT.height}>
      <image
        x={centerX - ICON_SIZE / 2}
        y={iconPositionY}
        width={ICON_SIZE}
        height={ICON_SIZE}
        href={NoResultsIconUrl}
      />
      <Group top={iconPositionY + ICON_SIZE + ICON_MARGIN} left={centerX}>
        <Text
          color={LAYOUT.color}
          fill={LAYOUT.color}
          fontFamily={LAYOUT.font.family}
          fontSize={LAYOUT.font.size}
          fontStyle="normal"
          fontWeight={LAYOUT.font.weight}
          textAnchor="middle"
          verticalAnchor="middle"
        >
          {t`No results!`}
        </Text>
      </Group>
    </svg>
  );
};

export default NoResults;
