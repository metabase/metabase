/* eslint-disable react/display-name */
import React from "react";
import type { StoryObj } from "@storybook/react";
import styled from "@emotion/styled";
import { Icon } from "./Icon";
import { iconNames } from "./icons";

export default {
  title: "Components/Icon",
  component: Icon,
};

type Story = StoryObj<typeof Icon>;

export const Default: Story = {
  render: () => (
    <div>
      {iconNames.map(icon => (
        <IconBlock key={icon}>
          <p>{icon}</p>
          <Icon name={icon} />
        </IconBlock>
      ))}
    </div>
  ),
};

const IconBlock = styled.div`
  display: inline-block;
  width: 100px;
  margin: 20px;

  text-align: center;
`;
