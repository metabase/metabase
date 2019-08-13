import React from "react";
import ButtonBar from "metabase/components/ButtonBar";
import Button from "metabase/components/Button";

export const component = ButtonBar;

export const description = `
ButtonBar is a layout with left, right, and center sections
`;

export const examples = {
  default: (
    <ButtonBar>
      <Button>Button</Button>
    </ButtonBar>
  ),
  "left and right": (
    <ButtonBar left={<Button>Left</Button>} right={<Button>Right</Button>} />
  ),
  "left, right, and center": (
    <ButtonBar
      left={<Button>Left</Button>}
      center={<Button>Center</Button>}
      right={<Button>Right</Button>}
    />
  ),
};
