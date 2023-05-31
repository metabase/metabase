/* eslint-disable react/display-name */
import type { StoryObj } from "@storybook/react";
import styled from "@emotion/styled";
import { ICON_PATHS } from "metabase/icon_paths";
import Icon from "./Icon";

export default {
  title: "Components/Icon",
  component: Icon,
};

type Story = StoryObj<typeof Icon>;

export const Default: Story = {
  render: () => (
    <div>
      {Object.keys(ICON_PATHS).map(icon => (
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
