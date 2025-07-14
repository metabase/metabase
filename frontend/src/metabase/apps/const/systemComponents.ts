import {
  IconCarouselHorizontal,
  IconCarouselVertical,
  IconFavicon,
  IconH1,
  IconLetterT,
  IconList,
  IconSeparator,
  IconSquare,
} from "@tabler/icons-react";

import { Icons } from "metabase/ui";

export enum SystemComponentCategory {
  Typography = "typography",
  Layout = "layout",
  Data = "data",
}

export enum SystemComponentId {
  Title = "system:title",
  Text = "system:text",
  Icon = "system:icon",
  Group = "system:group",
  Stack = "system:stack",
  Divider = "system:divider",
  Card = "system:card",
  List = "system:list",
  Placeholder = "system:placeholder",
}

export type StyleVariable = {
  name: string;
  key: string;
  defaultValue: string | number | boolean;
  type: "string" | "number" | "boolean" | "color";
  options?: string[] | number[];
};

export type ComponentMetadata = {
  id: string;
  name: string;
  category: SystemComponentCategory;
  description: string;
  icon: React.ElementType;
  defaultValue?: string;
  styleVariables?: StyleVariable[];
  hasChildren?: boolean;
};

export const DEFAULT_SPACING = "md";
export const SPACING_OPTIONS = ["xs", "sm", "md", "lg", "xl"];
export const SPACING_OPTIONS_WITH_ZERO = ["0", ...SPACING_OPTIONS];

export const SYSTEM_COMPONENTS: ComponentMetadata[] = [
  {
    id: SystemComponentId.Title,
    name: "Title",
    category: SystemComponentCategory.Typography,
    description: "Display a heading",
    icon: IconH1,
    defaultValue: "Title",
    styleVariables: [
      {
        name: "Heading Level",
        key: "order",
        defaultValue: 1,
        type: "number",
        options: [1, 2, 3, 4, 5, 6],
      },
      {
        name: "Color",
        key: "color",
        defaultValue: "var(--mb-color-text-primary)",
        type: "color",
      },
    ],
  },
  {
    id: SystemComponentId.Text,
    name: "Text",
    category: SystemComponentCategory.Typography,
    description: "Display text value",
    icon: IconLetterT,
    defaultValue: "Text",
    styleVariables: [
      {
        name: "Size",
        key: "size",
        defaultValue: "md",
        type: "string",
        options: SPACING_OPTIONS,
      },
      {
        name: "Color",
        key: "color",
        defaultValue: "var(--mb-color-text-primary)",
        type: "color",
      },
      {
        name: "Bold",
        key: "bold",
        defaultValue: false,
        type: "boolean",
      },
      {
        name: "Italic",
        key: "italic",
        defaultValue: false,
        type: "boolean",
      },
      {
        name: "Underline",
        key: "underline",
        defaultValue: false,
        type: "boolean",
      },
    ],
  },
  {
    id: SystemComponentId.Icon,
    name: "Icon",
    category: SystemComponentCategory.Typography,
    description: "Display an icon",
    icon: IconFavicon,
    styleVariables: [
      {
        name: "Icon",
        key: "icon",
        defaultValue: "lock",
        type: "string",
        options: Object.keys(Icons),
      },
      {
        name: "Size",
        key: "size",
        defaultValue: "32",
        type: "number",
      },
      {
        name: "Color",
        key: "color",
        defaultValue: "var(--mb-color-text-primary)",
        type: "color",
      },
    ],
  },
  {
    id: SystemComponentId.Group,
    name: "Group",
    category: SystemComponentCategory.Layout,
    description: "Organize components by columns",
    icon: IconCarouselHorizontal,
    hasChildren: true,
    styleVariables: [
      {
        name: "Gap",
        key: "gap",
        defaultValue: "sm",
        type: "string",
        options: SPACING_OPTIONS_WITH_ZERO,
      },
      {
        name: "Padding",
        key: "padding",
        defaultValue: "0",
        type: "string",
        options: SPACING_OPTIONS_WITH_ZERO,
      },
    ],
  },
  {
    id: SystemComponentId.Stack,
    name: "Stack",
    category: SystemComponentCategory.Layout,
    description: "Organize components by rows",
    icon: IconCarouselVertical,
    hasChildren: true,
    styleVariables: [
      {
        name: "Gap",
        key: "gap",
        defaultValue: "sm",
        type: "string",
        options: SPACING_OPTIONS_WITH_ZERO,
      },
      {
        name: "Padding",
        key: "padding",
        defaultValue: "0",
        type: "string",
        options: SPACING_OPTIONS_WITH_ZERO,
      },
    ],
  },
  {
    id: SystemComponentId.Divider,
    name: "Divider",
    category: SystemComponentCategory.Layout,
    description: "Display a divider between components",
    icon: IconSeparator,
  },
  {
    id: SystemComponentId.Card,
    name: "Card",
    category: SystemComponentCategory.Data,
    description: "Organize data in a card",
    icon: IconSquare,
    hasChildren: true,
    styleVariables: [
      {
        name: "Background Color",
        key: "backgroundColor",
        defaultValue: "var(--mb-color-bg-primary)",
        type: "color",
      },
      {
        name: "Border Radius",
        key: "borderRadius",
        defaultValue: "sm",
        type: "string",
        options: SPACING_OPTIONS,
      },
      {
        name: "Padding",
        key: "padding",
        defaultValue: "md",
        type: "string",
        options: SPACING_OPTIONS_WITH_ZERO,
      },
    ],
  },
  {
    id: SystemComponentId.List,
    name: "List",
    category: SystemComponentCategory.Data,
    description: "Display components in a list",
    icon: IconList,
  },
];

export const SYSTEM_COMPONENTS_MAP: Record<string, ComponentMetadata> =
  Object.fromEntries(
    SYSTEM_COMPONENTS.map((component) => [component.id, component]),
  );

export const SYSTEM_COMPONENT_CATEGORIES = [
  {
    title: "Typography",
    components: Object.values(SYSTEM_COMPONENTS).filter(
      (component) => component.category === SystemComponentCategory.Typography,
    ),
  },
  {
    title: "Layout",
    components: Object.values(SYSTEM_COMPONENTS).filter(
      (component) => component.category === SystemComponentCategory.Layout,
    ),
  },
  {
    title: "Data",
    components: Object.values(SYSTEM_COMPONENTS).filter(
      (component) => component.category === SystemComponentCategory.Data,
    ),
  },
];
