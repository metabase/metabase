import type { StoryFn } from "@storybook/react-webpack5";
import cx from "classnames";
import type { ComponentProps } from "react";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import { TokenFieldAddon, TokenFieldItem } from "./TokenFieldItem.styled";

export default {
  title: "Components/Ask Before Using/TokenFieldItem",
  component: TokenFieldItem,
};

const Wrapper = ({ children }: { children: JSX.Element | JSX.Element[] }) => (
  <div style={{ display: "flex", flexWrap: "wrap", maxWidth: 400 }}>
    {children}
  </div>
);

const Template: StoryFn<ComponentProps<typeof TokenFieldItem>> = (args) => {
  return (
    <Wrapper>
      <TokenFieldItem {...args} />
    </Wrapper>
  );
};

const ManyTemplate: StoryFn<ComponentProps<typeof TokenFieldItem>> = (args) => {
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

const AddonTemplate: StoryFn<ComponentProps<typeof TokenFieldItem>> = (
  args,
) => {
  return (
    <Wrapper>
      <TokenFieldItem isValid={args.isValid}>
        {args.children}
        <TokenFieldAddon isValid={args.isValid}>
          <Icon
            name="close"
            className={cx(CS.flex, CS.alignCenter)}
            size={12}
          />
        </TokenFieldAddon>
      </TokenFieldItem>
    </Wrapper>
  );
};

export const Default = {
  render: Template,

  args: {
    isValid: true,
    children: "Token Item Value",
  },
};

export const Many = {
  render: ManyTemplate,

  args: {
    isValid: true,
    children: "Token Item Value",
  },
};

export const WithAddon = {
  render: AddonTemplate,

  args: {
    isValid: true,
    children: "Token Item Value",
  },
};
