import type { StoryFn } from "@storybook/react-webpack5";

import { Ellipsified } from "./Ellipsified";

const testLabels = [
  "Short Title",
  "Long Title Wrapping to Next Line",
  "Very____________LongTitleWithNoSpaces",
  "Very Long Title With Spaces",
  "VeryLongTitleWithNoSpaces and more words",
  [1, 2, 3, 4, 5].map((i) => `${i}_VeryLongTitleWithNoSpaces`).join(" "),
];

export default {
  title: "Deprecated/Components/Ellipsified",
  component: Ellipsified,
};

const Template: StoryFn<typeof Ellipsified> = (args) => (
  <ul style={{ maxWidth: 100 }}>
    {testLabels.map((label: string) => (
      <li style={{ marginTop: 10 }} key={label}>
        <Ellipsified {...args}>{label}</Ellipsified>
      </li>
    ))}
  </ul>
);

export const SingleLineEllipsify = {
  render: Template,
  args: { lines: 1 },
};

export const MultiLineClamp = {
  render: Template,
  args: { lines: 8 },
};
