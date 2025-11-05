import { Accordion } from "@mantine/core";

import AccordionStyles from "./Accordion.module.css";

export const accordionOverrides = {
  Accordion: Accordion.extend({
    classNames: {
      control: AccordionStyles.control,
      label: AccordionStyles.label,
      item: AccordionStyles.item,
      content: AccordionStyles.content,
      chevron: AccordionStyles.chevron,
      panel: AccordionStyles.panel,
    },
  }),
};
