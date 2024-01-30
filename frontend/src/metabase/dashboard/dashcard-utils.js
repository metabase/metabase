import { createCard } from "metabase/lib/card";

export function createHeadingDashcard(attrs) {
  const headingVirtualCard = {
    ...createCard(),
    display: "heading",
    archived: false,
  };
  return {
    ...attrs,
    card: headingVirtualCard,
    visualization_settings: {
      virtual_card: headingVirtualCard,
      "dashcard.background": false,
    },
  };
}

export function createPlaceholderDashCard(attrs) {
  const placeholderVirtualCard = {
    ...createCard(),
    display: "placeholder",
    archived: false,
  };
  return {
    ...attrs,
    card: placeholderVirtualCard,
    visualization_settings: {
      virtual_card: placeholderVirtualCard,
    },
  };
}
