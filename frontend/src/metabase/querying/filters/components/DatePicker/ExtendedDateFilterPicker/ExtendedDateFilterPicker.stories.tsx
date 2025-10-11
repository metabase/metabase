import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import type { ExtendedDatePickerValue } from "metabase/querying/filters/types";

import { ExtendedDateFilterPicker } from "./ExtendedDateFilterPicker";

const meta: Meta<typeof ExtendedDateFilterPicker> = {
  title: "Components/ExtendedDateFilterPicker",
  component: ExtendedDateFilterPicker,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof ExtendedDateFilterPicker>;

function ExtendedDateFilterPickerDemo() {
  const [value, setValue] = useState<ExtendedDatePickerValue | undefined>();

  return (
    <div style={{ width: 800, height: 600 }}>
      <ExtendedDateFilterPicker value={value} onChange={setValue} />

      {value && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "#f5f5f5",
            borderRadius: 8,
          }}
        >
          <h4>Selected Filter:</h4>
          <pre>{JSON.stringify(value, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export const Default: Story = {
  render: () => <ExtendedDateFilterPickerDemo />,
};

export const ReadOnly: Story = {
  render: () => <ExtendedDateFilterPicker readOnly onChange={() => {}} />,
};
