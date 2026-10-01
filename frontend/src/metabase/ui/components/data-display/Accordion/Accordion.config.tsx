import type { AccordionProps, MantineThemeComponent } from "@mantine/core";
import { Accordion } from "@mantine/core";

import { Icon } from "../../icons";

import AccordionStyles from "./Accordion.module.css";

const CHEVRON_SIZE = 12;

/**
 * A function, so that the theme holds no React element. Mantine deep-merges a
 * nested provider's theme into its parent's, and a React element keeps a
 * reference to the fiber that rendered it, which turns that merge into a walk
 * over the fiber tree.
 */
const getDefaultProps = (): Partial<AccordionProps> => ({
  variant: "separated",
  radius: "sm",
  chevron: <Icon name="chevrondown" size={CHEVRON_SIZE} aria-hidden />,
  chevronSize: CHEVRON_SIZE,
});

export const accordionOverrides = {
  Accordion: {
    ...Accordion.extend({
      classNames: {
        root: AccordionStyles.root,
        control: AccordionStyles.control,
        label: AccordionStyles.label,
        icon: AccordionStyles.icon,
        item: AccordionStyles.item,
        content: AccordionStyles.content,
        chevron: AccordionStyles.chevron,
        panel: AccordionStyles.panel,
      },
    }),
    defaultProps: getDefaultProps,
  } satisfies MantineThemeComponent,
};
