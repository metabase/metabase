import type { ReactNode, Ref } from "react";

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
  itemRef: Ref<HTMLDivElement>;
  /** Rendered below `children`. Omit for items that have no call to action. */
  actions?: ChecklistAction[];
  children: ReactNode;
}

export const ChecklistItem = ({
  value,
  icon,
  label,
  itemRef,
  actions,
  children,
}: ChecklistItemProps) => (
  <Accordion.Item value={value} data-testid={`${value}-item`} ref={itemRef}>
    <Accordion.Control icon={<Icon name={icon} />}>{label}</Accordion.Control>
    <Accordion.Panel>
      <Stack gap="lg">
        {children}
        {actions?.length ? (
          <ChecklistItemActions value={value} actions={actions} />
        ) : null}
      </Stack>
    </Accordion.Panel>
  </Accordion.Item>
);

/** Renders an illustration from `resources/frontend_client/app/assets/img`. */
export const ChecklistImage = ({
  alt,
  src,
  srcSet,
}: {
  alt: string;
  src: string;
  srcSet?: string;
}) => (
  <img
    alt={alt}
    className={S.image}
    loading="lazy"
    src={src}
    srcSet={srcSet}
    width="100%"
  />
);
