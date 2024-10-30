import Markdown from "metabase/core/components/Markdown";
import { Flex, type FlexProps } from "metabase/ui";

export const Banner = ({ children, ...props }: FlexProps) => {
  const content =
    typeof children === "string" ? <Markdown>{children}</Markdown> : children;

  return (
    <Flex
      bg="bg-light"
      c="text-medium"
      data-testid="app-banner"
      p="0.75rem"
      {...props}
    >
      {content}
    </Flex>
  );
};
