import type { CSSProperties, ReactNode, Ref } from "react";

import type { ChecklistItemValue } from "metabase/redux/store";
import { Accordion, Icon, Stack } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { ChecklistAction } from "./ChecklistItemActions";
import { ChecklistItemActions } from "./ChecklistItemActions";
import S from "./Onboarding.module.css";

interface ChecklistItemProps {
  value: ChecklistItemValue;
  icon: IconName;
  label: string;
  itemRef?: Ref<HTMLDivElement>;
  /** Rendered below `children`. Omit for items that have no call to action. */
  actions?: ChecklistAction[];
  children: ReactNode;
}

export const ChecklistItem = ({
  value,
  icon,
  label,
  itemRef,
  actions = [],
  children,
}: ChecklistItemProps) => (
  <Accordion.Item value={value} data-testid={`${value}-item`} ref={itemRef}>
    <Accordion.Control icon={<Icon name={icon} />}>{label}</Accordion.Control>
    <Accordion.Panel>
      <Stack gap="lg">
        {children}
        {actions.length > 0 && (
          <ChecklistItemActions value={value} actions={actions} />
        )}
      </Stack>
    </Accordion.Panel>
  </Accordion.Item>
);

/**
 * Places an item's artwork within the frame `ChecklistMedia` draws. The numbers
 * are design pixels straight off the Figma inspector, against its 560x316
 * frame; `Onboarding.module.css` scales them to the rendered width.
 */
export type ChecklistImageStyles = CSSProperties & {
  /** Offset from the frame's top-left. */
  "--leaf-x"?: number;
  "--leaf-y"?: number;
  /** Size. Defaults fill the frame. */
  "--leaf-w"?: number;
  "--leaf-h"?: number;
  /** Block anchoring, for a leaf that hangs off the bottom rather than the top. */
  "--leaf-block-start"?: string;
  "--leaf-block-end"?: string;
  /** Shorthands, for a leaf drawn with a border, rounding, or elevation. */
  "--leaf-border"?: string;
  "--leaf-radius"?: string;
  "--leaf-shadow"?: string;
};

/**
 * The tinted frame every checklist illustration sits in. It supplies the
 * backdrop the artwork used to carry itself, which is what lets the page follow
 * the color scheme. Use it directly for inlined SVG art; raster screenshots go
 * through `ChecklistImage`.
 *
 * `style` places the artwork; omit it for art that fills the frame exactly.
 */
export const ChecklistMedia = ({
  style,
  children,
}: {
  style?: ChecklistImageStyles;
  children: ReactNode;
}) => (
  <div className={S.media} style={style}>
    {children}
  </div>
);

/**
 * A raster illustration from `resources/frontend_client/app/assets/img`, framed
 * by `ChecklistMedia`.
 */
export const ChecklistImage = ({
  alt,
  src,
  srcSet,
  style,
}: {
  alt: string;
  src: string;
  srcSet?: string;
  style?: ChecklistImageStyles;
}) => (
  <ChecklistMedia style={style}>
    <img alt={alt} src={src} srcSet={srcSet} />
  </ChecklistMedia>
);
