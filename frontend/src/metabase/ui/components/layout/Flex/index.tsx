import type { FlexProps as MantineFlexProps } from "@mantine/core";
import { Flex as MantineFlex } from "@mantine/core";

export type FlexProps = MantineFlexProps & {
  /** margin-inline-start */
  ms?: string;
  /** margin-inline-end */
  me?: string;
  /** padding-inline-start */
  ps?: string;
  /** padding-inline-end */
  pe?: string;
  /** alias for margin-inline-start, short for "Margin-Left but Direction-sensitive", */
  mld?: string;
  /** alias for margin-inline-end, short for "Margin-Right but Direction-sensitive", */
  mrd?: string;
  /** alias for padding-inline-start, short for "Padding-Left but Direction-sensitive", */
  pld?: string;
  /** alias for padding-inline-end, short for "Padding-Right but Direction-sensitive", */
  prd?: string;
};

export const Flex = (props: FlexProps) => {
  return (
    <MantineFlex
      {...props}
      style={{
        marginInlineStart: props.ms ?? props.mld,
        marginInlineEnd: props.me ?? props.mrd,
        paddingInlineStart: props.ps ?? props.pld,
        paddingInlineEnd: props.pe ?? props.prd,
        ...props.style,
      }}
    />
  );
};

export type FlexComponent = typeof Flex;
