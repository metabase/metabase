import cx from "classnames";
import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import { Card, Flex } from "metabase/ui";

import S from "./HomeCard.module.css";

interface HomeCardProps {
  className?: string;
  url?: string;
  external?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

export const HomeCard = ({
  className,
  url = "",
  children,
  onClick,
}: HomeCardProps): JSX.Element => {
  return (
    <Card
      component={Link}
      className={cx(S.root, className)}
      to={url}
      onClick={onClick}
      bg="background_page-primary"
      maw={{ base: "100%", sm: "50%" }}
      p={{ base: "lg", lg: "xl" }}
      radius="sm"
      withBorder
    >
      <Flex align="center">{children}</Flex>
    </Card>
  );
};
