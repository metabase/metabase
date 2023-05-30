import React from "react";
import type { ComponentStory } from "@storybook/react";

import { Icon } from "metabase/core/components/Icon";
import { TokenFieldItem, TokenFieldAddon } from "./TokenFieldItem.styled";

export default {
  title: "Core/TokenFieldItem",
  component: TokenFieldItem,
};

const Wrapper = ({ children }: { children: JSX.Element | JSX.Element[] }) => (
  <div style={{ display: "flex", flexWrap: "wrap", maxWidth: 400 }}>
    {children}
  </div>
);

const Template: ComponentStory<typeof TokenFieldItem> = args => {
  return (
    <Wrapper>
      <TokenFieldItem {...args} />
    </Wrapper>
  );
};

const ManyTemplate: ComponentStory<typeof TokenFieldItem> = args => {
  return (
    <Wrapper>
      <TokenFieldItem {...args}> {`${args.children} 1`} </TokenFieldItem>
      <TokenFieldItem {...args}> {`${args.children} 2`} </TokenFieldItem>
      <TokenFieldItem {...args}> {`${args.children} 3`} </TokenFieldItem>
      <TokenFieldItem {...args}> {`${args.children} 4`} </TokenFieldItem>
      <TokenFieldItem {...args}> {`${args.children} 5`} </TokenFieldItem>
    </Wrapper>
  );
};

const AddonTemplate: ComponentStory<typeof TokenFieldItem> = args => {
  return (
    <Wrapper>
      <TokenFieldItem isValid={args.isValid}>
        {args.children}
        <TokenFieldAddon isValid={args.isValid}>
          <Icon name="close" className="flex align-center" size={12} />
        </TokenFieldAddon>
      </TokenFieldItem>
    </Wrapper>
  );
};

export const Default = Template.bind({});
export const Many = ManyTemplate.bind({});
export const WithAddon = AddonTemplate.bind({});

Default.args = {
  isValid: true,
  children: "Token Item Value",
};

Many.args = {
  isValid: true,
  children: "Token Item Value",
};

WithAddon.args = {
  isValid: true,
  children: "Token Item Value",
};
