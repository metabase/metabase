import { Flex, type FlexProps } from "metabase/ui";

interface IconBorderProps extends FlexProps {
  borderWidth?: number;
  borderStyle?: React.CSSProperties["borderStyle"];
  borderColor?: React.CSSProperties["borderColor"];
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactElement<{
    size?: number | string;
    width?: number | string;
  }>;
}

export function IconBorder({
  borderWidth = 1,
  borderStyle = "solid",
  borderColor = "currentcolor",
  className,
  children,
  ...rest
}: IconBorderProps) {
  const size =
    parseInt(String(children.props.size || children.props.width), 10) * 2;

  return (
    <Flex
      align="center"
      justify="center"
      bdrs="99px"
      bd={`${borderWidth}px ${borderStyle} ${borderColor}`}
      w={size}
      h={size}
      className={className}
      {...rest}
    >
      {children}
    </Flex>
  );
}
