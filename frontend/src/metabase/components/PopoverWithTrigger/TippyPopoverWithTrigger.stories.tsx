import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import TippyPopoverWithTrigger from "./TippyPopoverWithTrigger";

export default {
  title: "Core/TippyPopoverWithTrigger",
  component: TippyPopoverWithTrigger,
};

const Template: ComponentStory<typeof TippyPopoverWithTrigger> = args => {
  return <TippyPopoverWithTrigger {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  triggerContent: "Click me",
  popoverContent: "I am a popover",
};

export function NestedPopover() {
  return (
    <div>
      <TippyPopoverWithTrigger
        triggerContent="Click me"
        popoverContent={
          <TippyPopoverWithTrigger
            triggerContent="open another popover"
            popoverContent={
              <TippyPopoverWithTrigger
                triggerContent="open another nested popover"
                popoverContent="I am a nested popover"
              />
            }
          />
        }
      />
      <span className="ml3">
        <TippyPopoverWithTrigger
          triggerContent="Click me"
          popoverContent={
            <TippyPopoverWithTrigger
              triggerContent="open another popover"
              popoverContent={
                <TippyPopoverWithTrigger
                  triggerContent="open another nested popover"
                  popoverContent="I am a nested popover"
                />
              }
            />
          }
        />
      </span>
    </div>
  );
}
