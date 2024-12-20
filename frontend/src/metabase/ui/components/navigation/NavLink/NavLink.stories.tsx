import type { NavLinkProps } from "@mantine/core";

import { Icon, NavLink } from "metabase/ui";

const args: Partial<NavLinkProps> = {
  label: "Label",
  disabled: false,
  leftSection: "icon",
  rightSection: null,
  mod: "inactive",
};

const argTypes = {
  leftSection: {
    control: "select",
    options: [null, "icon"],
    mapping: {
      null: null,
      icon: <Icon name="chevronright" size="10" />,
    },
  },
  rightSection: {
    control: "select",
    options: [null, "icon"],
    mapping: {
      null: null,
      icon: <Icon name="ai" />,
    },
  },
  mod: {
    control: "inline-radio",
    options: ["active", "inactive"],
    mapping: {
      active: { active: true },
      inactive: { active: false },
    },
  },
  variant: {
    control: "inline-radio",
    options: ["default", "mb-light"],
  },
};

export default {
  title: "Core/NavLink",
  component: NavLink,
  args,
  argTypes,
};

export const Default = {
  args: {
    variant: "default",
    mod: "inactive",
  },
};
export const DefaultActive = {
  args: {
    variant: "default",
    mod: "active",
  },
};

export const MBLightInactive = {
  args: {
    variant: "mb-light",
    mod: "inactive",
  },
};

export const MBLightActive = {
  args: {
    variant: "mb-light",
    mod: "active",
  },
};
