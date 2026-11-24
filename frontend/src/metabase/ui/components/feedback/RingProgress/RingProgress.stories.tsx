import { RingProgress } from "./";

const args = {
  size: 120,
  thickness: 12,
  roundCaps: false,
};

const argTypes = {
  size: { control: { type: "number" } },
  thickness: { control: { type: "number" } },
  roundCaps: { control: { type: "boolean" } },
};

export default {
  title: "Components/Feedback/RingProgress",
  component: RingProgress,
  args,
  argTypes,
};

export const Default = {
  args: {
    sections: [{ value: 40, color: "core-brand" }],
  },
};

export const WithLabel = {
  args: {
    sections: [{ value: 72, color: "core-brand" }],
    label: "72%",
  },
};

export const Small = {
  args: {
    size: 14,
    thickness: 2.5,
    sections: [{ value: 90, color: "core-brand" }],
  },
};

export const MultipleSections = {
  args: {
    sections: [
      { value: 40, color: "core-brand" },
      { value: 20, color: "feedback-warning" },
      { value: 15, color: "feedback-negative" },
    ],
  },
};
