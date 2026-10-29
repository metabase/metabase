import { Card } from "@mantine/core";

import CardStyles from "./Card.module.css";

export const cardOverrides = {
  Card: Card.extend({
    defaultProps: {
      // Mantine's default is `padding: "md"`, which is 12px in the new scale.
      // Pin the padding to "lg" (16px) to preserve the previous default.
      padding: "lg",
      shadow: "xs",
    },
    classNames: {
      section: CardStyles.section,
    },
  }),
};
