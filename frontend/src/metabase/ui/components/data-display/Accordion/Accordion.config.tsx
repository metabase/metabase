import { Accordion } from "@mantine/core";

import { Icon } from "../../icons";

import AccordionStyles from "./Accordion.module.css";

const CHEVRON_SIZE = 12;

export const accordionOverrides = {
  Accordion: Accordion.extend({
    defaultProps: {
      variant: "separated",
      radius: "sm",
      chevron: <Icon name="chevrondown" size={CHEVRON_SIZE} />,
      chevronSize: CHEVRON_SIZE,
    },
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
};
