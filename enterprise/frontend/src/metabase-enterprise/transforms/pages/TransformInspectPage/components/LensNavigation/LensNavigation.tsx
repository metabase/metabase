import { t } from "ttag";
import _ from "underscore";

import { Divider, Paper, Stack, Text, Title } from "metabase/ui";

import type { LensRef } from "../../types";

import { LensNavigationCard } from "./LensNavigationCard";

type LensNavigationProps = {
  currentLensRef: LensRef;
  parentLenses: LensRef[];
  siblingLenses: LensRef[];
  drillLenses: LensRef[];
  canZoomOut: boolean;
  onZoomOut: () => void;
  onSelectLens: (lensRef: LensRef) => void;
  onSelectParentLens: (lensRef: LensRef) => void;
  onDrill: (lensRef: LensRef) => void;
};

export const LensNavigation = ({
  currentLensRef,
  parentLenses,
  siblingLenses,
  drillLenses,
  canZoomOut,
  onZoomOut,
  onSelectLens,
  onSelectParentLens,
  onDrill,
}: LensNavigationProps) => (
  <Paper
    w={200}
    p="md"
    pos="sticky"
    top="1rem"
    radius="md"
    withBorder
    style={{ alignSelf: "flex-start" }}
  >
    <Stack gap="md">
      <Title order={4}>{t`Available lenses`}</Title>
      {parentLenses.length > 0 && (
        <>
          <Stack gap="sm">
            {parentLenses.map((lensRef, index) => (
              <LensNavigationCard
                key={`${lensRef.id}-${index}`}
                label={lensRef.title}
                onClick={() => onSelectParentLens(lensRef)}
              />
            ))}
          </Stack>
          <Divider />
        </>
      )}

      {siblingLenses.length > 0 && (
        <Stack gap="sm">
          {canZoomOut && (
            <LensNavigationCard
              label={`← ${t`Zoom Out`}`}
              onClick={onZoomOut}
            />
          )}
          {siblingLenses.map((lensRef, index) => (
            <LensNavigationCard
              key={`${lensRef.id}-${index}`}
              label={lensRef.title}
              isActive={_.isEqual(lensRef, currentLensRef)}
              onClick={() => onSelectLens(lensRef)}
            />
          ))}
        </Stack>
      )}

      {drillLenses.length > 0 && (
        <>
          <Divider />
          <Stack gap="sm">
            <Text size="sm" fw={600} c="text-secondary">
              {t`Inspect more`}
            </Text>
            {drillLenses.map((lensRef, index) => (
              <LensNavigationCard
                key={`${lensRef.id}-${index}`}
                label={lensRef.title}
                onClick={() => onDrill(lensRef)}
              />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  </Paper>
);
