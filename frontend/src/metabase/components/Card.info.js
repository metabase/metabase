import React from "react";
import Card from "metabase/components/Card";
export const component = Card;

export const description = `
A generic card component.
`;

const DemoContent = () => <div className="p4">Look, a card!</div>;

export const examples = {
  normal: (
    <Card>
      <DemoContent />
    </Card>
  ),
  dark: (
    <Card dark>
      <DemoContent />
    </Card>
  ),
  hoverable: (
    <Card hoverable>
      <DemoContent />
    </Card>
  ),
};
