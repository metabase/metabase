import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import type { IconModel } from "metabase/common/utils/icon";
import type { useGetIcon } from "metabase/hooks/use-icon";
import { Box, type BoxProps } from "metabase/ui";
import type {
  CardType,
  ContentDiagnosticsBaseFinding,
} from "metabase-types/api";

import { getEntityTypeLabel } from "./utils";

const CARD_MODELS = {
  question: "card",
  model: "dataset",
  metric: "metric",
} satisfies Record<CardType, IconModel>;

type DiagnosticsEntityIconProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children"
> &
  Pick<BoxProps, "mx"> & {
    entity: Pick<
      ContentDiagnosticsBaseFinding,
      "entity_type" | "card_type" | "display"
    >;
    getIcon: ReturnType<typeof useGetIcon>;
  };

export const DiagnosticsEntityIcon = forwardRef<
  HTMLSpanElement,
  DiagnosticsEntityIconProps
>(function DiagnosticsEntityIcon({ entity, getIcon, ...props }, ref) {
  const model =
    entity.entity_type === "card"
      ? CARD_MODELS[entity.card_type ?? "question"]
      : entity.entity_type;
  const label = getEntityTypeLabel(entity);

  return (
    <Box
      component="span"
      display="inline-flex"
      flex="0 0 auto"
      ref={ref}
      {...props}
    >
      <EntityIcon
        {...getIcon({ model, display: entity.display })}
        aria-label={label}
        alt={label}
      />
    </Box>
  );
});
