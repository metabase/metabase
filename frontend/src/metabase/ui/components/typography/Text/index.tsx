import type { TextProps } from "@mantine/core";
import { Text as MantineText } from "@mantine/core";

export const Text = (
  props: TextProps & {
    /** padding-inline-start */
    pins?: string;
    /** padding-inline-end */
    pine?: string;
    /** margin-inline-start */
    mins?: string;
    /** margin-inline-end */
    mine?: string;
  },
) => {
  return (
    <MantineText
      {...props}
      style={{
        paddingInlineStart: props.pins,
        paddingInlineEnd: props.pine,
        marginInlineStart: props.mins,
        marginInlineEnd: props.mine,
      }}
    />
  );
};

export type TextComponent = typeof Text;
export type { TextProps } from "@mantine/core";
export { getTextOverrides } from "./Text.styled";
