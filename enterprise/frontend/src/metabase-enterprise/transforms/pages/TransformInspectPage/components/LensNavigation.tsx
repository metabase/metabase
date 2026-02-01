import { t } from "ttag";

import {
  Box,
  Divider,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";

import type { LensRef } from "../types";

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

type NavigationCardProps = {
  label: string;
  isActive?: boolean;
  onClick: () => void;
};

const NavigationCard = ({
  label,
  isActive = false,
  onClick,
}: NavigationCardProps) => (
  <UnstyledButton onClick={onClick} w="100%">
    <Box
      p="sm"
      style={{
        borderRadius: "var(--mantine-radius-sm)",
        border: isActive
          ? "1px solid var(--mb-color-brand)"
          : "1px solid var(--mb-color-border)",
        backgroundColor: isActive
          ? "var(--mb-color-brand-lighter)"
          : "var(--mb-color-bg-white)",
        cursor: "pointer",
      }}
    >
      <Text
        size="sm"
        fw={isActive ? 600 : 400}
        c={isActive ? "brand" : undefined}
      >
        {label}
      </Text>
    </Box>
  </UnstyledButton>
);

const areLensRefsEqual = (a: LensRef, b: LensRef): boolean => {
  if (a.id !== b.id) {
    return false;
  }
  const aParams = a.params ?? {};
  const bParams = b.params ?? {};
  const aKeys = Object.keys(aParams);
  const bKeys = Object.keys(bParams);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => aParams[key] === bParams[key]);
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
      {canZoomOut && (
        <>
          <Stack gap="xs">
            <NavigationCard label={`← ${t`Zoom Out`}`} onClick={onZoomOut} />
            {parentLenses.length > 0 && (
              <Stack gap="xs">
                {parentLenses.map((lensRef, index) => (
                  <NavigationCard
                    key={`${lensRef.id}-${index}`}
                    label={lensRef.title}
                    onClick={() => onSelectParentLens(lensRef)}
                  />
                ))}
              </Stack>
            )}
          </Stack>
          <Divider />
        </>
      )}

      {siblingLenses.length > 0 && (
        <Stack gap="xs">
          <Stack gap="xs">
            {siblingLenses.map((lensRef, index) => (
              <NavigationCard
                key={`${lensRef.id}-${index}`}
                label={lensRef.title}
                isActive={areLensRefsEqual(lensRef, currentLensRef)}
                onClick={() => onSelectLens(lensRef)}
              />
            ))}
          </Stack>
        </Stack>
      )}

      {drillLenses.length > 0 && (
        <>
          <Divider />
          <Stack gap="xs">
            <Text size="sm" fw={600} c="text-secondary">
              {t`Inspect more`}
            </Text>
            <Stack gap="xs">
              {drillLenses.map((lensRef, index) => (
                <NavigationCard
                  key={`${lensRef.id}-${index}`}
                  label={lensRef.title}
                  onClick={() => onDrill(lensRef)}
                />
              ))}
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  </Paper>
);
